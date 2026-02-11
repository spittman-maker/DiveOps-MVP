import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import express from "express";
import { storage } from "./storage";
import { passport, hashPassword, requireAuth, requireRole, canWriteLogEvents, isGod, isAdminOrHigher } from "./auth";
import { classifyEvent, extractData, parseEventTime, generateRiskId, getMasterLogSection, renderInternalCanvasLine } from "./extraction";
import { processStructuredLog } from "./logging";
import { generateAIRenders } from "./ai-drafting";
import { generateShiftExport } from "./document-export";
import { speechToTextStream, ensureCompatibleFormat } from "./replit_integrations/audio/client";
import type { User, UserRole, DayStatus } from "@shared/schema";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Type Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  role: z.enum(["GOD", "ADMIN", "SUPERVISOR", "DIVER"]),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional(),
});

const logEventSchema = z.object({
  rawText: z.string().min(1),
  dayId: z.string(),
  projectId: z.string(),
  station: z.string().optional(),
  eventTimeOverride: z.string().optional(),
});

const editEventTimeSchema = z.object({
  eventTime: z.string(),
  editReason: z.string().min(1),
});

const diveConfirmSchema = z.object({
  status: z.enum(["confirmed", "flagged"]),
  note: z.string().optional(),
});

const riskUpdateSchema = z.object({
  description: z.string().optional(),
  status: z.enum(["open", "mitigated", "closed"]).optional(),
  owner: z.string().optional(),
  mitigation: z.string().optional(),
  residualRisk: z.string().optional(),
  closureAuthority: z.string().optional(),
  editReason: z.string().min(1),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ──────────────────────────────────────────────────────────────────────────
  // AUTH ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const data = registerSchema.parse(req.body);
      
      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username: data.username,
        password: hashPassword(data.password),
        role: data.role,
        fullName: data.fullName || null,
        initials: data.initials || null,
        email: data.email || null,
      });

      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        res.status(201).json({ id: user.id, username: user.username, role: user.role });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", passport.authenticate("local"), (req: Request, res: Response) => {
    const user = getUser(req);
    res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const user = getUser(req);
    const prefs = await storage.getUserPreferences(user.id);
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      initials: user.initials,
      activeProjectId: prefs?.activeProjectId,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SEED (Development Helper - Creates GOD user and sample data)
  // ──────────────────────────────────────────────────────────────────────────

  app.post("/api/seed", async (req: Request, res: Response) => {
    try {
      // Check if GOD user exists
      let god = await storage.getUserByUsername("god");
      if (!god) {
        god = await storage.createUser({
          username: "god",
          password: hashPassword("godmode"),
          role: "GOD",
          fullName: "System Administrator",
          initials: "GOD",
          email: "god@navydive.console",
        });
      }

      // Create sample supervisor
      let supervisor = await storage.getUserByUsername("supervisor");
      if (!supervisor) {
        supervisor = await storage.createUser({
          username: "supervisor",
          password: hashPassword("supervisor123"),
          role: "SUPERVISOR",
          fullName: "John Smith",
          initials: "JS",
          email: "jsmith@navydive.console",
        });
      }

      // Create sample diver
      let diver = await storage.getUserByUsername("diver");
      if (!diver) {
        diver = await storage.createUser({
          username: "diver",
          password: hashPassword("diver123"),
          role: "DIVER",
          fullName: "Mike Johnson",
          initials: "MJ",
          email: "mjohnson@navydive.console",
        });
      }

      // Create sample project
      const projects = await storage.getAllProjects();
      let project = projects.find(p => p.name === "Pearl Harbor Inspection");
      if (!project) {
        project = await storage.createProject({
          name: "Pearl Harbor Inspection",
          clientName: "NAVFAC Pacific",
          jobsiteName: "Pearl Harbor Naval Shipyard",
          jobsiteAddress: "1 Dry Dock Way, Pearl Harbor, HI 96860",
          jobsiteLat: "21.3544",
          jobsiteLng: "-157.9501",
          timezone: "Pacific/Honolulu",
          emergencyContacts: [
            { name: "Base Emergency", role: "Emergency Services", phone: "808-555-0911" },
            { name: "NAVFAC POC", role: "Client Representative", phone: "808-555-1234" },
          ],
        });

        // Add members to project
        await storage.addProjectMember({ projectId: project.id, userId: god.id, role: "GOD" });
        await storage.addProjectMember({ projectId: project.id, userId: supervisor.id, role: "SUPERVISOR" });
        await storage.addProjectMember({ projectId: project.id, userId: diver.id, role: "DIVER" });
      }

      res.json({
        message: "Seed data created",
        users: { god: god.username, supervisor: supervisor.username, diver: diver.username },
        project: { id: project.id, name: project.name },
      });
    } catch (error) {
      console.error("Seed error:", error);
      res.status(500).json({ message: "Seed failed" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ──────────────────────────────────────────────────────────────────────────

  // Get user's dashboard layout
  app.get("/api/dashboard/layout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const layout = await storage.getDashboardLayout(user.id);
      
      if (!layout) {
        // Return default layout if none exists
        return res.json({
          widgets: [
            { id: "w1", type: "daily_summary", title: "Today's Summary", x: 0, y: 0, w: 2, h: 2 },
            { id: "w2", type: "active_dives", title: "Active Dives", x: 2, y: 0, w: 2, h: 2 },
            { id: "w3", type: "recent_logs", title: "Recent Log Entries", x: 0, y: 2, w: 2, h: 2 },
            { id: "w4", type: "safety_incidents", title: "Safety Status", x: 2, y: 2, w: 2, h: 1 },
          ],
          version: 1,
        });
      }
      
      res.json(layout.layoutData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Save user's dashboard layout
  app.post("/api/dashboard/layout", requireAuth, async (req: Request, res: Response) => {
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
  app.get("/api/dashboard/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const prefs = await storage.getUserPreferences(user.id);
      let projectId = prefs?.activeProjectId;
      
      if (!projectId) {
        const projects = await storage.getAllProjects();
        if (projects.length > 0) {
          projectId = projects[0].id;
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
        const day = await storage.getMostRecentDayByProject(projectId);
        const projectRisks = await storage.getRiskItemsByProject(projectId);
        if (day) {
          const dives = await storage.getDivesByDay(day.id);
          const logs = await storage.getLogEventsByDay(day.id);
          const activeDiveRecords = dives.filter(d => d.lsTime && !d.rsTime);
          const completedDiveRecords = dives.filter(d => d.lsTime && d.rsTime);
          
          stats = {
            totalDives: dives.length,
            activeDives: activeDiveRecords.length,
            activeDivers: activeDiveRecords.map(d => ({
              id: d.id,
              name: d.diverDisplayName || "Unknown",
              station: d.station || null,
              lsTime: d.lsTime,
            })),
            completedDives: completedDiveRecords.length,
            safetyIncidents: logs.filter(l => l.category === "safety").length,
            openRisks: projectRisks.filter(r => r.status === "open").length,
            recentRisks: projectRisks
              .filter(r => r.status === "open")
              .slice(0, 3)
              .map(r => ({ id: r.id, riskId: r.riskId, description: r.description, source: r.source })),
            logEntriesToday: logs.length,
            directivesToday: logs.filter(l => l.category === "directive").length,
            dayStatus: day.status,
            dayDate: day.date,
          };
        } else {
          stats.openRisks = projectRisks.filter(r => r.status === "open").length;
        }
      }
      
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/recent-logs", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const prefs = await storage.getUserPreferences(user.id);
      let projectId = prefs?.activeProjectId;
      
      if (!projectId) {
        const projects = await storage.getAllProjects();
        if (projects.length > 0) {
          projectId = projects[0].id;
        }
      }
      
      if (!projectId) {
        return res.json([]);
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
  // WEATHER API
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/weather", requireAuth, async (req: Request, res: Response) => {
    try {
      const { lat, lon, location } = req.query;
      const apiKey = process.env.OPENWEATHER_API_KEY;
      
      if (!apiKey) {
        return res.status(503).json({ 
          message: "Weather API not configured",
          configured: false 
        });
      }
      
      let queryParams = `appid=${apiKey}&units=metric`;
      
      if (lat && lon) {
        queryParams += `&lat=${lat}&lon=${lon}`;
      } else if (location) {
        queryParams += `&q=${encodeURIComponent(location as string)}`;
      } else {
        return res.status(400).json({ message: "Location or coordinates required" });
      }
      
      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?${queryParams}`
      );
      
      if (!weatherRes.ok) {
        const error = await weatherRes.text();
        return res.status(weatherRes.status).json({ message: error });
      }
      
      const data = await weatherRes.json();
      
      const hasThunderstorm = data.weather?.some((w: any) => 
        w.id >= 200 && w.id < 300
      );
      
      res.json({
        configured: true,
        location: data.name,
        country: data.sys?.country,
        temp: Math.round(data.main?.temp),
        feelsLike: Math.round(data.main?.feels_like),
        humidity: data.main?.humidity,
        windSpeed: data.wind?.speed,
        windDir: data.wind?.deg,
        conditions: data.weather?.[0]?.main,
        description: data.weather?.[0]?.description,
        icon: data.weather?.[0]?.icon,
        hasThunderstorm,
        visibility: data.visibility,
        pressure: data.main?.pressure,
        clouds: data.clouds?.all,
        sunrise: data.sys?.sunrise,
        sunset: data.sys?.sunset,
        timestamp: data.dt,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/weather/lightning", requireAuth, async (req: Request, res: Response) => {
    try {
      const { lat, lon } = req.query;
      const apiKey = process.env.OPENWEATHER_API_KEY;
      
      if (!apiKey) {
        return res.status(503).json({ 
          message: "Weather API not configured",
          configured: false 
        });
      }
      
      if (!lat || !lon) {
        return res.status(400).json({ message: "Coordinates required" });
      }
      
      const forecastRes = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
      );
      
      if (!forecastRes.ok) {
        const error = await forecastRes.text();
        return res.status(forecastRes.status).json({ message: error });
      }
      
      const data = await forecastRes.json();
      
      const alerts = data.list?.filter((item: any) => 
        item.weather?.some((w: any) => w.id >= 200 && w.id < 300)
      ).map((item: any) => ({
        time: item.dt,
        timeText: item.dt_txt,
        conditions: item.weather?.[0]?.description,
        probability: item.pop,
        temp: Math.round(item.main?.temp),
      })) || [];
      
      res.json({
        configured: true,
        location: data.city?.name,
        thunderstormAlerts: alerts,
        hasUpcomingStorms: alerts.length > 0,
        nextStormTime: alerts[0]?.time || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PROJECTS
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    const user = getUser(req);
    
    // GOD sees all projects, others see only their assigned projects
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
    res.json(project);
  });

  app.post("/api/projects", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const project = await storage.createProject(req.body);
      res.status(201).json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    const project = await storage.updateProject(req.params.id, req.body);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  // Set active project for user
  app.post("/api/projects/:id/activate", requireAuth, async (req: Request, res: Response) => {
    const user = getUser(req);
    await storage.setActiveProject(user.id, req.params.id);
    res.json({ message: "Active project set" });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DAYS
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/days", requireAuth, async (req: Request, res: Response) => {
    // Get the most recent day/shift for the project
    let day = await storage.getMostRecentDayByProject(req.params.projectId);
    
    // If no day exists and user can write, create one for today
    if (!day) {
      const user = getUser(req);
      if (canWriteLogEvents(user.role)) {
        const today = getTodayDate();
        day = await storage.createDay({
          projectId: req.params.projectId,
          date: today,
          shift: "1",
          status: "DRAFT",
          createdBy: user.id,
        });
      }
    }
    
    res.json(day ? [day] : []);
  });

  app.get("/api/days/:id", requireAuth, async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    res.json(day);
  });

  app.post("/api/projects/:projectId/days", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const date = req.body.date || getTodayDate();
    
    // Auto-generate shift number for this date
    const shiftCount = await storage.getShiftCountForDate(req.params.projectId, date);
    const shiftNumber = String(shiftCount + 1);
    
    const day = await storage.createDay({
      projectId: req.params.projectId,
      date,
      shift: shiftNumber,
      status: "DRAFT",
      createdBy: user.id,
    });
    res.status(201).json(day);
  });

  app.patch("/api/days/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    
    // Check if day is closed
    if (day.status === "CLOSED") {
      const user = getUser(req);
      if (!isGod(user.role)) {
        return res.status(403).json({ message: "Day is closed. Only GOD can edit." });
      }
    }
    
    const updated = await storage.updateDay(req.params.id, req.body);
    res.json(updated);
  });

  app.post("/api/days/:id/close", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const day = await storage.closeDay(req.params.id, user.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    res.json(day);
  });

  app.post("/api/days/:id/close-and-export", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const dayId = req.params.id;
    
    const day = await storage.closeDay(dayId, user.id);
    if (!day) return res.status(404).json({ message: "Day not found" });

    try {
      const exportResult = await generateShiftExport(dayId);
      
      const docCategoryMap: Record<string, "raw_notes" | "daily_log" | "master_log" | "dive_log" | "risk_register"> = {
        "RawNotes": "raw_notes",
        "DailyLog": "daily_log",
        "MasterLog": "master_log",
        "DL": "dive_log",
        "RRR": "risk_register",
      };

      for (const file of exportResult.files) {
        let docCategory: "raw_notes" | "daily_log" | "master_log" | "dive_log" | "risk_register" = "daily_log";
        for (const [prefix, category] of Object.entries(docCategoryMap)) {
          if (file.name.includes(prefix)) {
            docCategory = category;
            break;
          }
        }

        await storage.createLibraryExport({
          projectId: day.projectId,
          dayId: dayId,
          fileName: file.name,
          filePath: file.path,
          fileType: file.type,
          docCategory,
          fileData: file.buffer.toString("base64"),
          exportedBy: user.id,
        });
      }

      res.json({ 
        day,
        exportedFiles: exportResult.files.map(f => ({ name: f.name, path: f.path, type: f.type })),
      });
    } catch (error) {
      console.error("Export failed:", error);
      res.status(500).json({ message: "Day closed but export failed", day });
    }
  });

  app.post("/api/days/:id/reopen", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    if (day.status !== "CLOSED") return res.status(400).json({ message: "Day is not closed" });
    
    const reopened = await storage.reopenDay(req.params.id);
    if (!reopened) return res.status(500).json({ message: "Failed to reopen day" });
    
    const project = await storage.getProject(reopened.projectId);
    await storage.createLogEvent({
      dayId: reopened.id,
      projectId: reopened.projectId,
      authorId: user.id,
      rawText: `Day reopened by ${user.fullName || user.username}`,
      category: "directive",
      captureTime: new Date(),
      eventTime: new Date(),
      extractedJson: {},
    });
    
    res.json(reopened);
  });

  // Check midnight status
  app.get("/api/days/:id/status", requireAuth, async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    
    const today = getTodayDate();
    const isPastMidnight = day.date !== today;
    
    res.json({
      ...day,
      isPastMidnight,
      requiresConfirmation: isPastMidnight && day.status !== "CLOSED",
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LOG EVENTS (Core Event Sourcing)
  // ──────────────────────────────────────────────────────────────────────────

  // Validate log entry before submission (returns validation result without persisting)
  // Supports batch entries (slash-delimited or multi-line)
  app.post("/api/log-events/validate", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { rawText } = req.body;
      if (!rawText || typeof rawText !== "string") {
        return res.status(400).json({ message: "rawText is required" });
      }
      
      // Parse entries the same way as handleSend
      const timePattern = /^\d{3,4}\b/;
      const dashTimePattern = /^(\d{3,4})-(.+)$/;
      let entries: string[] = [];
      
      const DIVE_PLACEHOLDERS: Record<string, string> = {
        'L/S': '%%LS%%', 'R/S': '%%RS%%', 'L/B': '%%LB%%', 'R/B': '%%RB%%',
      };
      
      let lines = rawText.trim().split('\n').filter((line: string) => line.trim());
      
      if (lines.length === 1) {
        let text = lines[0];
        for (const [term, placeholder] of Object.entries(DIVE_PLACEHOLDERS)) {
          text = text.split(term).join(placeholder);
        }
        
        if (text.includes('/')) {
          const slashParts = text.split('/').map((p: string) => p.trim()).filter((p: string) => p);
          for (let part of slashParts) {
            for (const [term, placeholder] of Object.entries(DIVE_PLACEHOLDERS)) {
              part = part.split(placeholder).join(term);
            }
            const dashMatch = part.match(dashTimePattern);
            if (dashMatch) {
              entries.push(`${dashMatch[1]} ${dashMatch[2].replace(/-/g, ' ').trim()}`);
            } else {
              entries.push(part.replace(/-/g, ' '));
            }
          }
        }
      }
      
      if (entries.length === 0) {
        const timestampedLines = lines.filter((line: string) => timePattern.test(line.trim()));
        if (timestampedLines.length >= 2) {
          entries = lines.filter((line: string) => line.trim());
        }
      }
      
      if (entries.length === 0) {
        entries = [rawText.trim()];
      }
      
      // Validate each entry
      const results = await Promise.all(
        entries.map(async (entry: string) => {
          const result = await processStructuredLog(entry);
          return {
            entry,
            valid: result.validationPassed,
            payload: result.payload,
            errors: result.error ? [result.error] : [],
          };
        })
      );
      
      const allValid = results.every(r => r.valid);
      const allErrors = results.flatMap((r, i) => 
        r.errors.map(e => entries.length > 1 ? `Entry ${i + 1}: ${e}` : e)
      );
      
      res.json({
        valid: allValid,
        entries: results,
        errors: allErrors,
        totalEntries: entries.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create LogEvent - IMMEDIATE PERSISTENCE
  app.post("/api/log-events", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = logEventSchema.parse(req.body);
      const user = getUser(req);
      
      // Get day for date context
      const day = await storage.getDay(data.dayId);
      if (!day) return res.status(404).json({ message: "Day not found" });
      
      // Check if day is closed
      if (day.status === "CLOSED" && !isGod(user.role)) {
        return res.status(403).json({ message: "Day is closed" });
      }
      
      // Determine event time
      const captureTime = new Date();
      let eventTime: Date;
      
      if (data.eventTimeOverride) {
        eventTime = new Date(data.eventTimeOverride);
      } else {
        // Try to parse HHMM from raw text
        const parsedTime = parseEventTime(data.rawText, day.date);
        eventTime = parsedTime || captureTime;
      }
      
      // Classify and extract
      const category = classifyEvent(data.rawText);
      const extracted = extractData(data.rawText);
      
      // Create the log event IMMEDIATELY (event sourcing)
      const logEvent = await storage.createLogEvent({
        dayId: data.dayId,
        projectId: data.projectId,
        authorId: user.id,
        station: data.station || null,
        captureTime,
        eventTime,
        rawText: data.rawText,
        category,
        extractedJson: extracted,
      });
      
      // Activate day if it was draft
      if (day.status === "DRAFT") {
        await storage.updateDay(day.id, { status: "ACTIVE" });
      }
      
      // Process structured log asynchronously (normalize, classify, validate)
      processStructuredLog(data.rawText)
        .then(async (result) => {
          // Only store structured payload if validation passed
          if (result.validationPassed) {
            await storage.updateLogEvent(logEvent.id, {
              structuredPayload: result.payload as any,
              validationPassed: true,
            });
            
            // Create risk items only from validated payload
            if (result.payload.risks && result.payload.risks.length > 0) {
              const existingRisks = await storage.getRiskItemsByProject(data.projectId);
              const maxRiskNum = existingRisks
                .map(r => r.riskId)
                .filter(id => id.startsWith("RR-"))
                .map(id => Number(id.slice(3)))
                .filter(n => Number.isFinite(n))
                .reduce((a, b) => Math.max(a, b), 0);

              for (let i = 0; i < result.payload.risks.length; i++) {
                const risk = result.payload.risks[i];
                const riskId = `RR-${String(maxRiskNum + i + 1).padStart(3, "0")}`;
                const isDirective = (risk as any).trigger?.toLowerCase().includes("client") ||
                  (risk as any).trigger?.toLowerCase().includes("directive");
                await storage.createRiskItem({
                  dayId: day.id,
                  projectId: data.projectId,
                  riskId,
                  triggerEventId: logEvent.id,
                  description: `${(risk as any).trigger || risk.description}. Impact: ${(risk as any).impact || ""}`.trim(),
                  category: "operational",
                  source: isDirective ? "client_directive" : "field_observation",
                  affectedTask: (risk as any).affected_task || null,
                  initialRiskLevel: "med",
                  status: "open",
                  owner: (risk as any).owner || null,
                });
              }
            }
          } else {
            // Mark as failed validation without storing bad payload
            await storage.updateLogEvent(logEvent.id, {
              validationPassed: false,
            });
            console.warn("Structured log validation failed:", result.error);
          }
        })
        .catch(err => console.error("Structured log processing failed:", err));
      
      // Generate AI renders asynchronously (don't block the response)
      generateAIRenders(data.rawText, eventTime, category)
        .then(async (renders) => {
          // Store internal canvas render
          await storage.createLogRender({
            logEventId: logEvent.id,
            renderType: "internal_canvas_line",
            renderText: renders.internalCanvasLine,
            section: renders.section,
            model: renders.model,
            promptVersion: renders.promptVersion,
            status: renders.status,
          });
          
          // Store master log render
          await storage.createLogRender({
            logEventId: logEvent.id,
            renderType: "master_log_line",
            renderText: renders.masterLogLine,
            section: renders.section,
            model: renders.model,
            promptVersion: renders.promptVersion,
            status: renders.status,
          });
          
          try {
            await storage.updateLogEvent(logEvent.id, {
              aiAnnotations: renders.annotations || [],
            });
          } catch (annotErr) {
            console.error("Failed to save AI annotations:", annotErr);
          }
          
        })
        .catch((error) => {
          console.error("AI rendering failed:", error);
        });
      
      // If safety incident, create a risk item synchronously
      if (category === "safety") {
        const existingRisks = await storage.getRiskItemsByDay(day.id);
        const riskId = generateRiskId(day.date, existingRisks.length + 1);
        
        await storage.createRiskItem({
          dayId: day.id,
          projectId: data.projectId,
          riskId,
          triggerEventId: logEvent.id,
          category: "safety",
          description: data.rawText,
          status: "open",
        });
      }
      
      // If dive operation, create/update dive record for the diver synchronously
      if (extracted.diveOperation) {
        const diverIdentifiers = extracted.diverNames || extracted.diverInitials || [];
        const station = data.station || null;
        
        for (const identifier of diverIdentifiers) {
          const initials = identifier.length <= 3 ? identifier : undefined;
          let dive;
          
          if (initials) {
            const diver = await storage.getUserByInitials(initials, data.projectId);
            if (diver) {
              dive = await storage.getOrCreateDiveForDiver(day.id, data.projectId, diver.id, station || undefined);
              if (!dive.diverDisplayName) {
                await storage.updateDive(dive.id, { diverDisplayName: diver.fullName || diver.username });
              }
            } else {
              dive = await storage.getOrCreateDiveByDisplayName(day.id, data.projectId, initials, station || undefined);
            }
          } else {
            const nameParts = identifier.split(/[.\s]/);
            const firstInitial = nameParts[0]?.charAt(0)?.toUpperCase() || "";
            const lastName = nameParts[nameParts.length - 1] || "";
            const searchInitials = `${firstInitial}${lastName.charAt(0).toUpperCase()}`;
            
            const diver = await storage.getUserByInitials(searchInitials, data.projectId);
            if (diver) {
              dive = await storage.getOrCreateDiveForDiver(day.id, data.projectId, diver.id, station || undefined);
              if (!dive.diverDisplayName) {
                await storage.updateDive(dive.id, { diverDisplayName: diver.fullName || identifier });
              }
            } else {
              dive = await storage.getOrCreateDiveByDisplayName(day.id, data.projectId, identifier, station || undefined);
            }
          }
          
          if (dive) {
            const timeField = `${extracted.diveOperation}Time` as 'lsTime' | 'rbTime' | 'lbTime' | 'rsTime';
            await storage.updateDiveTimes(dive.id, timeField, eventTime, extracted.depthFsw);
            
            const rawStripped = data.rawText.replace(/^\d{3,4}\s*/, '').trim();
            if (rawStripped) {
              const currentDive = await storage.getDive(dive.id);
              const existing = currentDive?.taskSummary;
              if (existing) {
                if (!existing.includes(rawStripped)) {
                  const combined = `${existing} | ${rawStripped}`;
                  await storage.updateDive(dive.id, { taskSummary: combined });
                }
              } else {
                await storage.updateDive(dive.id, { taskSummary: rawStripped });
              }
            }
          }
        }
      }
      
      // Return immediately with the persisted event
      res.status(201).json({
        ...logEvent,
        category,
        extracted,
        autosaved: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("LogEvent creation error:", error);
      res.status(500).json({ message: "Failed to create log event" });
    }
  });

  // Get all log events for a day (ordered by eventTime then captureTime)
  app.get("/api/days/:dayId/log-events", requireAuth, async (req: Request, res: Response) => {
    const events = await storage.getLogEventsByDay(req.params.dayId);
    
    // Fetch renders for each event
    const eventsWithRenders = await Promise.all(
      events.map(async (event) => {
        const renders = await storage.getLogRendersByEvent(event.id);
        return {
          ...event,
          renders,
        };
      })
    );
    
    res.json(eventsWithRenders);
  });

  // Edit eventTime (requires edit_reason)
  app.patch("/api/log-events/:id/event-time", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = editEventTimeSchema.parse(req.body);
      
      const event = await storage.getLogEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Log event not found" });
      
      // Check if day is closed
      const day = await storage.getDay(event.dayId);
      if (day?.status === "CLOSED") {
        const user = getUser(req);
        if (!isGod(user.role)) {
          return res.status(403).json({ message: "Day is closed" });
        }
      }
      
      const updated = await storage.updateLogEvent(req.params.id, {
        eventTime: new Date(data.eventTime),
        editReason: data.editReason,
      });
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update event time" });
    }
  });

  // Edit log event raw text
  app.patch("/api/log-events/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { rawText, editReason } = req.body;
      if (!rawText || typeof rawText !== "string") {
        return res.status(400).json({ message: "rawText is required" });
      }

      const event = await storage.getLogEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Log event not found" });

      const day = await storage.getDay(event.dayId);
      if (day?.status === "CLOSED") {
        const user = getUser(req);
        if (!isGod(user.role)) {
          return res.status(403).json({ message: "Day is closed" });
        }
      }

      const updated = await storage.updateLogEvent(req.params.id, {
        rawText: rawText.trim(),
        editReason: editReason || "Manual edit",
      });

      res.json(updated);
    } catch (error) {
      console.error("LogEvent edit error:", error);
      res.status(500).json({ message: "Failed to update log event" });
    }
  });

  // Retry AI render
  app.post("/api/log-events/:id/retry-render", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const event = await storage.getLogEvent(req.params.id);
    if (!event) return res.status(404).json({ message: "Log event not found" });
    
    try {
      const renders = await generateAIRenders(
        event.rawText,
        new Date(event.eventTime),
        event.category as any
      );
      
      // Create new renders
      await storage.createLogRender({
        logEventId: event.id,
        renderType: "internal_canvas_line",
        renderText: renders.internalCanvasLine,
        section: renders.section,
        model: renders.model,
        promptVersion: renders.promptVersion,
        status: renders.status,
      });
      
      await storage.createLogRender({
        logEventId: event.id,
        renderType: "master_log_line",
        renderText: renders.masterLogLine,
        section: renders.section,
        model: renders.model,
        promptVersion: renders.promptVersion,
        status: renders.status,
      });
      
      res.json(renders);
    } catch (error) {
      res.status(500).json({ message: "Retry failed" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIVES (Derived from LogEvents)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/days/:dayId/dives", requireAuth, async (req: Request, res: Response) => {
    const dives = await storage.getDivesByDay(req.params.dayId);
    const logEvents = await storage.getLogEventsByDay(req.params.dayId);
    
    const allEventIds = logEvents.map(e => e.id);
    const allRenders = allEventIds.length > 0
      ? await Promise.all(allEventIds.map(id => storage.getLogRendersByEvent(id)))
      : [];
    const rendersByEventId = new Map<string, typeof allRenders[0]>();
    allEventIds.forEach((id, i) => rendersByEventId.set(id, allRenders[i]));
    
    const enriched = dives.map((dive) => {
      const relatedLogs = logEvents.filter(e => {
        if (!e.rawText) return false;
        const name = dive.diverDisplayName || "";
        const raw = e.rawText.toUpperCase();
        if (name && raw.includes(name.toUpperCase())) return true;
        if (name.length > 3) {
          const parts = name.split(/[\s.]+/).filter(Boolean);
          if (parts.length >= 2) {
            const initials = `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
            if (raw.includes(initials) && (e.category === "dive_op" || raw.includes("L/S") || raw.includes("R/S") || raw.includes("L/B") || raw.includes("R/B"))) return true;
          }
        }
        return false;
      });
      
      const logSummaries = relatedLogs.slice(0, 5).map(log => {
        const renders = rendersByEventId.get(log.id) || [];
        const masterRender = renders.find(r => r.renderType === "master_log_line");
        return {
          id: log.id,
          eventTime: log.eventTime,
          rawText: log.rawText,
          masterLogLine: masterRender?.renderText || null,
          category: log.category,
          station: log.station,
        };
      });
      
      return { ...dive, relatedLogs: logSummaries };
    });
    
    res.json(enriched);
  });

  app.get("/api/users/:userId/dives", requireAuth, async (req: Request, res: Response) => {
    const dives = await storage.getDivesByDiver(req.params.userId, req.query.dayId as string);
    res.json(dives);
  });

  // Update dive PSG-LOG-01 fields (supervisor edit)
  app.patch("/api/dives/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const dive = await storage.getDive(req.params.id);
      if (!dive) return res.status(404).json({ message: "Dive not found" });
      
      const allowedFields = [
        "diverDisplayName", "diverBadgeId", "station", "workLocation",
        "maxDepthFsw", "taskSummary", "toolsEquipment", "installMaterialIds",
        "qcDisposition", "verifier", "decompRequired", "decompMethod",
        "postDiveStatus", "photoVideoRefs", "supervisorInitials", "notes",
        "lsTime", "rbTime", "lbTime", "rsTime",
      ];
      
      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const updated = await storage.updateDive(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Dive update error:", error);
      res.status(500).json({ message: "Failed to update dive" });
    }
  });

  // Generate AI task summary for a dive from its related log events
  app.post("/api/dives/:id/generate-summary", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const dive = await storage.getDive(req.params.id);
      if (!dive) return res.status(404).json({ message: "Dive not found" });
      
      const events = await storage.getLogEventsByDay(dive.dayId);
      const diverName = dive.diverDisplayName || "";
      const diverInitials = diverName.length <= 3 ? diverName : 
        diverName.split(/[.\s]/).filter(p => p.length > 0).map(p => p.charAt(0).toUpperCase()).join("");
      
      let rosterName = "";
      if (dive.diverId) {
        const diverUser = await storage.getUser(dive.diverId);
        if (diverUser) {
          rosterName = diverUser.fullName || diverUser.username || "";
        }
      }
      
      const relatedEvents = events.filter(e => {
        const text = e.rawText;
        if (diverName && text.includes(diverName)) return true;
        if (rosterName && rosterName !== diverName && text.includes(rosterName)) return true;
        if (diverInitials && diverInitials.length >= 2 && new RegExp(`\\b${diverInitials}\\b`).test(text)) return true;
        return false;
      });
      
      if (relatedEvents.length === 0) {
        return res.json({ taskSummary: dive.taskSummary || "UNKNOWN" });
      }
      
      const rawEntries = relatedEvents
        .sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime())
        .map(e => e.rawText)
        .join("\n");
      
      try {
        const openai = new (await import("openai")).default({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        
        const response = await openai.chat.completions.create({
          model: "gpt-5.2",
          max_tokens: 200,
          messages: [
            {
              role: "system",
              content: `You summarize dive tasks for PSG-LOG-01 forms. Create a concise "Task / Work Accomplished" summary from raw log entries for a single diver. Include specific tasks, equipment, and locations. Do NOT calculate dive times or decompression data. Keep it factual and brief (1-3 sentences).`
            },
            {
              role: "user",
              content: `Diver: ${diverName}\nRaw log entries:\n${rawEntries}\n\nWrite the Task / Work Accomplished summary.`
            }
          ],
        });
        
        const summary = response.choices[0]?.message?.content?.trim() || dive.taskSummary || "UNKNOWN";
        await storage.updateDive(dive.id, { taskSummary: summary });
        res.json({ taskSummary: summary });
      } catch (aiErr) {
        console.error("AI task summary failed:", aiErr);
        const fallback = relatedEvents.map(e => e.rawText).join("; ");
        await storage.updateDive(dive.id, { taskSummary: fallback });
        res.json({ taskSummary: fallback });
      }
    } catch (error) {
      console.error("Generate summary error:", error);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  // Diver confirm/flag their dive
  app.post("/api/dives/:id/confirm", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = diveConfirmSchema.parse(req.body);
      const user = getUser(req);
      
      const dive = await storage.getDive(req.params.id);
      if (!dive) return res.status(404).json({ message: "Dive not found" });
      
      // Diver can only confirm their own dives
      if (user.role === "DIVER" && dive.diverId !== user.id) {
        return res.status(403).json({ message: "Cannot confirm another diver's dive" });
      }
      
      const confirmation = await storage.createDiveConfirmation({
        diveId: req.params.id,
        diverId: user.id,
        status: data.status,
        note: data.note || null,
      });
      
      res.status(201).json(confirmation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to confirm dive" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RISK ITEMS
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/days/:dayId/risks", requireAuth, async (req: Request, res: Response) => {
    const risks = await storage.getRiskItemsByDay(req.params.dayId);
    res.json(risks);
  });

  app.get("/api/projects/:projectId/risks", requireAuth, async (req: Request, res: Response) => {
    const risks = await storage.getRiskItemsByProject(req.params.projectId);
    const enriched = await Promise.all(risks.map(async (risk) => {
      if (risk.triggerEventId) {
        const triggerEvent = await storage.getLogEvent(risk.triggerEventId);
        if (triggerEvent) {
          const renders = await storage.getLogRendersByEvent(triggerEvent.id);
          const masterRender = renders.find(r => r.renderType === "master_log_line");
          return {
            ...risk,
            triggerEventTime: triggerEvent.eventTime,
            triggerRawText: triggerEvent.rawText,
            triggerMasterLine: masterRender?.renderText || null,
          };
        }
      }
      return risk;
    }));
    res.json(enriched);
  });

  app.get("/api/risks/:id", requireAuth, async (req: Request, res: Response) => {
    const risk = await storage.getRiskItem(req.params.id);
    if (!risk) return res.status(404).json({ message: "Risk not found" });
    
    // Include trigger event
    let triggerEvent = null;
    if (risk.triggerEventId) {
      triggerEvent = await storage.getLogEvent(risk.triggerEventId);
    }
    
    res.json({ ...risk, triggerEvent });
  });

  app.patch("/api/risks/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = riskUpdateSchema.parse(req.body);
      
      const risk = await storage.getRiskItem(req.params.id);
      if (!risk) return res.status(404).json({ message: "Risk not found" });
      
      const updated = await storage.updateRiskItem(req.params.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update risk" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPEECH-TO-TEXT (PTT Transcription)
  // ──────────────────────────────────────────────────────────────────────────

  const audioBodyParser = express.json({ limit: "50mb" });

  app.post("/api/transcribe", audioBodyParser, async (req: Request, res: Response) => {
    try {
      const { audio } = req.body;
      if (!audio) {
        return res.status(400).json({ error: "Audio data (base64) required" });
      }

      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer: audioBuffer, format } = await ensureCompatibleFormat(rawBuffer);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await speechToTextStream(audioBuffer, format);
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: "Transcription failed" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MASTER LOG (Client-facing derived view)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/days/:dayId/master-log", requireAuth, async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.dayId);
    if (!day) return res.status(404).json({ message: "Day not found" });
    
    const events = await storage.getLogEventsByDay(req.params.dayId);
    
    // Group by legacy sections AND new station-based structure
    const sections: Record<string, any[]> = {
      ops: [],
      dive: [],
      directives: [],
      safety: [],
      risk: [],
    };
    
    const stationEntries: Record<string, any[]> = {};
    const directiveEntries: any[] = [];
    const conflictEntries: any[] = [];
    const operationalNotes: any[] = [];
    const riskEntries: any[] = [];
    
    for (const event of events) {
      const renders = await storage.getLogRendersByEvent(event.id);
      const masterRender = renders.find(r => r.renderType === "master_log_line");
      
      const sectionKey = getMasterLogSection(event.category as any);
      const entry = {
        id: event.id,
        eventTime: event.eventTime,
        rawText: event.rawText,
        masterLogLine: masterRender?.renderText || event.rawText,
        status: masterRender?.status || "ok",
        station: event.station || null,
        category: event.category,
      };
      
      sections[sectionKey].push(entry);
      
      if (event.category === "directive") {
        directiveEntries.push(entry);
      } else if (event.category === "safety") {
        riskEntries.push(entry);
      } else {
        const stationName = event.station || "General Operations";
        if (!stationEntries[stationName]) stationEntries[stationName] = [];
        stationEntries[stationName].push(entry);
      }
    }
    
    // Build station logs grouped by station
    const stationLogs = Object.entries(stationEntries).map(([station, entries]) => ({
      station,
      entries: entries.sort((a: any, b: any) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()),
    }));
    
    // Get dives for this day with diver info
    const dives = await storage.getDivesByDay(req.params.dayId);
    const divesWithNames = await Promise.all(dives.map(async (dive) => {
      let diverName = dive.diverDisplayName || "Unknown";
      if (dive.diverId) {
        const diver = await storage.getUser(dive.diverId);
        if (diver) diverName = diver.fullName || diver.username || diverName;
      }
      return {
        ...dive,
        diverName,
      };
    }));
    
    // Calculate summary from log events
    const allDiverNames = new Set<string>();
    let diveStartCount = 0;
    let extractedMaxDepth = 0;
    
    for (const event of events) {
      const text = event.rawText;
      const upper = text.toUpperCase();
      
      const nameBeforeDiveOp = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+L\/?S\b/g);
      if (nameBeforeDiveOp) {
        nameBeforeDiveOp.forEach(m => {
          const name = m.replace(/\s+L\/?S$/i, '').trim();
          if (name.length > 1) allDiverNames.add(name);
        });
      }
      
      const initialDotName = text.match(/([A-Z]\.[A-Z][a-z]+)/g);
      if (initialDotName) {
        initialDotName.forEach(n => allDiverNames.add(n));
      }
      
      const initialsBeforeDiveOp = upper.match(/\b([A-Z]{2})\s+(?:L\/?S|R\/?B|L\/?B|R\/?S)\b/g);
      if (initialsBeforeDiveOp) {
        initialsBeforeDiveOp.forEach(m => {
          const initials = m.split(/\s+/)[0];
          if (initials && initials.length === 2) allDiverNames.add(initials);
        });
      }
      
      const lsMatches = upper.match(/\bL\/?S\b/g);
      if (lsMatches) diveStartCount += lsMatches.length;
      
      const depthMatch = upper.match(/(\d+)\s*FSW/i);
      if (depthMatch) {
        const depth = parseInt(depthMatch[1], 10);
        if (depth > extractedMaxDepth) extractedMaxDepth = depth;
      }
    }
    
    const uniqueDivers = dives.length > 0 
      ? new Set(dives.map(d => d.diverDisplayName || d.diverId))
      : allDiverNames;
    const maxDepth = Math.max(
      extractedMaxDepth,
      ...dives.map(d => d.maxDepthFsw || 0)
    );
    const totalDives = dives.length > 0 ? dives.length : Math.max(diveStartCount, sections.dive.length);
    const totalDivers = dives.length > 0 ? uniqueDivers.size : Math.max(allDiverNames.size, 1);

    // Get risk items for this day
    const risks = await storage.getRiskItemsByDay(req.params.dayId);
    
    res.json({
      day,
      isLocked: day.status === "CLOSED",
      isDraft: day.status !== "CLOSED",
      sections,
      stationLogs,
      directiveEntries: directiveEntries.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()),
      conflictEntries,
      operationalNotes,
      riskEntries,
      risks,
      dives: divesWithNames,
      summary: {
        totalDives,
        totalDivers,
        maxDepth,
        safetyIncidents: sections.safety.length,
        directivesCount: sections.directives.length,
        extractedDiverInitials: Array.from(allDiverNames),
      },
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIVE PLANS
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/dive-plans", requireAuth, async (req: Request, res: Response) => {
    const plans = await storage.getDivePlansByProject(req.params.projectId);
    res.json(plans);
  });

  app.get("/api/dive-plans/:id", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Dive plan not found" });
    res.json(plan);
  });

  app.post("/api/projects/:projectId/dive-plans", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    
    const plan = await storage.createDivePlan({
      projectId: req.params.projectId,
      dayId: req.body.dayId || null,
      status: "Draft",
      planVersion: 1,
      planJson: req.body.planJson || {},
      createdBy: user.id,
    });
    
    res.status(201).json(plan);
  });

  app.patch("/api/dive-plans/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const plan = await storage.getDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Dive plan not found" });
    
    // Check if closed - only ADMIN/GOD can reopen
    if (plan.status === "Closed") {
      const user = getUser(req);
      if (!isAdminOrHigher(user.role)) {
        return res.status(403).json({ message: "Only Admin can reopen closed plans" });
      }
      
      // Reopening increments version
      if (req.body.status === "Draft") {
        req.body.planVersion = plan.planVersion + 1;
      }
    }
    
    const updated = await storage.updateDivePlan(req.params.id, req.body);
    res.json(updated);
  });

  app.post("/api/dive-plans/:id/close", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const plan = await storage.getDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Dive plan not found" });
    
    // TODO: Add validation for required sections and verified directory
    
    const updated = await storage.updateDivePlan(req.params.id, {
      status: "Closed",
      closedBy: user.id,
      closedAt: new Date(),
    });
    
    res.json(updated);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // STATIONS (within dive plans)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/dive-plans/:divePlanId/stations", requireAuth, async (req: Request, res: Response) => {
    const stations = await storage.getStationsByDivePlan(req.params.divePlanId);
    res.json(stations);
  });

  app.post("/api/dive-plans/:divePlanId/stations", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const plan = await storage.getDivePlan(req.params.divePlanId);
    if (!plan) return res.status(404).json({ message: "Dive plan not found" });
    
    const station = await storage.createStation({
      ...req.body,
      divePlanId: req.params.divePlanId,
    });
    
    res.status(201).json(station);
  });

  app.get("/api/stations/:id", requireAuth, async (req: Request, res: Response) => {
    const station = await storage.getStation(req.params.id);
    if (!station) return res.status(404).json({ message: "Station not found" });
    res.json(station);
  });

  app.patch("/api/stations/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const station = await storage.getStation(req.params.id);
    if (!station) return res.status(404).json({ message: "Station not found" });
    
    const updated = await storage.updateStation(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/stations/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const station = await storage.getStation(req.params.id);
    if (!station) return res.status(404).json({ message: "Station not found" });
    
    await storage.deleteStation(req.params.id);
    res.status(204).send();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIVE LOG DETAILS
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/dives/:diveId/details", requireAuth, async (req: Request, res: Response) => {
    const details = await storage.getDiveLogDetails(req.params.diveId);
    if (!details) return res.status(404).json({ message: "Dive log details not found" });
    res.json(details);
  });

  app.post("/api/dives/:diveId/details", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const dive = await storage.getDive(req.params.diveId);
    if (!dive) return res.status(404).json({ message: "Dive not found" });
    
    const existing = await storage.getDiveLogDetails(req.params.diveId);
    if (existing) {
      const updated = await storage.updateDiveLogDetails(existing.id, req.body);
      return res.json(updated);
    }
    
    const details = await storage.createDiveLogDetails({
      ...req.body,
      diveId: req.params.diveId,
    });
    
    res.status(201).json(details);
  });

  app.patch("/api/dive-details/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const updated = await storage.updateDiveLogDetails(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Dive log details not found" });
    res.json(updated);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DAILY SUMMARIES
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/days/:dayId/summary", requireAuth, async (req: Request, res: Response) => {
    const summary = await storage.getDailySummary(req.params.dayId);
    if (!summary) return res.status(404).json({ message: "Daily summary not found" });
    res.json(summary);
  });

  app.post("/api/days/:dayId/summary", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.dayId);
    if (!day) return res.status(404).json({ message: "Day not found" });
    
    const summary = await storage.createOrUpdateDailySummary({
      ...req.body,
      dayId: req.params.dayId,
      projectId: day.projectId,
    });
    
    res.json(summary);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WORK LIBRARY & COMPANY DATA
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/work-library", requireAuth, async (_req: Request, res: Response) => {
    const items = await storage.getActiveWorkLibraryItems();
    res.json(items);
  });

  app.get("/api/companies", requireAuth, async (_req: Request, res: Response) => {
    const companies = await storage.getAllCompanies();
    res.json(companies);
  });

  app.get("/api/companies/:companyId/roles", requireAuth, async (req: Request, res: Response) => {
    const roles = await storage.getCompanyRoles(req.params.companyId as string);
    res.json(roles);
  });

  app.get("/api/companies/:companyId/contact-defaults", requireAuth, async (req: Request, res: Response) => {
    const defaults = await storage.getCompanyContactsDefaults(req.params.companyId as string);
    res.json(defaults);
  });

  app.get("/api/projects/:projectId/work-selections", requireAuth, async (req: Request, res: Response) => {
    const selections = await storage.getProjectWorkSelections(req.params.projectId as string);
    res.json(selections);
  });

  app.put("/api/projects/:projectId/work-selections", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const { workItemIds } = req.body;
    await storage.setProjectWorkSelections(req.params.projectId as string, workItemIds || []);
    const selections = await storage.getProjectWorkSelections(req.params.projectId as string);
    res.json(selections);
  });

  app.get("/api/projects/:projectId/contacts", requireAuth, async (req: Request, res: Response) => {
    const contacts = await storage.getProjectContacts(req.params.projectId as string);
    res.json(contacts);
  });

  app.put("/api/projects/:projectId/contacts/:roleId", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const { name, phone, email } = req.body;
    const contact = await storage.setProjectContact(
      req.params.projectId as string,
      req.params.roleId as string,
      name,
      phone,
      email
    );
    res.json(contact);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIVE PLAN TEMPLATES
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/dive-plan-templates", requireAuth, async (req: Request, res: Response) => {
    const templates = await storage.getDivePlanTemplates();
    res.json(templates);
  });

  app.post("/api/dive-plan-templates", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const template = await storage.createDivePlanTemplate({
      ...req.body,
      uploadedBy: user.id,
    });
    res.status(201).json(template);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PROJECT DIVE PLANS (Project-level document generator)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/project-dive-plans", requireAuth, async (req: Request, res: Response) => {
    const plans = await storage.getProjectDivePlansByProject(req.params.projectId);
    res.json(plans);
  });

  app.get("/api/projects/:projectId/project-dive-plans/active", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getActiveProjectDivePlan(req.params.projectId);
    if (!plan) return res.status(404).json({ message: "No approved dive plan found" });
    res.json(plan);
  });

  app.get("/api/project-dive-plans/:id", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getProjectDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
    res.json(plan);
  });

  app.post("/api/projects/:projectId/project-dive-plans", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    
    const latestRevision = await storage.getLatestProjectDivePlanRevision(req.params.projectId);
    const newRevision = latestRevision + 1;
    
    const plan = await storage.createProjectDivePlan({
      ...req.body,
      projectId: req.params.projectId,
      revision: newRevision,
      createdBy: user.id,
    });
    
    res.status(201).json(plan);
  });

  app.patch("/api/project-dive-plans/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const plan = await storage.getProjectDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
    
    if (plan.status === "Approved" || plan.status === "Superseded") {
      return res.status(400).json({ message: "Cannot modify approved or superseded plans" });
    }
    
    const updated = await storage.updateProjectDivePlan(req.params.id, req.body);
    res.json(updated);
  });

  app.post("/api/project-dive-plans/:id/submit", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const plan = await storage.getProjectDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
    
    if (plan.status !== "Draft") {
      return res.status(400).json({ message: "Only draft plans can be submitted" });
    }
    
    const updated = await storage.updateProjectDivePlan(req.params.id, {
      status: "Submitted",
      submittedBy: user.id,
      submittedAt: new Date(),
    });
    
    res.json(updated);
  });

  app.post("/api/project-dive-plans/:id/approve", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const plan = await storage.getProjectDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
    
    if (plan.status !== "Submitted") {
      return res.status(400).json({ message: "Only submitted plans can be approved" });
    }
    
    const currentActive = await storage.getActiveProjectDivePlan(plan.projectId);
    if (currentActive && currentActive.id !== plan.id) {
      await storage.updateProjectDivePlan(currentActive.id, {
        status: "Superseded",
        supersededBy: plan.id,
      });
    }
    
    const updated = await storage.updateProjectDivePlan(req.params.id, {
      status: "Approved",
      approvedBy: user.id,
      approvedAt: new Date(),
    });
    
    res.json(updated);
  });

  app.post("/api/project-dive-plans/:id/new-revision", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    const existingPlan = await storage.getProjectDivePlan(req.params.id);
    if (!existingPlan) return res.status(404).json({ message: "Project dive plan not found" });
    
    const latestRevision = await storage.getLatestProjectDivePlanRevision(existingPlan.projectId);
    const newRevision = latestRevision + 1;
    
    const newPlan = await storage.createProjectDivePlan({
      projectId: existingPlan.projectId,
      templateId: existingPlan.templateId,
      revision: newRevision,
      status: "Draft",
      planData: existingPlan.planData,
      createdBy: user.id,
    });
    
    res.status(201).json(newPlan);
  });

  app.delete("/api/project-dive-plans/:id", requireRole("SUPERVISOR", "GOD"), async (req: Request, res: Response) => {
    const plan = await storage.getProjectDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });

    if (plan.status === "Approved") {
      const user = req.user as any;
      if (user.role !== "GOD") {
        return res.status(403).json({ message: "Only GOD role can delete approved plans" });
      }
    }

    const deleted = await storage.deleteProjectDivePlan(req.params.id);
    if (!deleted) return res.status(500).json({ message: "Failed to delete plan" });
    res.json({ message: "Plan deleted" });
  });

  app.post("/api/dive-plan/ai-generate", requireRole("SUPERVISOR", "GOD", "ADMIN"), async (req: Request, res: Response) => {
    try {
      const { messages, currentPlan, projectContext } = req.body;
      
      const openai = new (await import("openai")).default({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const taskLibrary = (await import("@shared/schema")).DD5_CONTROLLED_TASK_LIBRARY;

      const systemPrompt = `You are a DD5 Dive Plan document generator for Precision Subsea Group LLC. The supervisor will describe their dive operation in natural, everyday language. Your job is to extract the information and produce a structured JSON dive plan document.

## OUTPUT FORMAT
You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation) matching this exact structure:
{
  "chatSummary": "A brief 1-sentence description of what you changed or added in this update. Be specific about which sections were updated.",
  "coverPage": {
    "companyName": "Precision Subsea Group LLC",
    "projectTitle": "",
    "jobNumber": "",
    "client": "",
    "siteLocation": "",
    "submissionDate": "",
    "revisionNumber": 0
  },
  "projectContacts": {
    "primeContractor": "",
    "siteAddress": "",
    "keyContacts": [{ "name": "", "role": "", "phone": "", "email": "" }]
  },
  "natureOfWork": {
    "selectedTasks": []
  },
  "scopeOfWork": "",
  "divingMode": "",
  "maxDepth": "",
  "estimatedDuration": "",
  "personnelCount": "",
  "equipmentNotes": "",
  "siteConditions": "",
  "hazardNotes": "",
  "additionalNotes": "",
  "decompressionSchedules": ""
}

## FIELD DEFINITIONS
- "chatSummary": A unique, specific 1-sentence summary of what you changed. Example: "Added project contacts and updated max depth to 67 ft." NEVER repeat the same summary twice.
- "equipmentNotes": ONLY list diving equipment, tools, and gear. Examples: "KM-37 helmets, Broco underwater cutting torch, pneumatic grinder." Do NOT include personnel, procedures, or site conditions here.
- "decompressionSchedules": Information about decompression tables, no-decompression limits, table profiles being used. Example: "No-decompression dives using USN 45 ft, 60 ft, and 70 ft table profiles."
- "siteConditions": Environmental and site factors. Currents, visibility, water temp, bottom conditions, marine traffic.
- "hazardNotes": Identified hazards and mitigations only.
- "additionalNotes": Anything that doesn't fit other fields.

## RULES
1. Fill in ONLY what the supervisor has mentioned. Leave fields as empty strings if not discussed.
2. For "selectedTasks", ONLY use values from this approved list: ${JSON.stringify(taskLibrary)}
3. For "scopeOfWork", write a professional 2-4 sentence summary of what the dive operation involves.
4. If the supervisor mentions depths, diving methods (SCUBA, surface-supplied), number of divers, equipment, site conditions, or hazards, populate the appropriate fields.
5. Write professionally - convert casual language into formal dive plan language while preserving all factual details.
6. Each new message may add or modify information. Merge it with the existing plan data intelligently — preserve all previously populated fields.
7. NEVER invent information not provided by the supervisor.
8. Convert informal names/descriptions to proper technical terminology where appropriate.
9. Keep each field strictly within its defined purpose — do not bleed content between fields.

## PROJECT CONTEXT (pre-populated from project settings)
${projectContext ? JSON.stringify(projectContext) : "No project context available"}

## CURRENT PLAN STATE
${currentPlan ? JSON.stringify(currentPlan) : "Empty - starting fresh"}

Respond with ONLY the updated JSON object. No other text.`;

      const chatMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 2000,
        temperature: 0.3,
        messages: chatMessages,
        stream: true,
      });

      let fullContent = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullContent += delta;
          res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
        }
      }

      try {
        let jsonStr = fullContent.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }
        const planData = JSON.parse(jsonStr);
        res.write(`data: ${JSON.stringify({ type: "plan", data: planData })}\n\n`);
      } catch {
        res.write(`data: ${JSON.stringify({ type: "error", message: "Failed to parse plan data" })}\n\n`);
      }

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("AI dive plan generation failed:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
      }
    }
  });

  app.get("/api/project-dive-plans/:id/download", requireAuth, async (req: Request, res: Response) => {
    const { generateDD5DivePlanDocx } = await import("./dive-plan-generator");
    
    const plan = await storage.getProjectDivePlan(req.params.id as string);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
    
    const creator = await storage.getUser(plan.createdBy);
    const preparedBy = creator?.fullName || creator?.username || "Unknown";
    
    const workSelections = await storage.getProjectWorkSelections(plan.projectId);
    const projectContacts = await storage.getProjectContacts(plan.projectId);
    
    const companies = await storage.getAllCompanies();
    const companyContactDefaults = companies.length > 0 
      ? await storage.getCompanyContactsDefaults(companies[0].companyId)
      : [];
    
    const dbData = {
      workSelections: workSelections.map(w => ({ category: w.category, label: w.label })),
      projectContacts: projectContacts.map(c => ({ 
        roleName: c.roleName, 
        contactName: c.contactName, 
        contactPhone: c.contactPhone 
      })),
      companyContactDefaults: companyContactDefaults.map(c => ({
        roleName: c.roleName,
        defaultName: c.defaultName,
        defaultPhone: c.defaultPhone,
      })),
    };
    
    const buffer = await generateDD5DivePlanDocx(
      plan.planData as any,
      preparedBy,
      dbData
    );
    
    const fileName = `DD5_DivePlan_Rev${plan.revision}.docx`;
    
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIRECTORY FACILITIES
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/directory-facilities", requireAuth, async (req: Request, res: Response) => {
    const facilities = await storage.getAllDirectoryFacilities();
    res.json(facilities);
  });

  app.post("/api/directory-facilities", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    
    const facility = await storage.createDirectoryFacility({
      ...req.body,
      verifiedBy: user.id,
      lastVerifiedAt: new Date(),
    });
    
    res.status(201).json(facility);
  });

  app.patch("/api/directory-facilities/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    
    const updated = await storage.updateDirectoryFacility(req.params.id, {
      ...req.body,
      verifiedBy: user.id,
      lastVerifiedAt: new Date(),
    });
    
    if (!updated) return res.status(404).json({ message: "Facility not found" });
    res.json(updated);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PROJECT DIRECTORY
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/directory", requireAuth, async (req: Request, res: Response) => {
    const directory = await storage.getProjectDirectory(req.params.projectId);
    res.json(directory || { status: "NEEDS_VERIFICATION" });
  });

  app.post("/api/projects/:projectId/directory/verify", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    
    let directory = await storage.getProjectDirectory(req.params.projectId);
    
    if (directory) {
      directory = await storage.updateProjectDirectory(directory.id, {
        ...req.body,
        status: "VERIFIED",
        verifiedBy: user.id,
        verifiedAt: new Date(),
      });
    } else {
      directory = await storage.createProjectDirectory({
        projectId: req.params.projectId,
        ...req.body,
        status: "VERIFIED",
        verifiedBy: user.id,
        verifiedAt: new Date(),
      });
    }
    
    res.json(directory);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LIBRARY DOCUMENTS
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/library", requireAuth, async (req: Request, res: Response) => {
    // Get global documents (no project ID)
    const globalDocs = await storage.getLibraryDocuments();
    res.json(globalDocs);
  });

  app.get("/api/projects/:projectId/library", requireAuth, async (req: Request, res: Response) => {
    const projectDocs = await storage.getLibraryDocuments(req.params.projectId);
    const globalDocs = await storage.getLibraryDocuments();
    res.json([...globalDocs, ...projectDocs]);
  });

  app.post("/api/library", requireRole("GOD"), async (req: Request, res: Response) => {
    const user = getUser(req);
    
    const doc = await storage.createLibraryDocument({
      ...req.body,
      uploadedBy: user.id,
    });
    
    res.status(201).json(doc);
  });

  // Library Exports (generated shift documents)
  app.get("/api/projects/:projectId/library-exports", requireAuth, async (req: Request, res: Response) => {
    const exports = await storage.getLibraryExports(req.params.projectId);
    res.json(exports);
  });

  app.get("/api/days/:dayId/library-exports", requireAuth, async (req: Request, res: Response) => {
    const exports = await storage.getLibraryExportsByDay(req.params.dayId);
    res.json(exports);
  });

  app.get("/api/library-exports/:id/download", requireAuth, async (req: Request, res: Response) => {
    const exportDoc = await storage.getLibraryExport(req.params.id);
    if (!exportDoc) return res.status(404).json({ message: "Export not found" });

    const buffer = Buffer.from(exportDoc.fileData, "base64");
    const mimeType = exportDoc.fileType === "docx" 
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${exportDoc.fileName}"`);
    res.send(buffer);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADMIN - Users
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    // For now, return users from projects the admin has access to
    // In a full implementation, you'd have a proper users table query
    res.json([]);
  });

  app.get("/api/projects/:projectId/members", requireAuth, async (req: Request, res: Response) => {
    const members = await storage.getProjectMembers(req.params.projectId);
    
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

  app.post("/api/projects/:projectId/members", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const member = await storage.addProjectMember({
        projectId: req.params.projectId,
        userId: req.body.userId,
        role: req.body.role,
      });
      res.status(201).json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to add member" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADMIN: USER MANAGEMENT
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/users", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const users = await storage.listUsers();
      const sanitized = users.map(({ password, ...rest }) => rest);
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ message: "Failed to list users" });
    }
  });

  app.post("/api/users", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = registerSchema.parse(req.body);

      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username: data.username,
        password: hashPassword(data.password),
        role: data.role,
        fullName: data.fullName || null,
        initials: data.initials || null,
        email: data.email || null,
      });

      const { password, ...sanitized } = user;
      res.status(201).json(sanitized);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const updates = { ...req.body };
      if (updates.password) {
        updates.password = hashPassword(updates.password);
      }

      const user = await storage.updateUser(req.params.id, updates);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { password, ...sanitized } = user;
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/projects/:projectId/members/:userId", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const removed = await storage.removeProjectMember(req.params.projectId, req.params.userId);
      if (!removed) return res.status(404).json({ message: "Member not found" });
      res.json({ message: "Member removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  return httpServer;
}
