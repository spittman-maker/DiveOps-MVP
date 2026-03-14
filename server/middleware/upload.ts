/**
 * Multer Upload Middleware — DiveOps Document Upload Pipeline
 * ===========================================================
 * Configures multipart file upload handling with memory storage,
 * file size limits, and MIME type validation for the document
 * ingestion pipeline.
 *
 * Accepted formats: PDF, Word (.docx), Excel (.xlsx), Plain Text (.txt)
 * Max file size: 50 MB
 */

import multer from "multer";
import type { Request } from "express";

// ── Accepted MIME types ───────────────────────────────────────────

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
};

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".txt"]);

// ── File size limit ───────────────────────────────────────────────

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ── File filter ───────────────────────────────────────────────────

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  // Check MIME type
  if (ALLOWED_MIME_TYPES[file.mimetype]) {
    return cb(null, true);
  }

  // Fallback: check file extension
  const ext = getExtension(file.originalname);
  if (ext && ALLOWED_EXTENSIONS.has(ext)) {
    return cb(null, true);
  }

  cb(
    new Error(
      `Unsupported file type: ${file.mimetype}. Accepted formats: PDF, DOCX, XLSX, TXT`
    )
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export function getFileType(file: Express.Multer.File): string {
  // Prefer extension from MIME map, fallback to original filename extension
  const fromMime = ALLOWED_MIME_TYPES[file.mimetype];
  if (fromMime) return fromMime.replace(".", "");
  return getExtension(file.originalname).replace(".", "") || "txt";
}

// ── Multer instance ───────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

export { upload, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE };
export default upload;
