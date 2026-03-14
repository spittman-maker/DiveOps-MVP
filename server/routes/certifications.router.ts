import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, isGod } from "../auth";
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

export const certificationsRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// DIVER CERTIFICATIONS CRUD (Item #2)
// ──────────────────────────────────────────────────────────────────────────

certificationsRouter.get("/diver-certifications", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const userId = req.query.userId as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    // BUG-05 FIX: If a userId is provided, verify the target user belongs to the same company
    if (userId && isEnabled("multiTenantOrg") && !isGod(user.role)) {
      const targetUser = await storage.getUser(userId);
      if (targetUser?.companyId && user.companyId && targetUser.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: user belongs to a different company" });
      }
    }
    if (userId) {
      const certs = await storage.getDiverCertifications(userId);
      return res.json(certs);
    }
    // Filter by projectId if provided (used by the Certifications tab)
    if (projectId) {
      // BUG-05 FIX: Verify projectId belongs to user's company
      if (isEnabled("multiTenantOrg") && !isGod(user.role)) {
        const project = await storage.getProject(projectId);
        if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
          return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
        }
      }
      const certs = await storage.getDiverCertificationsByProject(projectId);
      return res.json(certs);
    }
    // BUG-05 FIX: Non-GOD users should only see certs for users in their company
    if (isEnabled("multiTenantOrg") && !isGod(user.role) && user.companyId) {
      const companyUsers = await storage.getUsersByCompany(user.companyId);
      const companyUserIds = companyUsers.map((u: any) => u.id);
      const allCerts = await storage.getAllDiverCertifications();
      const filtered = allCerts.filter((c: any) => companyUserIds.includes(c.userId));
      return res.json(filtered);
    }
    const certs = await storage.getAllDiverCertifications();
    res.json(certs);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to fetch diver certifications" });
  }
});

certificationsRouter.post("/diver-certifications", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    // Convert ISO date strings to Date objects for Drizzle timestamp columns
    if (body.issuedDate && typeof body.issuedDate === "string") {
      body.issuedDate = new Date(body.issuedDate);
    }
    if (body.expirationDate && typeof body.expirationDate === "string") {
      body.expirationDate = new Date(body.expirationDate);
    }
    // Validate required fields
    if (!body.userId || !body.certType) {
      return res.status(400).json({ message: "userId and certType are required" });
    }
    const cert = await storage.createDiverCertification(body);
    res.status(201).json(cert);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to create diver certification" });
  }
});

certificationsRouter.patch("/diver-certifications/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    // Convert ISO date strings to Date objects for Drizzle timestamp columns
    if (body.issuedDate && typeof body.issuedDate === "string") {
      body.issuedDate = new Date(body.issuedDate);
    }
    if (body.expirationDate && typeof body.expirationDate === "string") {
      body.expirationDate = new Date(body.expirationDate);
    }
    const cert = await storage.updateDiverCertification(p(req.params.id), body);
    if (!cert) return res.status(404).json({ message: "Certification not found" });
    res.json(cert);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update diver certification" });
  }
});

certificationsRouter.delete("/diver-certifications/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteDiverCertification(p(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Certification not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete diver certification" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// EQUIPMENT CERTIFICATIONS CRUD (Item #2)
// ──────────────────────────────────────────────────────────────────────────

certificationsRouter.get("/equipment-certifications", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const projectId = req.query.projectId as string | undefined;
    // BUG-05 FIX: Verify projectId belongs to user's company
    if (projectId && isEnabled("multiTenantOrg") && !isGod(user.role)) {
      const project = await storage.getProject(projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }
    // BUG-05 FIX: If no projectId, non-GOD users only see certs from their company's projects
    if (!projectId && isEnabled("multiTenantOrg") && !isGod(user.role) && user.companyId) {
      const projects = await storage.getProjectsByCompany(user.companyId);
      const allCerts: any[] = [];
      for (const p of projects) {
        const pCerts = await storage.getEquipmentCertifications(p.id);
        allCerts.push(...pCerts);
      }
      return res.json(allCerts);
    }
    const certs = await storage.getEquipmentCertifications(projectId || undefined);
    res.json(certs);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to fetch equipment certifications" });
  }
});

certificationsRouter.post("/equipment-certifications", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    // Convert ISO date strings to Date objects for Drizzle timestamp columns
    if (body.issuedDate && typeof body.issuedDate === "string") {
      body.issuedDate = new Date(body.issuedDate);
    }
    if (body.expirationDate && typeof body.expirationDate === "string") {
      body.expirationDate = new Date(body.expirationDate);
    }
    // Validate required fields
    if (!body.equipmentName || !body.equipmentCategory || !body.certType) {
      return res.status(400).json({ message: "equipmentName, equipmentCategory, and certType are required" });
    }
    const cert = await storage.createEquipmentCertification(body);
    res.status(201).json(cert);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to create equipment certification" });
  }
});

certificationsRouter.patch("/equipment-certifications/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    // Convert ISO date strings to Date objects for Drizzle timestamp columns
    if (body.issuedDate && typeof body.issuedDate === "string") {
      body.issuedDate = new Date(body.issuedDate);
    }
    if (body.expirationDate && typeof body.expirationDate === "string") {
      body.expirationDate = new Date(body.expirationDate);
    }
    const cert = await storage.updateEquipmentCertification(p(req.params.id), body);
    if (!cert) return res.status(404).json({ message: "Certification not found" });
    res.json(cert);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update equipment certification" });
  }
});

certificationsRouter.delete("/equipment-certifications/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteEquipmentCertification(p(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Certification not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete equipment certification" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// CERTIFICATIONS - Expiring & Stats endpoints
// ──────────────────────────────────────────────────────────────────────────

certificationsRouter.get("/certifications/expiring", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const daysAhead = parseInt(req.query.daysAhead as string || "30", 10);
    const certs = await storage.getExpiringCertifications(projectId || undefined, daysAhead);
    res.json(certs);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to fetch expiring certifications" });
  }
});

certificationsRouter.get("/certifications/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const stats = await storage.getCertificationStats(projectId || undefined);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to fetch certification stats" });
  }
});
