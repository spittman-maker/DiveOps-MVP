import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, isGod } from "../auth";
import { isEnabled } from "../feature-flags";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api
// ────────────────────────────────────────────────────────────────────────────

export const crewHoursRouter = express.Router();

// In-memory store for crew hours (persisted per station+date key)
// In production this would use a database table, but for MVP we use
// a simple in-memory map that survives within the process lifetime.
const crewHoursStore: Record<string, any> = {};

// GET /api/crew-hours?station=X&date=YYYY-MM-DD
crewHoursRouter.get("/crew-hours", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const station = req.query.station as string;
    const date = req.query.date as string;
    const projectId = req.query.projectId as string | undefined;
    if (!station || !date) {
      return res.status(400).json({ message: "station and date query params required" });
    }
    // BUG-06 FIX: Verify projectId belongs to user's company
    if (projectId && isEnabled("multiTenantOrg") && !isGod(user.role)) {
      const project = await storage.getProject(projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }
    const key = `${station}::${date}`;
    const data = crewHoursStore[key];
    if (!data) {
      return res.json({ station, date, members: [] });
    }
    return res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/crew-hours — Save crew hours for a station+date
crewHoursRouter.post("/crew-hours", requireAuth, async (req: Request, res: Response) => {
  try {
    const { station, date, members } = req.body;
    if (!station || !date) {
      return res.status(400).json({ message: "station and date are required" });
    }
    const key = `${station}::${date}`;
    crewHoursStore[key] = {
      station,
      date,
      members: members || [],
      updatedAt: new Date().toISOString(),
      updatedBy: getUser(req).id,
    };
    return res.json({ success: true, ...crewHoursStore[key] });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
