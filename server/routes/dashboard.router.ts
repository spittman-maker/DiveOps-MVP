import express, { type Request, type Response } from "express";
import { storage, pool } from "../storage";
import { requireAuth, isGod } from "../auth";
import { isEnabled } from "../feature-flags";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api/dashboard
// ────────────────────────────────────────────────────────────────────────────

export const dashboardRouter = express.Router();

// Get user's dashboard layout
dashboardRouter.get("/layout", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const layout = await storage.getDashboardLayout(user.id);

    if (!layout) {
      // Return default layout if none exists
      return res.json({
        widgets: [
          { id: "w1", type: "live_dive_board", title: "Live Dive Board", x: 0, y: 0, w: 4, h: 3 },
          { id: "w2", type: "live_log_feed", title: "Live Log Feed", x: 0, y: 3, w: 2, h: 3 },
          { id: "w3", type: "station_overview", title: "Station Overview", x: 2, y: 3, w: 2, h: 3 },
          { id: "w4", type: "daily_summary", title: "Today's Summary", x: 0, y: 6, w: 2, h: 2 },
          { id: "w5", type: "safety_incidents", title: "Safety Status", x: 2, y: 6, w: 2, h: 2 },
          { id: "w6", type: "diver_certs", title: "Diver Certifications", x: 0, y: 8, w: 2, h: 2 },
          { id: "w7", type: "equipment_certs", title: "Equipment Certifications", x: 2, y: 8, w: 2, h: 2 },
        ],
        version: 2,
      });
    }

    res.json(layout.layoutData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// BUG-14 FIX: Reset dashboard layout to default
dashboardRouter.delete("/layout", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    await pool.query('DELETE FROM "dashboard_layouts" WHERE "user_id" = $1', [user.id]);
    res.json({ message: "Dashboard layout reset to default" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Save user's dashboard layout
dashboardRouter.post("/layout", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const layoutData = req.body;

    if (!layoutData.widgets || !Array.isArray(layoutData.widgets)) {
      return res.status(400).json({ message: "Invalid layout data" });
    }

    const saved = await storage.saveDashboardLayout(user.id, layoutData);
    res.json({ success: true, layout: saved.layoutData });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get dashboard stats for widgets
dashboardRouter.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const prefs = await storage.getUserPreferences(user.id);
    let projectId = (req.query.projectId as string) || prefs?.activeProjectId;

    if (!projectId) {
      const projects = await storage.getAllProjects();
      if (projects.length > 0) {
        projectId = projects[0].id;
      }
    }
    // BUG-04 FIX: Verify projectId belongs to user's company
    if (projectId && isEnabled("multiTenantOrg") && !isGod(user.role)) {
      const project = await storage.getProject(projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }

    let stats: any = {
      totalDives: 0,
      activeDives: 0,
      safetyIncidents: 0,
      openRisks: 0,
      logEntriesToday: 0,
    };

    if (projectId) {
      const allDays = await storage.getDaysByProject(projectId);
      const projectRisks = await storage.getRiskItemsByProject(projectId);

      // Aggregate stats across ALL days for this project
      let totalDives = 0;
      let activeDiveRecords: any[] = [];
      let completedDiveRecords: any[] = [];
      let allLogs: any[] = [];
      let latestDayStatus = "NO_DAYS";
      let latestDayDate = "";

      for (const day of allDays) {
        const dives = await storage.getDivesByDay(day.id);
        const logs = await storage.getLogEventsByDay(day.id);
        totalDives += dives.length;
        activeDiveRecords.push(...dives.filter(d => d.lsTime && !d.rsTime));
        completedDiveRecords.push(...dives.filter(d => d.lsTime && (d.rsTime || d.lbTime)));
        allLogs.push(...logs);
      }

      // Use the most recent day for status display
      if (allDays.length > 0) {
        latestDayStatus = allDays[0].status;
        latestDayDate = allDays[0].date;
      }

      stats = {
        totalDives,
        activeDives: activeDiveRecords.length,
        activeDivers: activeDiveRecords.map(d => ({
          id: d.id,
          name: d.diverDisplayName || "Unknown",
          station: d.station || null,
          lsTime: d.lsTime,
        })),
        completedDives: completedDiveRecords.length,
        safetyIncidents: allLogs.filter(l => l.category === "safety").length,
        openRisks: projectRisks.filter(r => r.status === "open").length,
        recentRisks: projectRisks
          .filter(r => r.status === "open")
          .slice(0, 3)
          .map(r => ({ id: r.id, riskId: r.riskId, description: r.description, source: r.source })),
        logEntriesToday: allLogs.length,
        directivesToday: allLogs.filter(l => l.category === "directive").length,
        dayStatus: latestDayStatus,
        dayDate: latestDayDate,
        totalDays: allDays.length,
      };

      if (allDays.length === 0) {
        stats.openRisks = projectRisks.filter(r => r.status === "open").length;
      }
    }

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

dashboardRouter.get("/recent-logs", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const prefs = await storage.getUserPreferences(user.id);
    let projectId = (req.query.projectId as string) || prefs?.activeProjectId;

    if (!projectId) {
      const projects = await storage.getAllProjects();
      if (projects.length > 0) {
        projectId = projects[0].id;
      }
    }

    if (!projectId) {
      return res.json([]);
    }
    // BUG-04 FIX: Verify projectId belongs to user's company
    if (isEnabled("multiTenantOrg") && !isGod(user.role)) {
      const project = await storage.getProject(projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }

    const day = await storage.getMostRecentDayByProject(projectId);
    if (!day) {
      return res.json([]);
    }

    const logs = await storage.getLogEventsByDay(day.id);
    const sortedLogs = logs
      .sort((a, b) => new Date(b.captureTime).getTime() - new Date(a.captureTime).getTime())
      .slice(0, 8);

    const recentLogs = await Promise.all(sortedLogs.map(async (log) => {
      const renders = await storage.getLogRendersByEvent(log.id);
      const masterRender = renders.find(r => r.renderType === "master_log_line");
      const internalRender = renders.find(r => r.renderType === "internal_canvas_line");
      return {
        id: log.id,
        rawText: log.rawText,
        category: log.category,
        eventTime: log.eventTime,
        captureTime: log.captureTime,
        station: log.station,
        masterLogLine: masterRender?.renderText || null,
        internalLine: internalRender?.renderText || null,
        aiStatus: masterRender?.status || null,
      };
    }));

    res.json(recentLogs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// LIVE BOARD – Cross-crew real-time visibility
// ──────────────────────────────────────────────────────────────────────────

dashboardRouter.get("/live-board", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const prefs = await storage.getUserPreferences(user.id);
    let projectId = (req.query.projectId as string) || prefs?.activeProjectId;

    if (!projectId) {
      const projects = await storage.getAllProjects();
      if (projects.length > 0) {
        projectId = projects[0].id;
      }
    }

    if (!projectId) {
      return res.json({ activeDives: [], completedDives: [], logEntries: [], stations: [] });
    }

    // Fetch project (needed for timezone and multi-tenant check)
    const project = await storage.getProject(projectId);

    // BUG-04 FIX: Verify projectId belongs to user's company
    if (isEnabled("multiTenantOrg") && !isGod(user.role)) {
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }

    // Get ALL days for this project (covers all shifts / stations)
    const allDays = await storage.getDaysByProject(projectId);
    const today = getTodayDate();

    // Filter to today's active days (or most recent day if none today)
    let todayDays = allDays.filter(d => d.date === today);
    if (todayDays.length === 0 && allDays.length > 0) {
      // Fall back to the most recent day's date
      const mostRecentDate = allDays[0].date;
      todayDays = allDays.filter(d => d.date === mostRecentDate);
    }

    // Gather ALL dives and logs across all today's days
    const allDivesRaw: any[] = [];
    const allLogsRaw: any[] = [];
    const dayStatusMap: Record<string, string> = {};

    for (const day of todayDays) {
      dayStatusMap[day.id] = day.status;
      const dives = await storage.getDivesByDay(day.id);
      const logs = await storage.getLogEventsByDay(day.id);
      allDivesRaw.push(...dives);
      allLogsRaw.push(...logs);
    }

    const now = Date.now();

    // Classify dives
    const activeDives = allDivesRaw
      .filter(d => d.lsTime && !d.rsTime)
      .map(d => {
        const lsMs = new Date(d.lsTime).getTime();
        const elapsedMin = Math.round((now - lsMs) / 60000);
        // Bottom time = time from reaching bottom (rbTime) to leaving bottom (lbTime) or now
        let bottomTimeMin: number | null = null;
        if (d.rbTime) {
          const rbMs = new Date(d.rbTime).getTime();
          const endMs = d.lbTime ? new Date(d.lbTime).getTime() : now;
          bottomTimeMin = Math.round((endMs - rbMs) / 60000);
        }
        return {
          id: d.id,
          diverName: d.diverDisplayName || "Unknown",
          station: d.station || "Unassigned",
          maxDepthFsw: d.maxDepthFsw || null,
          breathingGas: d.breathingGas || "Air",
          fo2Percent: d.fo2Percent || null,
          lsTime: d.lsTime,
          rbTime: d.rbTime || null,
          lbTime: d.lbTime || null,
          elapsedMin,
          bottomTimeMin,
          tableUsed: d.tableUsed || null,
          scheduleUsed: d.scheduleUsed || null,
          repetitiveGroup: d.repetitiveGroup || null,
          decompRequired: d.decompRequired || null,
          diveNumber: d.diveNumber,
          dayId: d.dayId,
          stale: elapsedMin > 720,
        };
      })
      .sort((a, b) => new Date(a.lsTime).getTime() - new Date(b.lsTime).getTime());

    const completedDives = allDivesRaw
      .filter(d => d.lsTime && d.rsTime)
      .map(d => {
        const lsMs = new Date(d.lsTime).getTime();
        const rsMs = new Date(d.rsTime).getTime();
        const totalMin = Math.round((rsMs - lsMs) / 60000);
        let bottomTimeMin: number | null = null;
        if (d.rbTime && d.lbTime) {
          bottomTimeMin = Math.round((new Date(d.lbTime).getTime() - new Date(d.rbTime).getTime()) / 60000);
        }
        return {
          id: d.id,
          diverName: d.diverDisplayName || "Unknown",
          station: d.station || "Unassigned",
          maxDepthFsw: d.maxDepthFsw || null,
          breathingGas: d.breathingGas || "Air",
          fo2Percent: d.fo2Percent || null,
          lsTime: d.lsTime,
          rsTime: d.rsTime,
          totalMin,
          bottomTimeMin,
          tableUsed: d.tableUsed || null,
          scheduleUsed: d.scheduleUsed || null,
          repetitiveGroup: d.repetitiveGroup || null,
          decompRequired: d.decompRequired || null,
          diveNumber: d.diveNumber,
          dayId: d.dayId,
        };
      })
      .sort((a, b) => new Date(b.rsTime).getTime() - new Date(a.rsTime).getTime());

    // Log entries sorted most recent first
    const logEntries = allLogsRaw
      .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
      .slice(0, 50)
      .map(log => ({
        id: log.id,
        station: log.station || "General",
        category: log.category || "general",
        rawText: log.rawText,
        eventTime: log.eventTime,
        captureTime: log.captureTime,
        dayId: log.dayId,
      }));

    // Station breakdown
    const stationMap: Record<string, { name: string; activeDivers: number; completedDives: number; isActive: boolean }> = {};
    for (const d of allDivesRaw) {
      const sName = d.station || "Unassigned";
      if (!stationMap[sName]) {
        stationMap[sName] = { name: sName, activeDivers: 0, completedDives: 0, isActive: false };
      }
      if (d.lsTime && !d.rsTime) {
        stationMap[sName].activeDivers++;
        stationMap[sName].isActive = true;
      } else if (d.lsTime && d.rsTime) {
        stationMap[sName].completedDives++;
      }
    }
    // Also mark stations as active if their day is active
    for (const day of todayDays) {
      if (day.status === "ACTIVE") {
        // Check if any dive from this day has a station
        const dayDives = allDivesRaw.filter(d => d.dayId === day.id);
        for (const d of dayDives) {
          const sName = d.station || "Unassigned";
          if (stationMap[sName]) {
            stationMap[sName].isActive = true;
          }
        }
      }
    }

    const stations = Object.values(stationMap).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      activeDives,
      completedDives,
      logEntries,
      stations,
      dayCount: todayDays.length,
      date: todayDays[0]?.date || today,
      projectTimezone: project?.timezone || "America/New_York",
    });
  } catch (error: any) {
    console.error("Live board error:", error);
    res.status(500).json({ message: error.message });
  }
});
