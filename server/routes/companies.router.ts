import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, isGod } from "../auth";
import { emitAuditEvent, type AuditContext } from "../audit";
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

export const companiesRouter = express.Router();

// ════════════════════════════════════════════════════════════════════
// COMPANY MANAGEMENT (GOD-only CRUD)
// ════════════════════════════════════════════════════════════════════

// BUG-ROLE-01 FIX: Restrict company listing to GOD-only. ADMIN should not see other companies.
companiesRouter.get("/companies", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    if (!isGod(user.role)) {
      return res.status(403).json({ message: "Forbidden: GOD only" });
    }
    const companies = await storage.getAllCompanies();
    return res.json(companies);
  } catch (error) {
    res.status(500).json({ message: "Failed to list companies" });
  }
});

companiesRouter.get("/companies/:companyId", requireAuth, async (req: Request, res: Response) => {
  try {
    const company = await storage.getCompany(p(req.params.companyId));
    if (!company) return res.status(404).json({ message: "Company not found" });
    // Non-GOD can only see their own company
    const user = getUser(req);
    if (!isGod(user.role) && user.companyId !== company.companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(company);
  } catch (error) {
    res.status(500).json({ message: "Failed to get company" });
  }
});

companiesRouter.post("/companies", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const { companyName } = req.body;
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ message: "Company name is required" });
    }
    const company = await storage.createCompany({ companyName: companyName.trim() });
    const ctx: AuditContext = { ...req.auditCtx! };
    emitAuditEvent(ctx, "company.create", {
      targetId: company.companyId, targetType: "company",
      after: { companyId: company.companyId, companyName: company.companyName },
    }).catch(() => {});
    res.status(201).json(company);
  } catch (error: any) {
    if (error?.message?.includes("unique") || error?.message?.includes("duplicate")) {
      return res.status(409).json({ message: "Company name already exists" });
    }
    res.status(500).json({ message: "Failed to create company" });
  }
});

companiesRouter.patch("/companies/:companyId", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const company = await storage.updateCompany(p(req.params.companyId), req.body);
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  } catch (error) {
    res.status(500).json({ message: "Failed to update company" });
  }
});

companiesRouter.delete("/companies/:companyId", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteCompany(p(req.params.companyId));
    if (!deleted) return res.status(404).json({ message: "Company not found" });
    const ctx: AuditContext = { ...req.auditCtx! };
    emitAuditEvent(ctx, "company.delete", {
      targetId: p(req.params.companyId), targetType: "company",
    }).catch(() => {});
    res.json({ message: "Company deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete company" });
  }
});

// ════════════════════════════════════════════════════════════════════
// COMPANY MEMBER MANAGEMENT
// ════════════════════════════════════════════════════════════════════

companiesRouter.get("/companies/:companyId/members", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const companyId = p(req.params.companyId);
    // Only GOD or members of the company can see members
    if (!isGod(user.role) && user.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const members = await storage.getCompanyMembers(companyId);
    // Enrich with user details
    const enriched = await Promise.all(members.map(async (m) => {
      const u = await storage.getUser(m.userId);
      return {
        ...m,
        user: u ? { id: u.id, username: u.username, fullName: u.fullName, initials: u.initials, role: u.role, email: u.email } : null,
      };
    }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed to list company members" });
  }
});

companiesRouter.post("/companies/:companyId/members", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const companyId = p(req.params.companyId);
    // ADMIN can only add to their own company
    if (!isGod(user.role) && user.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { userId, companyRole } = req.body;
    if (!userId || !companyRole) {
      return res.status(400).json({ message: "userId and companyRole are required" });
    }
    const member = await storage.addCompanyMember({
      companyId,
      userId,
      companyRole,
      addedBy: user.id,
    });
    // Also update the user's companyId
    await storage.updateUser(userId, { companyId } as any);
    const ctx: AuditContext = { ...req.auditCtx! };
    emitAuditEvent(ctx, "company_member.add", {
      targetId: userId, targetType: "company_member",
      metadata: { companyId, companyRole },
    }).catch(() => {});
    res.status(201).json(member);
  } catch (error: any) {
    if (error?.message?.includes("duplicate") || error?.message?.includes("unique")) {
      return res.status(409).json({ message: "User is already a member of this company" });
    }
    res.status(500).json({ message: "Failed to add company member" });
  }
});

companiesRouter.patch("/companies/:companyId/members/:userId", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const companyId = p(req.params.companyId); const userId = p(req.params.userId);
    if (!isGod(user.role) && user.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const updated = await storage.updateCompanyMember(companyId, userId, req.body);
    if (!updated) return res.status(404).json({ message: "Member not found" });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update company member" });
  }
});

companiesRouter.delete("/companies/:companyId/members/:userId", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const companyId = p(req.params.companyId); const userId = p(req.params.userId);
    if (!isGod(user.role) && user.companyId !== companyId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const removed = await storage.removeCompanyMember(companyId, userId);
    if (!removed) return res.status(404).json({ message: "Member not found" });
    const ctx: AuditContext = { ...req.auditCtx! };
    emitAuditEvent(ctx, "company_member.remove", {
      targetId: userId, targetType: "company_member",
      metadata: { companyId },
    }).catch(() => {});
    res.json({ message: "Member removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove company member" });
  }
});

// GOD: Set active company context
companiesRouter.post("/companies/:companyId/activate", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const companyId = p(req.params.companyId);
    const company = await storage.getCompany(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });
    await storage.setActiveCompany(user.id, companyId);
    res.json({ message: "Active company set", companyId, companyName: company.companyName });
  } catch (error) {
    res.status(500).json({ message: "Failed to set active company" });
  }
});

// GOD: Clear active company context (see all companies)
companiesRouter.post("/companies/clear-active", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    await storage.setActiveCompany(user.id, "");
    res.json({ message: "Active company cleared" });
  } catch (error) {
    res.status(500).json({ message: "Failed to clear active company" });
  }
});
