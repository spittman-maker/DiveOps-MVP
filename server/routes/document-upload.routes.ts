/**
 * Document Upload Routes — DiveOps Document Ingestion Pipeline
 * =============================================================
 * Provides multipart file upload endpoints for:
 *   - POST /api/documents/upload       — general document upload + parse
 *   - POST /api/library/upload         — reference library document upload (GOD only)
 *   - POST /api/projects/:projectId/sops/upload — SOP document upload
 *
 * Pipeline:
 *   1. Validate file type and size (multer middleware)
 *   2. Upload to Azure Blob Storage
 *   3. Create parsedDocuments record (status: "processing")
 *   4. Parse document text via document-parser service
 *   5. Update record with extracted text, structured data, page count
 *   6. Index in Azure Search for RAG retrieval (if configured)
 *   7. Emit audit events
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { upload, getFileType } from "../middleware/upload";
import { requireRole, requireAuth } from "../auth";
import { requireProjectAccess } from "../authz";
import { uploadBlob } from "../services/blob-storage";
import { parseDocument, extractStructuredData } from "../services/document-parser";
import { uploadDocuments as indexDocuments } from "../services/azure-search";
import { storage, db } from "../storage";
import * as schema from "@shared/schema";
import type { User } from "@shared/schema";
import { generateCorrelationId, emitAuditEvent, type AuditContext } from "../audit";
import logger from "../logger";

// ── Helpers ───────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Generate a unique blob name with timestamp prefix to avoid collisions.
 */
function generateBlobName(originalName: string, prefix: string = "documents"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${timestamp}-${random}-${safeName}`;
}

/**
 * Build audit context from request.
 */
function buildAuditCtx(req: Request): AuditContext {
  const user = getUser(req);
  return {
    correlationId: req.correlationId || generateCorrelationId(),
    userId: user.id,
    userRole: user.role,
    companyId: user.companyId || undefined,
    ipAddress: req.ip || req.socket?.remoteAddress,
  };
}

/**
 * Determine the content type for blob storage from file MIME type.
 */
function getContentType(file: Express.Multer.File): string {
  return file.mimetype || "application/octet-stream";
}

// ── Async Document Processing Pipeline ────────────────────────────

/**
 * Process a document asynchronously after upload:
 *   1. Parse the document text
 *   2. Update the parsedDocuments record
 *   3. Index in Azure Search (if configured)
 */
async function processDocumentAsync(
  parsedDocId: number,
  buffer: Buffer,
  fileName: string,
  fileType: string,
  auditCtx: AuditContext,
  projectId?: string
): Promise<void> {
  try {
    // Update status to processing
    await db
      .update(schema.parsedDocuments)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(schema.parsedDocuments.id, parsedDocId));

    // Parse the document
    const parseResult = await parseDocument(buffer, fileName, fileType);

    // Attempt structured data extraction (non-fatal if it fails)
    let structuredData: Record<string, any> | null = null;
    try {
      structuredData = await extractStructuredData(
        parseResult.text,
        `File: ${fileName}, Type: ${fileType}`
      ) as any;
    } catch (err) {
      logger.warn({ err, fileName }, "Structured data extraction failed, continuing with text only");
    }

    // Update the parsedDocuments record with results
    await db
      .update(schema.parsedDocuments)
      .set({
        status: "completed",
        extractedText: parseResult.text,
        structuredData: structuredData,
        pageCount: parseResult.pageCount || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.parsedDocuments.id, parsedDocId));

    // Index in Azure Search for RAG retrieval (if configured)
    try {
      const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
      const searchKey = process.env.AZURE_SEARCH_ADMIN_KEY;
      if (searchEndpoint && searchKey && parseResult.text) {
        await indexDocuments("diveops-knowledge-index", [
          {
            id: `parsed-doc-${parsedDocId}`,
            content: parseResult.text,
            title: fileName,
            sourceDocument: fileName,
            documentType: fileType,
            product: "diveops",
            clientId: undefined,
          },
        ]);
        logger.info({ parsedDocId, fileName }, "Document indexed in Azure Search");
      }
    } catch (err) {
      logger.warn({ err, parsedDocId }, "Azure Search indexing failed (non-fatal)");
    }

    // Emit success audit event
    emitAuditEvent(auditCtx, "document.parse_complete", {
      targetId: String(parsedDocId),
      targetType: "parsed_document",
      after: {
        fileName,
        fileType,
        pageCount: parseResult.pageCount,
        textLength: parseResult.text?.length || 0,
        projectId,
      },
    }).catch(() => {});

    logger.info({ parsedDocId, fileName, pageCount: parseResult.pageCount }, "Document processing completed");
  } catch (err: any) {
    logger.error({ err, parsedDocId, fileName }, "Document processing failed");

    // Update record with failure status
    await db
      .update(schema.parsedDocuments)
      .set({
        status: "failed",
        errorMessage: err.message || "Unknown parsing error",
        updatedAt: new Date(),
      })
      .where(eq(schema.parsedDocuments.id, parsedDocId))
      .catch((dbErr) => {
        logger.error({ dbErr, parsedDocId }, "Failed to update parsedDocument status to failed");
      });

    // Emit failure audit event
    emitAuditEvent(auditCtx, "document.parse_failed", {
      targetId: String(parsedDocId),
      targetType: "parsed_document",
      metadata: { error: err.message, fileName, fileType },
    }).catch(() => {});
  }
}

// ── Multer error handler ──────────────────────────────────────────

function handleMulterError(err: any, res: Response): boolean {
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        message: "File too large. Maximum file size is 50 MB.",
        code: "FILE_TOO_LARGE",
      });
      return true;
    }
    if (err.message?.includes("Unsupported file type")) {
      res.status(400).json({
        message: err.message,
        code: "UNSUPPORTED_FILE_TYPE",
      });
      return true;
    }
    res.status(400).json({
      message: err.message || "File upload failed",
      code: "UPLOAD_ERROR",
    });
    return true;
  }
  return false;
}

// ── Route Registration ────────────────────────────────────────────

export function registerDocumentUploadRoutes(app: Express): void {
  // ────────────────────────────────────────────────────────────────
  // POST /api/documents/upload
  // General document upload — stores in blob, creates parsedDocument,
  // triggers async parsing pipeline.
  // Roles: SUPERVISOR, ADMIN, GOD
  // ────────────────────────────────────────────────────────────────

  app.post(
    "/api/documents/upload",
    requireRole("SUPERVISOR", "ADMIN", "GOD"),
    (req: Request, res: Response, next) => {
      upload.single("file")(req, res, (err) => {
        if (handleMulterError(err, res)) return;
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "No file provided", code: "NO_FILE" });
        }

        const user = getUser(req);
        const auditCtx = buildAuditCtx(req);
        const projectId = req.body.projectId || null;
        const fileType = getFileType(file);
        const blobName = generateBlobName(file.originalname, "documents");

        // Step 1: Upload to Azure Blob Storage
        let blobUrl: string | null = null;
        try {
          const blobResult = await uploadBlob(blobName, file.buffer, {
            contentType: getContentType(file),
            metadata: {
              uploadedBy: user.id,
              originalName: file.originalname,
              fileType,
            },
          });
          blobUrl = blobResult.url;
        } catch (err: any) {
          logger.error({ err, fileName: file.originalname }, "Blob storage upload failed");
          return res.status(502).json({
            message: "File storage service unavailable. Please try again later.",
            code: "BLOB_STORAGE_ERROR",
          });
        }

        // Step 2: Create parsedDocuments record
        const [parsedDoc] = await db
          .insert(schema.parsedDocuments)
          .values({
            projectId,
            fileName: file.originalname,
            fileType,
            blobUrl,
            status: "processing",
            uploadedBy: user.id,
          })
          .returning();

        // Step 3: Emit upload audit event
        emitAuditEvent(auditCtx, "document.upload", {
          targetId: String(parsedDoc.id),
          targetType: "parsed_document",
          after: {
            fileName: file.originalname,
            fileType,
            fileSize: file.size,
            blobUrl,
            projectId,
          },
        }).catch(() => {});

        // Step 4: Trigger async processing (don't await — return immediately)
        processDocumentAsync(
          parsedDoc.id,
          file.buffer,
          file.originalname,
          fileType,
          auditCtx,
          projectId
        ).catch((err) => {
          logger.error({ err, parsedDocId: parsedDoc.id }, "Unhandled error in document processing");
        });

        // Return immediately with the document record
        res.status(201).json({
          id: parsedDoc.id,
          fileName: parsedDoc.fileName,
          fileType: parsedDoc.fileType,
          status: parsedDoc.status,
          blobUrl: parsedDoc.blobUrl,
          projectId: parsedDoc.projectId,
          uploadedBy: parsedDoc.uploadedBy,
          createdAt: parsedDoc.createdAt,
          message: "Document uploaded successfully. Processing started.",
        });
      } catch (err: any) {
        logger.error({ err }, "Document upload failed");
        res.status(500).json({ message: "Document upload failed", code: "INTERNAL_ERROR" });
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // POST /api/library/upload
  // Reference library document upload (Navy Dive Manual, EM 385, etc.)
  // Roles: GOD only
  // ────────────────────────────────────────────────────────────────

  app.post(
    "/api/library/upload",
    requireRole("GOD"),
    (req: Request, res: Response, next) => {
      upload.single("file")(req, res, (err) => {
        if (handleMulterError(err, res)) return;
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "No file provided", code: "NO_FILE" });
        }

        const user = getUser(req);
        const auditCtx = buildAuditCtx(req);
        const title = req.body.title || file.originalname;
        const docType = req.body.docType || "company_manual";
        const projectId = req.body.projectId || null;
        const fileType = getFileType(file);
        const blobName = generateBlobName(file.originalname, "library");

        // Validate docType
        const validDocTypes = ["navy_diving_manual", "em_385", "company_manual", "project_doc"];
        if (!validDocTypes.includes(docType)) {
          return res.status(400).json({
            message: `Invalid docType. Must be one of: ${validDocTypes.join(", ")}`,
            code: "INVALID_DOC_TYPE",
          });
        }

        // Step 1: Upload to Azure Blob Storage
        let blobUrl: string | null = null;
        try {
          const blobResult = await uploadBlob(blobName, file.buffer, {
            contentType: getContentType(file),
            metadata: {
              uploadedBy: user.id,
              originalName: file.originalname,
              docType,
            },
          });
          blobUrl = blobResult.url;
        } catch (err: any) {
          logger.error({ err, fileName: file.originalname }, "Blob storage upload failed for library doc");
          return res.status(502).json({
            message: "File storage service unavailable. Please try again later.",
            code: "BLOB_STORAGE_ERROR",
          });
        }

        // Step 2: Parse the document to extract text content
        let content = "";
        let pageCount: number | undefined;
        try {
          const parseResult = await parseDocument(file.buffer, file.originalname, fileType);
          content = parseResult.text;
          pageCount = parseResult.pageCount;
        } catch (err: any) {
          logger.warn({ err, fileName: file.originalname }, "Document parsing failed for library doc, storing with empty content");
        }

        // Step 3: Create library document record
        const libraryDoc = await storage.createLibraryDocument({
          title,
          docType: docType as "navy_diving_manual" | "em_385" | "company_manual" | "project_doc",
          projectId,
          content,
          metadata: {
            blobUrl,
            originalFileName: file.originalname,
            fileType,
            fileSize: file.size,
            pageCount,
          },
          locked: req.body.locked === true || req.body.locked === "true",
          uploadedBy: user.id,
        });

        // Step 4: Create a parsedDocuments record for tracking
        const [parsedDoc] = await db
          .insert(schema.parsedDocuments)
          .values({
            projectId,
            fileName: file.originalname,
            fileType,
            blobUrl,
            status: content ? "completed" : "failed",
            extractedText: content || null,
            pageCount: pageCount || null,
            errorMessage: content ? null : "Parsing returned empty content",
            uploadedBy: user.id,
          })
          .returning();

        // Step 5: Index in Azure Search (if configured and content available)
        if (content) {
          try {
            const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
            const searchKey = process.env.AZURE_SEARCH_ADMIN_KEY;
            if (searchEndpoint && searchKey) {
              await indexDocuments("diveops-knowledge-index", [
                {
                  id: `library-${libraryDoc.id}`,
                  content,
                  title,
                  sourceDocument: file.originalname,
                  documentType: docType,
                  product: "diveops",
                },
              ]);
              logger.info({ libraryDocId: libraryDoc.id }, "Library document indexed in Azure Search");
            }
          } catch (err) {
            logger.warn({ err, libraryDocId: libraryDoc.id }, "Azure Search indexing failed for library doc (non-fatal)");
          }
        }

        // Step 6: Emit audit event
        emitAuditEvent(auditCtx, "library.upload", {
          targetId: libraryDoc.id,
          targetType: "library_document",
          after: {
            id: libraryDoc.id,
            title,
            docType,
            fileName: file.originalname,
            fileType,
            fileSize: file.size,
            blobUrl,
            projectId,
            contentLength: content.length,
            pageCount,
          },
        }).catch(() => {});

        logger.info({ libraryDocId: libraryDoc.id, title, docType }, "Library document uploaded");

        res.status(201).json({
          libraryDocument: libraryDoc,
          parsedDocumentId: parsedDoc.id,
          blobUrl,
          message: "Library document uploaded and processed successfully.",
        });
      } catch (err: any) {
        logger.error({ err }, "Library document upload failed");
        res.status(500).json({ message: "Library document upload failed", code: "INTERNAL_ERROR" });
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // POST /api/projects/:projectId/sops/upload
  // SOP document upload — extracts text content for the SOP record.
  // Roles: SUPERVISOR, ADMIN, GOD
  // ────────────────────────────────────────────────────────────────

  app.post(
    "/api/projects/:projectId/sops/upload",
    requireRole("SUPERVISOR", "ADMIN", "GOD"),
    requireProjectAccess(),
    (req: Request, res: Response, next) => {
      upload.single("file")(req, res, (err) => {
        if (handleMulterError(err, res)) return;
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "No file provided", code: "NO_FILE" });
        }

        const user = getUser(req);
        const auditCtx = buildAuditCtx(req);
        const projectId = p(req.params.projectId);
        const title = req.body.title || file.originalname;
        const fileType = getFileType(file);
        const blobName = generateBlobName(file.originalname, `projects/${projectId}/sops`);

        // Verify project exists
        const project = await storage.getProject(projectId);
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }

        // Step 1: Upload to Azure Blob Storage
        let blobUrl: string | null = null;
        try {
          const blobResult = await uploadBlob(blobName, file.buffer, {
            contentType: getContentType(file),
            metadata: {
              uploadedBy: user.id,
              originalName: file.originalname,
              projectId,
              fileType,
            },
          });
          blobUrl = blobResult.url;
        } catch (err: any) {
          logger.error({ err, fileName: file.originalname, projectId }, "Blob storage upload failed for SOP");
          return res.status(502).json({
            message: "File storage service unavailable. Please try again later.",
            code: "BLOB_STORAGE_ERROR",
          });
        }

        // Step 2: Parse the document to extract text content
        let content = "";
        let pageCount: number | undefined;
        try {
          const parseResult = await parseDocument(file.buffer, file.originalname, fileType);
          content = parseResult.text;
          pageCount = parseResult.pageCount;
        } catch (err: any) {
          logger.error({ err, fileName: file.originalname }, "Document parsing failed for SOP");
          return res.status(422).json({
            message: "Failed to extract text from the uploaded document. Please ensure the file is not corrupted.",
            code: "PARSE_ERROR",
          });
        }

        if (!content || content.trim().length === 0) {
          return res.status(422).json({
            message: "No text content could be extracted from the uploaded document.",
            code: "EMPTY_CONTENT",
          });
        }

        // Step 3: Create the SOP record with extracted content
        const sop = await storage.createProjectSop({
          projectId,
          title,
          content,
          isActive: req.body.isActive !== false && req.body.isActive !== "false",
          createdBy: user.id,
        });

        // Step 4: Create a parsedDocuments record for tracking
        const [parsedDoc] = await db
          .insert(schema.parsedDocuments)
          .values({
            projectId,
            fileName: file.originalname,
            fileType,
            blobUrl,
            status: "completed",
            extractedText: content,
            pageCount: pageCount || null,
            uploadedBy: user.id,
          })
          .returning();

        // Step 5: Emit audit event
        emitAuditEvent(auditCtx, "sop.upload", {
          targetId: sop.id,
          targetType: "project_sop",
          after: {
            sopId: sop.id,
            title,
            projectId,
            fileName: file.originalname,
            fileType,
            fileSize: file.size,
            blobUrl,
            contentLength: content.length,
            pageCount,
            parsedDocumentId: parsedDoc.id,
          },
        }).catch(() => {});

        logger.info({ sopId: sop.id, projectId, title }, "SOP document uploaded");

        res.status(201).json({
          sop,
          parsedDocumentId: parsedDoc.id,
          blobUrl,
          message: "SOP document uploaded and text extracted successfully.",
        });
      } catch (err: any) {
        logger.error({ err }, "SOP document upload failed");
        res.status(500).json({ message: "SOP document upload failed", code: "INTERNAL_ERROR" });
      }
    }
  );

  // ────────────────────────────────────────────────────────────────
  // GET /api/documents/:id/status
  // Check the processing status of a parsed document.
  // ────────────────────────────────────────────────────────────────

  app.get(
    "/api/documents/:id/status",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const docId = parseInt(p(req.params.id), 10);
        if (isNaN(docId)) {
          return res.status(400).json({ message: "Invalid document ID" });
        }

        const [doc] = await db
          .select()
          .from(schema.parsedDocuments)
          .where(eq(schema.parsedDocuments.id, docId));

        if (!doc) {
          return res.status(404).json({ message: "Document not found" });
        }

        res.json({
          id: doc.id,
          fileName: doc.fileName,
          fileType: doc.fileType,
          status: doc.status,
          pageCount: doc.pageCount,
          errorMessage: doc.errorMessage,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        });
      } catch (err: any) {
        logger.error({ err }, "Failed to get document status");
        res.status(500).json({ message: "Failed to get document status" });
      }
    }
  );

  logger.info("Document upload routes registered");
}
