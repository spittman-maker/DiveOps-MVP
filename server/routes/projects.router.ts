import express, { Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, isGod } from "../auth";
import { requireProjectAccess } from "../authz";
import { isEnabled } from "../feature-flags";
import { psg } from "../psg-data-layer";
import type { User } from "@shared/schema";

/** Safely coerce a route param (string | string[]) to a single string. */
function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

/** Get the authenticated user from the request. */
function getUser(req: Request): User {
  return req.user as User;
}

export const projectsRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// GET /api/projects
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req);

  if (isEnabled("multiTenantOrg")) {
    // Multi-tenant mode
    if (isGod(user.role)) {
      // GOD can optionally filter by company via query param, but always
      // defaults to ALL projects across ALL companies (never scoped by
      // activeCompanyId — that context is for other features, not the
      // project list).
      const companyFilter = req.query.companyId as string;
      if (companyFilter) {
        const projects = await storage.getProjectsByCompany(companyFilter);
        return res.json(projects);
      }
      const projects = await storage.getAllProjects();
      return res.json(projects);
    }
    // ADMIN: scoped to their company
    if (user.companyId) {
      const projects = await storage.getProjectsByCompany(user.companyId);
      return res.json(projects);
    }
    // SUPERVISOR/DIVER: only their assigned projects
    const projects = await storage.getUserProjects(user.id);
    return res.json(projects);
  }

  // Legacy mode: GOD sees all, others see assigned
  if (isGod(user.role)) {
    const projects = await storage.getAllProjects();
    return res.json(projects);
  }

  const projects = await storage.getUserProjects(user.id);
  res.json(projects);
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/projects/:id
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const project = await storage.getProject(p(req.params.id));
  if (!project) return res.status(404).json({ message: "Project not found" });
  // BUG-ISO-01 FIX: Enforce company boundary on direct project access
  if (isEnabled("multiTenantOrg")) {
    const user = getUser(req);
    if (!isGod(user.role) && project.companyId && user.companyId && project.companyId !== user.companyId) {
      return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
    }
  }
  res.json(project);
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/projects
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.post("/", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const { name, clientName, jobsiteName, jobsiteAddress, jobsiteLat, jobsiteLng, timezone, companyId: bodyCompanyId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Project name is required" });
    }
    // Multi-tenant: resolve companyId
    let resolvedCompanyId: string | null = null;
    if (isEnabled("multiTenantOrg")) {
      const user = getUser(req);
      if (isGod(user.role)) {
        // GOD must specify companyId or use active company context
        resolvedCompanyId = bodyCompanyId || null;
        if (!resolvedCompanyId) {
          const prefs = await storage.getUserPreferences(user.id);
          resolvedCompanyId = prefs?.activeCompanyId || null;
        }
        if (!resolvedCompanyId) {
          return res.status(400).json({ message: "companyId is required when creating a project as GOD" });
        }
      } else {
        // ADMIN: auto-assign to their company
        resolvedCompanyId = user.companyId || null;
        if (!resolvedCompanyId) {
          return res.status(400).json({ message: "You must be assigned to a company to create projects" });
        }
      }
    }
    const project = await storage.createProject({
      name: name.trim(),
      clientName: clientName || null,
      jobsiteName: jobsiteName || null,
      jobsiteAddress: jobsiteAddress || null,
      jobsiteLat: jobsiteLat || null,
      jobsiteLng: jobsiteLng || null,
      timezone: timezone || "America/New_York",
      ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
    });

    // Auto-seed default safety checklists for the new project (non-blocking)
    if (isEnabled("safetyTab")) {
      const user = getUser(req);
      try {
        const { CHECKLIST_TEMPLATES } = await import("../safety-seed-data");
        const { safetyStorage } = await import("../safety-storage");
        for (const template of CHECKLIST_TEMPLATES) {
          const checklist = await safetyStorage.createChecklist({
            projectId: project.id,
            checklistType: template.checklistType,
            title: template.title,
            description: template.description,
            roleScope: template.roleScope,
            createdBy: user.id,
            isActive: true,
            version: 1,
          });
          const items = template.items.map((item: any) => ({
            checklistId: checklist.id,
            sortOrder: item.sortOrder,
            category: item.category,
            label: item.label,
            description: item.description,
            itemType: item.itemType,
            isRequired: item.isRequired,
            equipmentCategory: item.equipmentCategory,
            regulatoryReference: item.regulatoryReference,
          }));
          await safetyStorage.bulkCreateChecklistItems(items);
        }
        console.log(`[Safety] Auto-seeded ${CHECKLIST_TEMPLATES.length} default checklists for new project ${project.id}`);
      } catch (seedErr) {
        // Non-blocking — checklists will be seeded on first access if this fails
        console.error("[Safety] Failed to auto-seed checklists on project creation:", seedErr);
      }
    }

    // PSG Data Layer: forward project created
    psg.onProjectCreated(project);
    res.status(201).json(project);
  } catch (error: any) {
    console.error("Create project error:", error);
    res.status(500).json({ message: error?.message || "Failed to create project" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/projects/:id
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.patch("/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  const project = await storage.updateProject(p(req.params.id), req.body);
  if (!project) return res.status(404).json({ message: "Project not found" });
  res.json(project);
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/projects/:id/activate — Set active project for user
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.post("/:id/activate", requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req);
  await storage.setActiveProject(user.id, p(req.params.id));
  res.json({ message: "Active project set" });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/members
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.get("/:projectId/members", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const members = await storage.getProjectMembers(p(req.params.projectId));

  // Fetch user details for each member
  const membersWithDetails = await Promise.all(
    members.map(async (m) => {
      const user = await storage.getUser(m.userId);
      return {
        ...m,
        user: user ? { id: user.id, username: user.username, fullName: user.fullName, initials: user.initials } : null,
      };
    })
  );

  res.json(membersWithDetails);
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/projects/:projectId/members
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.post("/:projectId/members", requireRole("ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  try {
    const member = await storage.addProjectMember({
      projectId: p(req.params.projectId),
      userId: req.body.userId,
      role: req.body.role,
    });
    res.status(201).json(member);
  } catch (error) {
    res.status(500).json({ message: "Failed to add member" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/projects/:projectId/members/:userId
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.delete("/:projectId/members/:userId", requireRole("ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  try {
    const removed = await storage.removeProjectMember(p(req.params.projectId), p(req.params.userId));
    if (!removed) return res.status(404).json({ message: "Member not found" });
    res.json({ message: "Member removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove member" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/projects/:projectId — Direct project delete (GOD only)
// ──────────────────────────────────────────────────────────────────────────

projectsRouter.delete("/:projectId", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const schema = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const projectId = p(req.params.projectId);
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const projectDays = await db.select({ id: schema.days.id }).from(schema.days).where(eq(schema.days.projectId, projectId));
    const dayIds = projectDays.map(d => d.id);

    // Delete in correct FK order
    // 1. Risk items (reference log_events via triggerEventId)
    await db.delete(schema.riskItems).where(eq(schema.riskItems.projectId, projectId));

    if (dayIds.length > 0) {
      for (const dayId of dayIds) {
        // logRenders reference logEvents — logRenders has no dayId; delete via logEventId subquery
        try {
          const dayLogEvents = await db.select({ id: schema.logEvents.id }).from(schema.logEvents).where(eq(schema.logEvents.dayId, dayId));
          for (const evt of dayLogEvents) {
            await db.delete(schema.logRenders).where(eq(schema.logRenders.logEventId, evt.id));
          }
        } catch(e) {}
        // clientComms reference days
        try { await db.delete(schema.clientComms).where(eq(schema.clientComms.dayId, dayId)); } catch(e) {}
        // dailySummaries reference days
        try { await db.delete(schema.dailySummaries).where(eq(schema.dailySummaries.dayId, dayId)); } catch(e) {}
        // analyticsSnapshots reference days
        try { await db.delete(schema.analyticsSnapshots).where(eq(schema.analyticsSnapshots.dayId, dayId)); } catch(e) {}
        // anomalyFlags reference days
        try { await db.delete(schema.anomalyFlags).where(eq(schema.anomalyFlags.dayId, dayId)); } catch(e) {}
        // libraryExports reference days
        await db.delete(schema.libraryExports).where(eq(schema.libraryExports.dayId, dayId));
        // logEvents reference days
        await db.delete(schema.logEvents).where(eq(schema.logEvents.dayId, dayId));
        // dives reference days
        await db.delete(schema.dives).where(eq(schema.dives.dayId, dayId));
        // audit_events reference days via dayId FK
        try { await db.delete(schema.auditEvents).where(eq(schema.auditEvents.dayId, dayId)); } catch(e) {}
      }
    }
    // divePlans reference projects
    try { await db.delete(schema.divePlans).where(eq(schema.divePlans.projectId, projectId)); } catch(e) {}
    // Delete remaining audit_events that reference the project but not a specific day
    await db.delete(schema.auditEvents).where(eq(schema.auditEvents.projectId, projectId));
    await db.delete(schema.days).where(eq(schema.days.projectId, projectId));
    await db.delete(schema.projectMembers).where(eq(schema.projectMembers.projectId, projectId));
    // SOPs reference projects
    try { await db.delete(schema.projectSops).where(eq(schema.projectSops.projectId, projectId)); } catch(e) {}
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));

    res.json({ message: `Project "${project.name}" deleted successfully` });
  } catch (error) {
    console.error("Project delete error:", error);
    res.status(500).json({ message: "Failed to delete project" });
  }
});
