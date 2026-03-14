import type { Express, Request, Response } from "express";
import type { User } from "@shared/schema";

interface RegisterProjectsCoreRoutesDeps {
  requireAuth: (req: Request, res: Response, next: any) => unknown;
  requireRole: (...roles: any[]) => (req: Request, res: Response, next: any) => unknown;
  getUser: (req: Request) => User;
  storage: any;
  isEnabled: (flag: string) => boolean;
  isGod: (role: string) => boolean;
}

export function registerProjectsCoreRoutes(app: Express, deps: RegisterProjectsCoreRoutesDeps) {
  const { requireAuth, requireRole, getUser, storage, isEnabled, isGod } = deps;

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    const user = getUser(req);

    if (isEnabled("multiTenantOrg")) {
      if (isGod(user.role)) {
        const companyFilter = req.query.companyId as string;
        if (companyFilter) {
          const projects = await storage.getProjectsByCompany(companyFilter);
          return res.json(projects);
        }
        const projects = await storage.getAllProjects();
        return res.json(projects);
      }
      if (user.companyId) {
        const projects = await storage.getProjectsByCompany(user.companyId);
        return res.json(projects);
      }
      const projects = await storage.getUserProjects(user.id);
      return res.json(projects);
    }

    if (isGod(user.role)) {
      const projects = await storage.getAllProjects();
      return res.json(projects);
    }

    const projects = await storage.getUserProjects(user.id);
    res.json(projects);
  });

  app.get("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    const project = await storage.getProject(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (isEnabled("multiTenantOrg")) {
      const user = getUser(req);
      if (!isGod(user.role) && project.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }
    res.json(project);
  });

  app.post("/api/projects", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { name, clientName, jobsiteName, jobsiteAddress, jobsiteLat, jobsiteLng, timezone, companyId: bodyCompanyId } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Project name is required" });
      }
      let resolvedCompanyId: string | null = null;
      if (isEnabled("multiTenantOrg")) {
        const user = getUser(req);
        if (isGod(user.role)) {
          resolvedCompanyId = bodyCompanyId || null;
          if (!resolvedCompanyId) {
            const prefs = await storage.getUserPreferences(user.id);
            resolvedCompanyId = prefs?.activeCompanyId || null;
          }
          if (!resolvedCompanyId) {
            return res.status(400).json({ message: "companyId is required when creating a project as GOD" });
          }
        } else {
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
          console.error("[Safety] Failed to auto-seed checklists on project creation:", seedErr);
        }
      }

      res.status(201).json(project);
    } catch (error: any) {
      console.error("Create project error:", error);
      res.status(500).json({ message: error?.message || "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    const project = await storage.updateProject(req.params.id, req.body);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects/:id/activate", requireAuth, async (req: Request, res: Response) => {
    const user = getUser(req);
    await storage.setActiveProject(user.id, req.params.id);
    res.json({ message: "Active project set" });
  });
}
