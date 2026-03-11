import type { Request, Response, NextFunction } from "express";
import type { User as AppUser } from "@shared/schema";
import { storage } from "./storage";
import { isEnabled } from "./feature-flags";

function getUser(req: Request): AppUser | null {
  return req.isAuthenticated() ? (req.user as AppUser) : null;
}

/**
 * requireGod — GOD-only route guard.
 * Used for company creation, system-wide audit, feature flags, etc.
 */
export function requireGod(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  if ((req.user as AppUser).role !== "GOD") return res.status(403).json({ message: "Forbidden: GOD only" });
  next();
}

/**
 * requireCompanyAccess — Primary enforcement point for company-level isolation.
 *
 * Resolves the company_id for the target resource (project or direct company param)
 * and verifies the requesting user belongs to that company.
 *
 * GOD bypasses all checks.
 * ADMIN is allowed only if their company_id matches the resource's company_id.
 * SUPERVISOR and DIVER are allowed only if they are project members AND
 * the project belongs to their company.
 *
 * When multiTenantOrg feature flag is OFF, this middleware is a no-op passthrough.
 */
export function requireCompanyAccess(paramName = "projectId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Feature flag gate — when OFF, behave like pre-multi-tenant (passthrough)
    if (!isEnabled("multiTenantOrg")) return next();

    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // GOD has unrestricted access
    if (user.role === "GOD") return next();

    // Try to resolve company_id from the request
    // First check if there's a companyId param directly
    const companyIdParam = req.params.companyId;
    if (companyIdParam) {
      // Direct company route — check user's company matches
      if (user.companyId !== companyIdParam) {
        return res.status(403).json({ message: "Forbidden: access denied to this company" });
      }
      return next();
    }

    // Otherwise resolve via project
    const projectId = req.params[paramName] as string;
    if (!projectId) {
      // No project context — for ADMIN, allow (they'll be filtered by company at the query level)
      if (user.role === "ADMIN") return next();
      return res.status(400).json({ message: "Missing project ID" });
    }

    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Enforce company boundary
    if (project.companyId && project.companyId !== user.companyId) {
      return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
    }

    // ADMIN: company match is sufficient
    if (user.role === "ADMIN") return next();

    // SUPERVISOR / DIVER: must also be a project member
    const members = await storage.getProjectMembers(projectId);
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

    next();
  };
}

/**
 * requireProjectAccess — Updated to respect company boundaries.
 *
 * When multiTenantOrg is ON:
 *   - GOD bypasses all checks
 *   - ADMIN bypasses only for their own company's projects
 *   - SUPERVISOR/DIVER must be project members AND same company
 *
 * When multiTenantOrg is OFF:
 *   - Original behavior: ADMIN and GOD bypass all checks
 */
export function requireProjectAccess(paramName = "projectId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // When multi-tenant is OFF, preserve original flat-access behavior
    if (!isEnabled("multiTenantOrg")) {
      if (user.role === "ADMIN" || user.role === "GOD") return next();

      const projectId = req.params[paramName] as string;
      if (!projectId) return res.status(400).json({ message: "Missing project ID" });

      const members = await storage.getProjectMembers(projectId);
      const isMember = members.some(m => m.userId === user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

      return next();
    }

    // Multi-tenant ON: GOD bypasses everything
    if (user.role === "GOD") return next();

    const projectId = req.params[paramName] as string;
    if (!projectId) return res.status(400).json({ message: "Missing project ID" });

    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Enforce company boundary for all non-GOD users
    if (project.companyId && user.companyId && project.companyId !== user.companyId) {
      return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
    }

    // ADMIN: company match is sufficient
    if (user.role === "ADMIN") return next();

    // SUPERVISOR / DIVER: must also be a project member
    const members = await storage.getProjectMembers(projectId);
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

    next();
  };
}

/**
 * requireDayAccess — Updated to respect company boundaries.
 */
export function requireDayAccess(paramName = "dayId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // When multi-tenant is OFF, preserve original behavior
    if (!isEnabled("multiTenantOrg")) {
      if (user.role === "ADMIN" || user.role === "GOD") return next();

      const dayId = req.params[paramName] as string;
      if (!dayId) return res.status(400).json({ message: "Missing day ID" });

      const day = await storage.getDay(dayId);
      if (!day) return res.status(404).json({ message: "Day not found" });

      const members = await storage.getProjectMembers(day.projectId);
      const isMember = members.some(m => m.userId === user.id);
      if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

      return next();
    }

    // Multi-tenant ON: GOD bypasses everything
    if (user.role === "GOD") return next();

    const dayId = req.params[paramName] as string;
    if (!dayId) return res.status(400).json({ message: "Missing day ID" });

    const day = await storage.getDay(dayId);
    if (!day) return res.status(404).json({ message: "Day not found" });

    // Check company boundary via the day's project
    const project = await storage.getProject(day.projectId);
    if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
      return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
    }

    // ADMIN: company match is sufficient
    if (user.role === "ADMIN") return next();

    // SUPERVISOR / DIVER: must be a project member
    const members = await storage.getProjectMembers(day.projectId);
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

    next();
  };
}
