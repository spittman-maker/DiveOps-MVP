import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, isGod } from "../auth";
import { requireProjectAccess } from "../authz";
import { isEnabled } from "../feature-flags";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api
// ────────────────────────────────────────────────────────────────────────────

export const libraryRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// WORK LIBRARY & COMPANY DATA
// ──────────────────────────────────────────────────────────────────────────

libraryRouter.get("/work-library", requireAuth, async (_req: Request, res: Response) => {
  const items = await storage.getActiveWorkLibraryItems();
  res.json(items);
});

// BUG-ROLE-01 FIX: First duplicate removed — the canonical handler is in the Company Management section below.

libraryRouter.get("/companies/:companyId/roles", requireAuth, async (req: Request, res: Response) => {
  const roles = await storage.getCompanyRoles(p(req.params.companyId) as string);
  res.json(roles);
});

libraryRouter.get("/companies/:companyId/contact-defaults", requireAuth, async (req: Request, res: Response) => {
  const defaults = await storage.getCompanyContactsDefaults(p(req.params.companyId) as string);
  res.json(defaults);
});

libraryRouter.get("/projects/:projectId/work-selections", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const selections = await storage.getProjectWorkSelections(p(req.params.projectId) as string);
  res.json(selections);
});

libraryRouter.put("/projects/:projectId/work-selections", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  const { workItemIds } = req.body;
  await storage.setProjectWorkSelections(p(req.params.projectId) as string, workItemIds || []);
  const selections = await storage.getProjectWorkSelections(p(req.params.projectId) as string);
  res.json(selections);
});

libraryRouter.get("/projects/:projectId/contacts", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const contacts = await storage.getProjectContacts(p(req.params.projectId) as string);
  res.json(contacts);
});

libraryRouter.put("/projects/:projectId/contacts/:roleId", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  const { name, phone, email } = req.body;
  const contact = await storage.setProjectContact(
    p(req.params.projectId) as string,
    p(req.params.roleId),
    name,
    phone,
    email
  );
  res.json(contact);
});

// ────────────────────────────────────────────────────────────────────────────
// PROJECT SOPs (Standard Operating Procedures)
// ────────────────────────────────────────────────────────────────────────────

libraryRouter.get("/projects/:projectId/sops", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  try {
    const sops = await storage.getProjectSops(p(req.params.projectId));
    res.json(sops);
  } catch (error) {
    console.error("Get SOPs error:", error);
    res.status(500).json({ message: "Failed to get SOPs" });
  }
});

libraryRouter.post("/projects/:projectId/sops", requireRole("ADMIN", "GOD", "SUPERVISOR"), requireProjectAccess(), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const sop = await storage.createProjectSop({
      projectId: p(req.params.projectId),
      title: req.body.title,
      content: req.body.content,
      isActive: req.body.isActive ?? true,
      createdBy: user.id,
    });
    res.status(201).json(sop);
  } catch (error) {
    console.error("Create SOP error:", error);
    res.status(500).json({ message: "Failed to create SOP" });
  }
});

libraryRouter.put("/sops/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const updates: any = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    const sop = await storage.updateProjectSop(p(req.params.id), updates);
    if (!sop) return res.status(404).json({ message: "SOP not found" });
    res.json(sop);
  } catch (error) {
    console.error("Update SOP error:", error);
    res.status(500).json({ message: "Failed to update SOP" });
  }
});

libraryRouter.delete("/sops/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteProjectSop(p(req.params.id));
    if (!deleted) return res.status(404).json({ message: "SOP not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete SOP error:", error);
    res.status(500).json({ message: "Failed to delete SOP" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// ALIAS ROUTES (for clients that POST to /api/sops or /api/facilities directly)
// ──────────────────────────────────────────────────────────────────────────

libraryRouter.post("/sops", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const projectId = req.body.projectId;
    if (!projectId) return res.status(400).json({ message: "projectId is required" });
    const sop = await storage.createProjectSop({
      projectId,
      title: req.body.title,
      content: req.body.content,
      isActive: req.body.isActive ?? true,
      createdBy: user.id,
    });
    res.status(201).json(sop);
  } catch (error) {
    console.error("Create SOP error:", error);
    res.status(500).json({ message: "Failed to create SOP" });
  }
});

// PATCH alias for SOP edit
libraryRouter.patch("/sops/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const updates: any = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    const sop = await storage.updateProjectSop(p(req.params.id), updates);
    if (!sop) return res.status(404).json({ message: "SOP not found" });
    res.json(sop);
  } catch (error) {
    console.error("PATCH SOP error:", error);
    res.status(500).json({ message: "Failed to update SOP" });
  }
});

libraryRouter.get("/sops", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ message: "projectId query param is required" });
    // BUG-06 FIX: Verify projectId belongs to user's company
    if (isEnabled("multiTenantOrg") && !isGod(user.role)) {
      const project = await storage.getProject(projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }
    const sops = await storage.getProjectSops(projectId);
    res.json(sops);
  } catch (error) {
    console.error("Get SOPs error:", error);
    res.status(500).json({ message: "Failed to get SOPs" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// REFERENCE DOCUMENT VIEWER (Item #4 - Azure Blob SAS URLs)
// ──────────────────────────────────────────────────────────────────────────

libraryRouter.get("/reference-docs/list", requireAuth, async (_req: Request, res: Response) => {
  try {
    const blobStorage = await import("../services/blob-storage");
    const blobs = await blobStorage.listBlobs({ container: "documents" });
    const docs = blobs.map(b => ({
      name: b.name,
      contentLength: b.contentLength,
      lastModified: b.lastModified,
      contentType: b.contentType,
    }));
    res.json(docs);
  } catch (error: any) {
    console.error("List reference docs error:", error);
    // Return empty array if blob storage is not configured
    res.json([]);
  }
});

libraryRouter.get("/reference-docs/sas-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const blobName = req.query.blobName as string;
    if (!blobName) return res.status(400).json({ message: "blobName query parameter is required" });

    // HIGH-03 FIX: Check if Azure Storage credentials are configured before attempting SAS generation
    if (!process.env.AZURE_STORAGE_CONNECTION_STRING && !process.env.AZURE_STORAGE_ACCOUNT_NAME) {
      return res.status(503).json({
        message: "Azure Blob Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY.",
        configured: false,
      });
    }

    const blobStorage = await import("../services/blob-storage");
    const sasUrl = blobStorage.generateSasUrl(blobName, {
      container: "documents",
      expiresInMinutes: 60,
      permissions: "r",
    });
    res.json({ url: sasUrl, expiresInMinutes: 60 });
  } catch (error: any) {
    console.error("SAS URL generation error:", error);
    // HIGH-03 FIX: Return a user-friendly error instead of raw internal error
    if (error?.message?.includes("not configured") || error?.message?.includes("StorageSharedKeyCredential")) {
      return res.status(503).json({ message: "Azure Blob Storage is not configured", configured: false });
    }
    res.status(500).json({ message: "Failed to generate SAS URL" });
  }
});
