import type { Request, Response, NextFunction } from "express";
import type { User as AppUser } from "@shared/schema";
import { storage } from "./storage";

function getUser(req: Request): AppUser | null {
  return req.isAuthenticated() ? (req.user as AppUser) : null;
}

function isAdminOrGod(role: string): boolean {
  return role === "ADMIN" || role === "GOD";
}

export function requireProjectAccess(paramName = "projectId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (isAdminOrGod(user.role)) return next();

    const projectId = req.params[paramName];
    if (!projectId) return res.status(400).json({ message: "Missing project ID" });

    const members = await storage.getProjectMembers(projectId);
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

    next();
  };
}

export function requireDayAccess(paramName = "dayId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (isAdminOrGod(user.role)) return next();

    const dayId = req.params[paramName];
    if (!dayId) return res.status(400).json({ message: "Missing day ID" });

    const day = await storage.getDay(dayId);
    if (!day) return res.status(404).json({ message: "Day not found" });

    const members = await storage.getProjectMembers(day.projectId);
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

    next();
  };
}
