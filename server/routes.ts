import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import express from "express";
import { storage } from "./storage";
import { passport, hashPassword, requireAuth, requireRole, canWriteLogEvents, isGod, isAdminOrHigher } from "./auth";
import { requireProjectAccess, requireDayAccess } from "./authz";
import { classifyEvent, extractData, parseEventTime, generateRiskId, getMasterLogSection, renderInternalCanvasLine, detectDirectiveTag, hasRiskKeywords, isStopWork, detectHazards } from "./extraction";
import { processStructuredLog } from "./logging";
import { generateAIRenders, type SOPContext } from "./ai-drafting";
import { generateShiftExport, snapshotExportData, generateShiftExportFromSnapshot } from "./document-export";
import { speechToTextStream, ensureCompatibleFormat } from "./replit_integrations/audio/client";
import type { User, UserRole, DayStatus } from "@shared/schema";
import { lookupDiveTable } from "@shared/navy-dive-tables";
import { z } from "zod";
import { generateCorrelationId, emitAuditEvent, sanitizeForAudit, diffFields, type AuditContext } from "./audit";
import type { AuditAction } from "@shared/schema";
import { isEnabled, setFlag, resetFlags, getFlagStatus } from "./feature-flags";
import { pool, db } from "./storage";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { authLimiter } from "./rate-limit";

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      auditCtx?: AuditContext;
      idempotencyKey?: string;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Type Helpers
// ────────────────────────────────────────────────────────────────────────────

async function getNextRiskId(_projectId: string, date: string): Promise<string> {
  const dateStr = date.replace(/-/g, '');
  const prefix = `RISK-${dateStr}-`;
  const result = await db.select({ riskId: schema.riskItems.riskId })
    .from(schema.riskItems)
    .where(sql`${schema.riskItems.riskId} LIKE ${prefix + '%'}`);
  let maxSeq = 0;
  for (const r of result) {
    const seqStr = r.riskId.slice(prefix.length);
    const seq = parseInt(seqStr, 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return generateRiskId(date, maxSeq + 1);
}

function isUniqueConstraintError(err: any): boolean {
  const msg = String(err?.message || err?.detail || '');
  return msg.includes('unique') || msg.includes('duplicate key') || msg.includes('23505');
}

async function createRiskWithRetry(riskData: any, projectId: string, date: string, maxRetries = 5, auditCtx?: AuditContext): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const riskId = await getNextRiskId(projectId, date);
    try {
      const risk = await storage.createRiskItem({ ...riskData, riskId });
      if (auditCtx) {
        emitAuditEvent(auditCtx, "risk.create", {
          targetId: risk.id, targetType: "risk_item",
          after: { id: risk.id, riskId: risk.riskId, category: risk.category, source: risk.source, description: risk.description },
        });
      }
      return risk;
    } catch (err: any) {
      if (!isUniqueConstraintError(err) || attempt === maxRetries - 1) throw err;
      console.warn(`Risk ID collision on ${riskId}, retrying (attempt ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}

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

// MED-01 FIX: Removed role field from public registration schema.
// Public registration always creates DIVER accounts. Elevated roles
// can only be assigned by admins via the admin user creation endpoint.
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

// More lenient schema for admin-created users
const adminCreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(1),
  role: z.enum(["GOD", "ADMIN", "SUPERVISOR", "DIVER"]),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

const logEventSchema = z.object({
  rawText: z.string().min(1),
  dayId: z.string(),
  projectId: z.string().optional(), // Can be derived from dayId
  station: z.string().optional(),
  eventTimeOverride: z.string().optional(),
  clientTimezone: z.string().optional(),
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

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const cid = (req.headers["x-correlation-id"] as string) || generateCorrelationId();
    req.correlationId = cid;
    req.idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;
    const user = req.user as User | undefined;
    req.auditCtx = {
      correlationId: cid,
      userId: user?.id,
      userRole: user?.role as UserRole | undefined,
      ipAddress: req.ip || req.socket.remoteAddress,
    };
    next();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AUTH ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const data = registerSchema.parse(req.body);
      // MED-01: Role is always DIVER for public registration (role field removed from schema)

      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username: data.username,
        password: hashPassword(data.password),
        role: "DIVER",
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

  app.post("/api/auth/login", authLimiter, passport.authenticate("local"), (req: Request, res: Response) => {
    const user = getUser(req);
    // Explicit session save to ensure cookie is set reliably
    req.session.save((err) => {
      if (err) {
        console.error("[auth] Session save error:", err);
        return res.status(500).json({ message: "Session save failed" });
      }
      res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName, mustChangePassword: user.mustChangePassword });
    });
  });

  // CRIT-06 FIX: Explicit handler for the commonly-guessed /api/login path.
  // Returns a helpful error pointing callers to the correct endpoint.
  app.post("/api/login", (_req: Request, res: Response) => {
    res.status(404).json({
      message: "This endpoint does not exist. Use POST /api/auth/login instead.",
      correctEndpoint: "/api/auth/login",
    });
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
      mustChangePassword: user.mustChangePassword,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SETUP (First-time system initialization)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/setup/status", async (_req: Request, res: Response) => {
    try {
      const result = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
      const userCount = Number(result[0]?.count ?? 0);
      res.json({ initialized: userCount > 0, userCount });
    } catch (error) {
      res.status(500).json({ message: "Failed to check setup status" });
    }
  });

  const setupSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().min(1, "Full name is required"),
    initials: z.string().min(1, "Initials are required").max(4),
    email: z.string().email("Valid email required"),
  });

  app.post("/api/setup/init", async (req: Request, res: Response) => {
    try {
      const result = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
      const userCount = Number(result[0]?.count ?? 0);
      if (userCount > 0) {
        return res.status(403).json({ message: "System already initialized. Contact your administrator." });
      }

      const data = setupSchema.parse(req.body);
      const admin = await storage.createUser({
        username: data.username,
        password: hashPassword(data.password),
        role: "GOD",
        fullName: data.fullName,
        initials: data.initials.toUpperCase(),
        email: data.email,
      });

      req.login(admin, (err) => {
        if (err) return res.status(500).json({ message: "Account created but login failed" });
        res.status(201).json({
          message: "System initialized successfully",
          user: { id: admin.id, username: admin.username, role: admin.role, fullName: admin.fullName },
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Setup init error:", error);
      res.status(500).json({ message: "Setup failed" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SEED (Development/Testing Only — blocked in production)
  // ──────────────────────────────────────────────────────────────────────────

  app.post("/api/seed", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Seed endpoint is disabled in production" });
    }
    try {
      let god = await storage.getUserByUsername("spittman@precisionsubsea.com");
      if (!god) {
        god = await storage.getUserByUsername("god");
      }
      if (!god) {
        god = await storage.createUser({
          username: "spittman@precisionsubsea.com",
          password: hashPassword("Whisky9954!"),
          role: "GOD",
          fullName: "S. Pittman",
          initials: "SP",
          email: "spittman@precisionsubsea.com",
        });
      }

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
      let projectId = (req.query.projectId as string) || prefs?.activeProjectId;
      
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

  app.get("/api/dashboard/recent-logs", requireAuth, async (req: Request, res: Response) => {
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

  app.get("/api/dashboard/live-board", requireAuth, async (req: Request, res: Response) => {
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
      });
    } catch (error: any) {
      console.error("Live board error:", error);
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
        // HIGH-01 FIX: Fall back to the user's active project location when no params passed
        try {
          const user = getUser(req);
          const prefs = await storage.getUserPreferences(user.id);
          if (prefs?.activeProjectId) {
            const project = await storage.getProject(prefs.activeProjectId);
            if (project?.jobsiteLat && project?.jobsiteLng) {
              queryParams += `&lat=${project.jobsiteLat}&lon=${project.jobsiteLng}`;
            } else if (project?.jobsiteName) {
              queryParams += `&q=${encodeURIComponent(project.jobsiteName)}`;
            } else {
              return res.status(400).json({ message: "Location or coordinates required. Active project has no location set." });
            }
          } else {
            return res.status(400).json({ message: "Location or coordinates required. No active project selected." });
          }
        } catch {
          return res.status(400).json({ message: "Location or coordinates required" });
        }
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
      const { name, clientName, jobsiteName, jobsiteAddress, jobsiteLat, jobsiteLng, timezone } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Project name is required" });
      }
      const project = await storage.createProject({
        name: name.trim(),
        clientName: clientName || null,
        jobsiteName: jobsiteName || null,
        jobsiteAddress: jobsiteAddress || null,
        jobsiteLat: jobsiteLat || null,
        jobsiteLng: jobsiteLng || null,
        timezone: timezone || "America/New_York",
      });
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

  // Set active project for user
  app.post("/api/projects/:id/activate", requireAuth, async (req: Request, res: Response) => {
    const user = getUser(req);
    await storage.setActiveProject(user.id, req.params.id);
    res.json({ message: "Active project set" });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DAYS
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/days", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      // HIGH-08 FIX: Validate project exists before querying days
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Get ALL days/shifts for the project, ordered by most recent first
      const days = await storage.getDaysByProject(req.params.projectId);
      
      // If no days exist and user can write, create one for today
      if (days.length === 0) {
        const user = getUser(req);
        if (canWriteLogEvents(user.role)) {
          const today = getTodayDate();
          const day = await storage.createDay({
            projectId: req.params.projectId,
            date: today,
            shift: "1",
            status: "DRAFT",
            createdBy: user.id,
          });
          return res.json([day]);
        }
      }
      
      res.json(days);
    } catch (error: any) {
      console.error("Get days error:", error);
      res.status(500).json({ message: "Failed to fetch days" });
    }
  });

  app.get("/api/days/:id", requireAuth, async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    res.json(day);
  });

  app.post("/api/projects/:projectId/days", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const date = req.body.date || getTodayDate();

      // BUG-1 FIX: Prevent duplicate open shifts.
      // Only allow creating a new shift if ALL existing shifts for this date are CLOSED.
      const existingDays = await storage.getDaysByProject(req.params.projectId);
      const openShiftsForDate = existingDays.filter(
        (d) => d.date === date && (d.status === "DRAFT" || d.status === "ACTIVE")
      );
      if (openShiftsForDate.length > 0) {
        return res.status(409).json({
          message: `There is already an open shift for ${date}. Close all existing shifts before creating a new one.`,
          existingShiftId: openShiftsForDate[0].id,
        });
      }

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
    } catch (error: any) {
      console.error("Create day error:", error);
      res.status(500).json({ message: error?.message || "Failed to create new day" });
    }
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

  app.patch("/api/days/:id/breathing-gas", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });

    if (day.status === "CLOSED") {
      const user = getUser(req);
      if (!isGod(user.role)) {
        return res.status(403).json({ message: "Day is closed. Only GOD can edit." });
      }
    }

    const { breathingGas, fo2Percent } = req.body;
    const updated = await storage.updateDay(req.params.id, {
      defaultBreathingGas: breathingGas || null,
      defaultFo2Percent: fo2Percent != null ? fo2Percent : null,
    } as any);

    const dives = await storage.getDivesByDay(req.params.id);
    const propagated: string[] = [];
    for (const dive of dives) {
      if (!dive.breathingGasOverride) {
        await storage.updateDive(dive.id, {
          breathingGas: breathingGas || null,
          fo2Percent: fo2Percent != null ? fo2Percent : null,
        });
        propagated.push(dive.id);
      }
    }

    res.json({ day: updated, propagatedTo: propagated.length });
  });

  app.get("/api/days/:id/compliance", requireAuth, async (req: Request, res: Response) => {
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    
    const dives = await storage.getDivesByDay(req.params.id);
    const events = await storage.getLogEventsByDay(req.params.id);
    
    const gaps: Array<{ scope: string; field: string; message: string }> = [];
    
    if (!day.defaultBreathingGas) {
      gaps.push({ scope: "day", field: "breathingGas", message: "Shift breathing gas not set" });
    }
    
    const hasStopWork = events.some(e => {
      const ej = e.extractedJson as any;
      return ej?.stopWork === true;
    });
    
    for (const dive of dives) {
      const label = `Dive #${dive.diveNumber} (${dive.diverDisplayName || "Unknown"})`;
      if (!dive.diverDisplayName || dive.diverDisplayName.length <= 2) {
        gaps.push({ scope: label, field: "diverDisplayName", message: "Diver name not identified" });
      }
      if (!dive.maxDepthFsw) {
        gaps.push({ scope: label, field: "maxDepthFsw", message: "Max depth not recorded" });
      }
      if (!dive.breathingGas) {
        gaps.push({ scope: label, field: "breathingGas", message: "Breathing gas not set" });
      }
      if (dive.breathingGas === "Nitrox" && !dive.fo2Percent) {
        gaps.push({ scope: label, field: "fo2Percent", message: "FO₂% not set for Nitrox" });
      }
      if (!dive.lsTime) {
        gaps.push({ scope: label, field: "lsTime", message: "Leave Surface time missing" });
      }
      if (!dive.rsTime) {
        gaps.push({ scope: label, field: "rsTime", message: "Reached Surface time missing" });
      }
      if (!dive.tableUsed && dive.maxDepthFsw && dive.lsTime) {
        gaps.push({ scope: label, field: "tableUsed", message: "Dive table not computed" });
      }
    }
    
    const closeoutData = (day as any).closeoutData || {};
    if (!closeoutData.scopeStatus) {
      gaps.push({ scope: "closeout", field: "scopeStatus", message: "Scope status not set" });
    }
    if (!closeoutData.documentationStatus) {
      gaps.push({ scope: "closeout", field: "documentationStatus", message: "Documentation status not set" });
    }
    
    res.json({
      status: gaps.length === 0 ? "PASS" : "NEEDS_INFO",
      gapCount: gaps.length,
      diveCount: dives.length,
      hasStopWork,
      gaps,
    });
  });

  async function evaluateComplianceGaps(dayId: string): Promise<string[]> {
    const day = await storage.getDay(dayId);
    if (!day) return ["Day not found"];
    const dives = await storage.getDivesByDay(dayId);
    const gaps: string[] = [];
    
    if (!day.defaultBreathingGas) {
      gaps.push("Shift breathing gas not set");
    }
    
    for (const dive of dives) {
      const label = `Dive #${dive.diveNumber} (${dive.diverDisplayName || "Unknown"})`;
      if (!dive.diverDisplayName || dive.diverDisplayName.length <= 2) gaps.push(`${label}: Diver name not identified`);
      if (!dive.maxDepthFsw) gaps.push(`${label}: Max depth not recorded`);
      if (!dive.breathingGas) gaps.push(`${label}: Breathing gas not set`);
      if (dive.breathingGas === "Nitrox" && !dive.fo2Percent) gaps.push(`${label}: FO₂% not set for Nitrox`);
      if (!dive.lsTime) gaps.push(`${label}: Leave Surface time missing`);
      if (!dive.rsTime) gaps.push(`${label}: Reached Surface time missing`);
      if (!dive.tableUsed && dive.maxDepthFsw && dive.lsTime) gaps.push(`${label}: Dive table not computed`);
    }
    
    const closeoutData = (day as any).closeoutData || {};
    if (!closeoutData.scopeStatus) gaps.push("Closeout: Scope status not set");
    if (!closeoutData.documentationStatus) gaps.push("Closeout: Documentation status not set");
    
    return gaps;
  }

  app.post("/api/days/:id/close", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    if (!isEnabled("closeDay")) {
      return res.status(503).json({ message: "Close Day is currently disabled by operations team", code: "FEATURE_DISABLED" });
    }

    const user = getUser(req);
    const closeoutData = req.body?.closeoutData || undefined;
    const forceClose = req.body?.forceClose === true;
    
    if (!forceClose) {
      const gaps = await evaluateComplianceGaps(req.params.id);
      if (gaps.length > 0) {
        return res.status(422).json({ 
          message: "Compliance gaps detected — review before closing",
          gaps,
          canForceClose: isGod(user.role) || user.role === "ADMIN",
        });
      }
    }
    
    const beforeDay = await storage.getDay(req.params.id);
    const day = await storage.closeDay(req.params.id, user.id, closeoutData);
    if (!day) return res.status(404).json({ message: "Day not found" });

    const ctx: AuditContext = { ...req.auditCtx!, projectId: day.projectId, dayId: day.id };
    emitAuditEvent(ctx, forceClose ? "day.close_override" : "day.close", {
      targetId: day.id, targetType: "day",
      before: { status: beforeDay?.status }, after: { status: "CLOSED", closedBy: user.id },
      metadata: forceClose ? { forceClose: true } : undefined,
    });
    res.json(day);
  });

  app.post("/api/days/:id/close-and-export", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    if (!isEnabled("closeDay")) {
      return res.status(503).json({ message: "Close Day is currently disabled by operations team", code: "FEATURE_DISABLED" });
    }
    if (!isEnabled("exportGeneration")) {
      return res.status(503).json({ message: "Export generation is currently disabled by operations team", code: "FEATURE_DISABLED" });
    }

    const user = getUser(req);
    const dayId = req.params.id;
    const closeoutData = req.body?.closeoutData || undefined;
    const beforeDay = await storage.getDay(dayId);

    if (!beforeDay) {
      return res.status(404).json({ message: "Day not found" });
    }
    if (beforeDay.status === "CLOSED") {
      return res.status(200).json({ day: beforeDay, exportedFiles: [], alreadyClosed: true });
    }

    try {
      const snapshot = await snapshotExportData(dayId);
      const exportResult = await generateShiftExportFromSnapshot(snapshot);

      const result = await storage.closeDayAndExport(
        dayId,
        user.id,
        closeoutData,
        exportResult.files
      );

      const ctx: AuditContext = { ...req.auditCtx!, projectId: result.day.projectId, dayId: result.day.id };
      emitAuditEvent(ctx, "day.close", {
        targetId: result.day.id, targetType: "day",
        before: { status: beforeDay?.status }, after: { status: "CLOSED", closedBy: user.id },
        metadata: { withExport: true, fileCount: result.exportedFiles.length, transactional: true },
      });

      res.json(result);
    } catch (error: any) {
      if (error?.message === "DAY_NOT_FOUND" || error?.message === "Day not found") {
        return res.status(404).json({ message: "Day not found" });
      }
      if (error?.message === "Project not found") {
        return res.status(404).json({ message: "Project not found" });
      }
      if (error?.message === "DAY_ALREADY_CLOSED") {
        const existing = await storage.getDay(dayId);
        return res.status(200).json({ day: existing, exportedFiles: [], alreadyClosed: true });
      }

      console.error("Close-and-export failed, transaction rolled back:", error);

      const ctx: AuditContext = { ...req.auditCtx!, dayId };
      emitAuditEvent(ctx, "day.close" as AuditAction, {
        targetId: dayId, targetType: "day",
        metadata: { error: "close_and_export_rolled_back", reason: String(error) },
      });

      const currentDay = await storage.getDay(dayId);
      res.status(500).json({ 
        message: "Close-and-export failed — day remains open (transaction rolled back)", 
        dayStatus: currentDay?.status || "unknown",
      });
    }
  });

  app.post("/api/days/:id/reopen", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
    const user = getUser(req);
    const day = await storage.getDay(req.params.id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    if (day.status !== "CLOSED") return res.status(400).json({ message: "Day is not closed" });
    
    const reopened = await storage.reopenDay(req.params.id);
    if (!reopened) return res.status(500).json({ message: "Failed to reopen day" });

    const ctx: AuditContext = { ...req.auditCtx!, projectId: reopened.projectId, dayId: reopened.id };
    emitAuditEvent(ctx, "day.reopen", {
      targetId: reopened.id, targetType: "day",
      before: { status: "CLOSED" }, after: { status: "ACTIVE" },
      metadata: { reopenedBy: user.id },
    });
    
    const project = await storage.getProject(reopened.projectId);
    const systemRawText = `Day reopened by ${user.fullName || user.username}`;
    const systemEvent = await storage.createLogEvent({
      dayId: reopened.id,
      projectId: reopened.projectId,
      authorId: user.id,
      rawText: systemRawText,
      category: "ops",
      captureTime: new Date(),
      eventTime: new Date(),
      extractedJson: {},
    });
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const masterLine = `At ${timeStr}, ${systemRawText}.`;
    await storage.createLogRender({
      logEventId: systemEvent.id,
      renderType: "master_log_line",
      renderText: masterLine,
      section: "ops",
      model: "system",
      promptVersion: "system",
      status: "ok",
    });
    await storage.createLogRender({
      logEventId: systemEvent.id,
      renderType: "internal_canvas_line",
      renderText: `**${timeStr} | SYSTEM:** ${systemRawText}`,
      section: "ops",
      model: "system",
      promptVersion: "system",
      status: "ok",
    });
    
    res.json(reopened);
    } catch (error: any) {
      console.error("Reopen day error:", error);
      res.status(500).json({ message: error?.message || "Failed to reopen day" });
    }
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
      
      // Get day for date context and derive projectId if not provided
      const day = await storage.getDay(data.dayId);
      if (!day) return res.status(404).json({ message: "Day not found" });
      const projectId = data.projectId || day.projectId;
      if (!projectId) return res.status(400).json({ message: "Could not determine projectId" });
      
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
        // Try to parse HHMM from raw text — supervisor's entered time is law
        const parsedTime = parseEventTime(data.rawText, day.date);
        if (parsedTime) {
          eventTime = parsedTime;
        } else if (data.clientTimezone) {
          // No time entered — use client's local clock time
          // We store times so getUTCHours() returns the operational clock time,
          // so construct a UTC Date whose H:M matches the user's local wall clock
          try {
            const formatter = new Intl.DateTimeFormat("en-US", {
              timeZone: data.clientTimezone,
              year: "numeric", month: "2-digit", day: "2-digit",
              hour: "2-digit", minute: "2-digit", second: "2-digit",
              hour12: false,
            });
            const parts = formatter.formatToParts(captureTime);
            const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0", 10);
            eventTime = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
          } catch {
            eventTime = captureTime;
          }
        } else {
          eventTime = captureTime;
        }
      }
      
      // Classify and extract
      const category = classifyEvent(data.rawText);
      const extracted = extractData(data.rawText);
      
      // Detect conflicting/reversed direction tags for directives (SOP Phase 1)
      const directiveTag = detectDirectiveTag(data.rawText, category);
      const stopWork = isStopWork(data.rawText);
      const hazards = detectHazards(data.rawText);
      const extractedWithTag: any = { ...extracted };
      if (directiveTag) extractedWithTag.directiveTag = directiveTag;
      if (stopWork) extractedWithTag.stopWork = true;
      if (hazards.length > 0) extractedWithTag.hazards = hazards;

      const ctx: AuditContext = { ...req.auditCtx!, projectId, dayId: data.dayId };

      // Atomic idempotency guard: reserve key first, then process
      if (req.idempotencyKey) {
        const existing = await storage.getIdempotencyResult(req.idempotencyKey);
        if (existing) {
          return res.status(existing.responseStatus).json(existing.responseBody);
        }
        const reserved = await storage.reserveIdempotencyKey(req.idempotencyKey, "POST /api/log-events");
        if (!reserved) {
          return res.status(409).json({ message: "Request is being processed", code: "IDEMPOTENCY_IN_PROGRESS" });
        }
      }

      // Create the log event IMMEDIATELY (event sourcing)
      const logEvent = await storage.createLogEvent({
        dayId: data.dayId,
        projectId,
        authorId: user.id,
        station: data.station || null,
        captureTime,
        eventTime,
        rawText: data.rawText,
        category,
        extractedJson: extractedWithTag,
      });

      emitAuditEvent(ctx, "log_event.create", {
        targetId: logEvent.id, targetType: "log_event",
        after: { id: logEvent.id, rawText: data.rawText, category, eventTime },
      });
      
      // Activate day if it was draft
      if (day.status === "DRAFT") {
        await storage.updateDay(day.id, { status: "ACTIVE" });
        emitAuditEvent(ctx, "day.activate", {
          targetId: day.id, targetType: "day",
          before: { status: "DRAFT" }, after: { status: "ACTIVE" },
        });
      }
      
      // Load active SOPs for this project
      const activeSops = await storage.getProjectSops(projectId);
      const sopTexts = activeSops.filter(s => s.isActive).map(s => `### ${s.title}\n${s.content}`);
      
      // Process structured log asynchronously (normalize, classify, validate)
      processStructuredLog(data.rawText, { sops: sopTexts })
        .then(async (result) => {
          // Only store structured payload if validation passed
          if (result.validationPassed) {
            await storage.updateLogEvent(logEvent.id, {
              structuredPayload: result.payload as any,
              validationPassed: true,
            });
            
            // Create risk items only from validated payload
            if (result.payload.risks && result.payload.risks.length > 0) {
              const existingRisks = await storage.getRiskItemsByProject(projectId);
              const dateStr = day.date.replace(/-/g, '');
              const riskPrefix = `RISK-${dateStr}-`;
              const maxRiskNum = existingRisks
                .map(r => r.riskId)
                .filter(id => id.startsWith("RISK-"))
                .map(id => {
                  const parts = id.split('-');
                  return Number(parts[parts.length - 1]);
                })
                .filter(n => Number.isFinite(n))
                .reduce((a, b) => Math.max(a, b), 0);

              for (let i = 0; i < result.payload.risks.length; i++) {
                const risk = result.payload.risks[i];
                const riskId = `${riskPrefix}${String(maxRiskNum + i + 1).padStart(3, "0")}`;
                const isDirective = (risk as any).trigger?.toLowerCase().includes("client") ||
                  (risk as any).trigger?.toLowerCase().includes("directive");
                await storage.createRiskItem({
                  dayId: day.id,
                  projectId: projectId,
                  riskId,
                  triggerEventId: logEvent.id,
                  description: `${(risk as any).trigger || risk.description}. Impact: ${(risk as any).impact || ""}`.trim(),
                  category: "operational",
                  source: isDirective ? "client_directive" : "field_observation",
                  affectedTask: (risk as any).affected_task || null,
                  initialRiskLevel: (risk as any).risk_level || "med",
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
      // Load active SOPs for the project to include in AI prompts
      storage.getActiveProjectSops(projectId).then(sops => {
        const sopCtx: SOPContext[] = sops.map(s => ({ title: s.title, content: s.content }));
        return generateAIRenders(data.rawText, eventTime, category, sopCtx);
      })
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
      
      // If safety incident, create a risk item with retry for concurrent collisions
      if (category === "safety") {
        try {
          await createRiskWithRetry({
            dayId: day.id,
            projectId: projectId,
            triggerEventId: logEvent.id,
            category: "safety",
            description: data.rawText,
            status: "open",
          }, projectId, day.date, 3, ctx);
        } catch (e: any) {
          console.error("Failed to create safety risk after retries:", e);
        }
      }
      
      // Client directives also create a risk item with retry
      if (category === "directive") {
        try {
          await createRiskWithRetry({
            dayId: day.id,
            projectId: projectId,
            triggerEventId: logEvent.id,
            category: "operational",
            source: "client_directive",
            description: data.rawText,
            status: "open",
          }, projectId, day.date, 3, ctx);
        } catch (e: any) {
          console.error("Failed to create directive risk after retries:", e);
        }
      }
      
      // Stop-work events always create a safety risk item
      if (stopWork && category !== "safety") {
        try {
          await createRiskWithRetry({
            dayId: day.id,
            projectId: projectId,
            triggerEventId: logEvent.id,
            category: "safety",
            source: "supervisor_entry",
            description: `STOP WORK: ${data.rawText}`,
            status: "open",
          }, projectId, day.date, 3, ctx);
        } catch (e: any) {
          console.error("Failed to create stop-work risk after retries:", e);
        }
        
        // Auto-set RS time for all active dives (dives with LS but no RS) on this station
        const allDives = await storage.getDivesByDay(day.id);
        const activeDives = allDives.filter(d => 
          d.lsTime && !d.rsTime && 
          (!data.station || !d.station || d.station === data.station)
        );
        for (const activeDive of activeDives) {
          await storage.updateDiveTimes(activeDive.id, 'rsTime', eventTime);
        }
      }
      
      // If text contains risk keywords (and wasn't already captured as safety/directive/stop-work), create risk item
      if (category !== "safety" && category !== "directive" && !stopWork && hasRiskKeywords(data.rawText)) {
        try {
          await createRiskWithRetry({
            dayId: day.id,
            projectId: projectId,
            triggerEventId: logEvent.id,
            category: "operational",
            source: "supervisor_entry",
            description: data.rawText,
            status: "open",
          }, projectId, day.date, 3, ctx);
        } catch (e: any) {
          console.error("Failed to create keyword risk after retries:", e);
        }
      }
      
      // Auto-compute dive table when sufficient data is available
      async function autoComputeDiveTable(diveId: string) {
        try {
          const d = await storage.getDive(diveId);
          if (!d || !d.maxDepthFsw || !d.lsTime) return;
          // Default to Air if no breathing gas set
          const breathingGas = d.breathingGas || "Air";
          
          let bottomTimeMinutes: number | null = null;
          if (d.lbTime) {
            const ls = new Date(d.lsTime).getTime();
            const lb = new Date(d.lbTime).getTime();
            let diff = lb - ls;
            if (diff < 0) diff += 24 * 60 * 60 * 1000;
            bottomTimeMinutes = Math.ceil(diff / 60000);
          } else if (d.rsTime) {
            const ls = new Date(d.lsTime).getTime();
            const rs = new Date(d.rsTime).getTime();
            let diff = rs - ls;
            if (diff < 0) diff += 24 * 60 * 60 * 1000;
            bottomTimeMinutes = Math.ceil(diff / 60000);
          }
          if (!bottomTimeMinutes || bottomTimeMinutes <= 0) return;
          
          const fo2 = d.fo2Percent ?? (breathingGas === "Air" ? 21 : null);
          const result = lookupDiveTable(d.maxDepthFsw, bottomTimeMinutes, breathingGas, fo2 ?? undefined);
          await storage.updateDive(diveId, {
            tableUsed: result.tableUsed,
            scheduleUsed: result.scheduleUsed,
            repetitiveGroup: result.repetitiveGroup,
            decompRequired: result.decompRequired === "YES" ? "Y" : "N",
            decompStops: result.decompStops?.length ? JSON.stringify(result.decompStops) : null,
            tableCitation: JSON.stringify(result.citation),
          });
        } catch (err) {
          console.error("Auto-compute table failed:", err);
        }
      }

      // If dive operation, create/update dive record for the diver synchronously
      if (extracted.diveOperation) {
        const diverIdentifiers = extracted.diverNames || extracted.diverInitials || [];
        const station = data.station || null;
        
        for (const identifier of diverIdentifiers) {
          const initials = identifier.length <= 3 ? identifier : undefined;
          let dive;
          
          if (initials) {
            const diver = await storage.getUserByInitials(initials, projectId);
            if (diver) {
              dive = await storage.getOrCreateDiveForDiver(day.id, projectId, diver.id, station || undefined);
              const bestName = diver.fullName || diver.username;
              if (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3) {
                await storage.updateDive(dive.id, { diverDisplayName: bestName });
              }
            } else {
              // Always use initials for dive lookup/creation to avoid duplicates
              dive = await storage.getOrCreateDiveByDisplayName(day.id, projectId, initials, station || undefined);
              // Then check roster and upgrade display name if known
              const rosterName = await storage.lookupDiverName(projectId, initials);
              if (rosterName && (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3)) {
                await storage.updateDive(dive.id, { diverDisplayName: rosterName });
              }
            }
          } else {
            const nameParts = identifier.split(/[.\s]/);
            const firstInitial = nameParts[0]?.charAt(0)?.toUpperCase() || "";
            const lastName = nameParts[nameParts.length - 1] || "";
            const searchInitials = `${firstInitial}${lastName.charAt(0).toUpperCase()}`;
            
            const diver = await storage.getUserByInitials(searchInitials, projectId);
            if (diver) {
              dive = await storage.getOrCreateDiveForDiver(day.id, projectId, diver.id, station || undefined);
              const bestName = diver.fullName || identifier;
              if (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3 || dive.diverDisplayName.trim().toLowerCase() !== bestName.toLowerCase()) {
                await storage.updateDive(dive.id, { diverDisplayName: bestName });
              }
            } else {
              // Use initials for lookup to avoid duplicates between "B.Murphy" and "BM"
              dive = await storage.getOrCreateDiveByDisplayName(day.id, projectId, searchInitials, station || undefined);
              // Check roster for full name, otherwise use the entered name
              const rosterName = await storage.lookupDiverName(projectId, searchInitials);
              const bestName = rosterName || identifier;
              if (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3 || dive.diverDisplayName !== bestName) {
                await storage.updateDive(dive.id, { diverDisplayName: bestName });
              }
            }
          }
          
          if (dive) {
            const timeField = `${extracted.diveOperation}Time` as 'lsTime' | 'rbTime' | 'lbTime' | 'rsTime';
            await storage.updateDiveTimes(dive.id, timeField, eventTime, extracted.depthFsw);
            
            // Propagate station from log entry to dive if not set
            if (data.station && !dive.station) {
              await storage.updateDive(dive.id, { station: data.station });
            }
            
            // Set breathing gas from day defaults if not already set
            if (!dive.breathingGas && day.defaultBreathingGas) {
              const gasUpdates: any = { breathingGas: day.defaultBreathingGas };
              if (day.defaultBreathingGas === "Nitrox" && (day as any).defaultFo2Percent) {
                gasUpdates.fo2Percent = (day as any).defaultFo2Percent;
              }
              await storage.updateDive(dive.id, gasUpdates);
            }
            
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
            
            // Auto-compute dive table if we have sufficient data
            await autoComputeDiveTable(dive.id);
          }
        }
      }
      
      // Return immediately with the persisted event
      const responseBody = {
        ...logEvent,
        category,
        extracted,
        autosaved: true,
      };

      // Finalize idempotency result (key was already reserved atomically)
      if (req.idempotencyKey) {
        storage.finalizeIdempotencyKey(req.idempotencyKey, 201, responseBody).catch(() => {});
      }

      res.status(201).json(responseBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("LogEvent creation error:", error);
      res.status(500).json({ message: "Failed to create log event" });
    }
  });

  // Re-extract dives from existing log events for a day (admin only)
  app.post("/api/days/:dayId/re-extract-dives", requireRole("ADMIN", "GOD"), requireDayAccess(), async (req: Request, res: Response) => {
    try {
      const dayId = req.params.dayId;
      const day = await storage.getDay(dayId);
      if (!day) return res.status(404).json({ message: "Day not found" });

      const events = await storage.getLogEventsByDay(dayId);
      const diveEvents = events.filter(e => e.category === "dive_op");
      let created = 0;
      let updated = 0;

      for (const event of diveEvents) {
        const extracted = extractData(event.rawText);
        if (!extracted.diveOperation) continue;

        const diverIdentifiers = extracted.diverNames || extracted.diverInitials || [];
        const station = event.station || null;

        for (const identifier of diverIdentifiers) {
          const isInit = identifier.length <= 3;
          let dive;

          if (isInit) {
            const diver = await storage.getUserByInitials(identifier, day.projectId);
            if (diver) {
              dive = await storage.getOrCreateDiveForDiver(dayId, day.projectId, diver.id, station || undefined);
              const bestName = diver.fullName || diver.username;
              if (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3) {
                await storage.updateDive(dive.id, { diverDisplayName: bestName });
              }
            } else {
              // Always use initials for lookup to avoid duplicates
              dive = await storage.getOrCreateDiveByDisplayName(dayId, day.projectId, identifier, station || undefined);
              // Then upgrade display name from roster if known
              const rosterName = await storage.lookupDiverName(day.projectId, identifier);
              if (rosterName && (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3)) {
                await storage.updateDive(dive.id, { diverDisplayName: rosterName });
              }
            }
          } else {
            const nameParts = identifier.split(/[.\s]/);
            const firstInitial = nameParts[0]?.charAt(0)?.toUpperCase() || "";
            const lastName = nameParts[nameParts.length - 1] || "";
            const searchInitials = `${firstInitial}${lastName.charAt(0).toUpperCase()}`;

            const diver = await storage.getUserByInitials(searchInitials, day.projectId);
            if (diver) {
              dive = await storage.getOrCreateDiveForDiver(dayId, day.projectId, diver.id, station || undefined);
              const bestName = diver.fullName || identifier;
              if (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3 || dive.diverDisplayName.trim().toLowerCase() !== bestName.toLowerCase()) {
                await storage.updateDive(dive.id, { diverDisplayName: bestName });
              }
            } else {
              // Use initials for lookup to avoid duplicates between "B.Murphy" and "BM"
              dive = await storage.getOrCreateDiveByDisplayName(dayId, day.projectId, searchInitials, station || undefined);
              const rosterName = await storage.lookupDiverName(day.projectId, searchInitials);
              const bestName = rosterName || identifier;
              if (!dive.diverDisplayName || dive.diverDisplayName.trim().length <= 3 || dive.diverDisplayName !== bestName) {
                await storage.updateDive(dive.id, { diverDisplayName: bestName });
              }
            }
          }

          if (dive) {
            const eventTime = event.eventTime || event.captureTime;
            const timeField = `${extracted.diveOperation}Time` as 'lsTime' | 'rbTime' | 'lbTime' | 'rsTime';
            await storage.updateDiveTimes(dive.id, timeField, eventTime, extracted.depthFsw);
            
            if (station && !dive.station) {
              await storage.updateDive(dive.id, { station });
            }
            if (!dive.breathingGas && day.defaultBreathingGas) {
              const gasUpd: any = { breathingGas: day.defaultBreathingGas };
              if (day.defaultBreathingGas === "Nitrox" && (day as any).defaultFo2Percent) {
                gasUpd.fo2Percent = (day as any).defaultFo2Percent;
              }
              await storage.updateDive(dive.id, gasUpd);
            }

            const rawStripped = event.rawText.replace(/^\d{3,4}\s*/, '').trim();
            if (rawStripped) {
              const currentDive = await storage.getDive(dive.id);
              const existing = currentDive?.taskSummary;
              if (existing) {
                if (!existing.includes(rawStripped)) {
                  await storage.updateDive(dive.id, { taskSummary: `${existing} | ${rawStripped}` });
                }
              } else {
                await storage.updateDive(dive.id, { taskSummary: rawStripped });
              }
            }
            created++;
          }
        }
      }
      
      // Handle stop-work events: set RS for active dives
      const stopWorkEvents = events.filter(e => {
        const ej = e.extractedJson as any;
        return ej?.stopWork === true;
      });
      for (const swe of stopWorkEvents) {
        const allDives = await storage.getDivesByDay(dayId);
        const eventTime = swe.eventTime || swe.captureTime;
        const activeDives = allDives.filter(d => 
          d.lsTime && !d.rsTime && 
          (!swe.station || !d.station || d.station === swe.station)
        );
        for (const ad of activeDives) {
          await storage.updateDiveTimes(ad.id, 'rsTime', eventTime);
        }
      }
      
      // Auto-compute tables for all dives
      const allDivesForCompute = await storage.getDivesByDay(dayId);
      for (const d of allDivesForCompute) {
        if (d.maxDepthFsw && d.breathingGas && d.lsTime && !d.tableUsed) {
          let btMin: number | null = null;
          if (d.lbTime) {
            let diff = new Date(d.lbTime).getTime() - new Date(d.lsTime).getTime();
            if (diff < 0) diff += 24 * 60 * 60 * 1000;
            btMin = Math.ceil(diff / 60000);
          } else if (d.rsTime) {
            let diff = new Date(d.rsTime).getTime() - new Date(d.lsTime).getTime();
            if (diff < 0) diff += 24 * 60 * 60 * 1000;
            btMin = Math.ceil(diff / 60000);
          }
          if (btMin && btMin > 0) {
            try {
              const fo2 = d.fo2Percent ?? (d.breathingGas === "Air" ? 21 : null);
              const result = lookupDiveTable(d.maxDepthFsw, btMin, d.breathingGas, fo2 ?? undefined);
              await storage.updateDive(d.id, {
                tableUsed: result.tableUsed,
                scheduleUsed: result.scheduleUsed,
                repetitiveGroup: result.repetitiveGroup,
                decompRequired: result.decompRequired === "YES" ? "Y" : "N",
                decompStops: result.decompStops?.length ? JSON.stringify(result.decompStops) : null,
                tableCitation: JSON.stringify(result.citation),
              });
            } catch {}
          }
        }
      }

      const finalDives = await storage.getDivesByDay(dayId);
      res.json({ message: `Re-extracted ${created} dive operations, ${finalDives.length} total dives`, totalDives: finalDives.length });
    } catch (error) {
      console.error("Re-extraction error:", error);
      res.status(500).json({ message: "Re-extraction failed" });
    }
  });

  // Get all log events for a day (ordered by eventTime then captureTime)
  app.get("/api/days/:dayId/log-events", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
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
  app.patch("/api/log-events/:id/depth", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { depthFsw } = req.body;
      const depth = parseInt(depthFsw, 10);
      if (isNaN(depth) || depth <= 0) {
        return res.status(400).json({ message: "Valid depth (FSW) is required" });
      }

      const event = await storage.getLogEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Log event not found" });

      const extracted = (event.extractedJson || {}) as Record<string, any>;
      extracted.depthFsw = depth;

      const annotations = (event.aiAnnotations || []) as Array<{ type: string; message: string }>;
      const filteredAnnotations = annotations.filter(
        a => !a.message.includes("no depth (FSW) specified")
      );

      await storage.updateLogEvent(req.params.id, {
        extractedJson: extracted,
        aiAnnotations: filteredAnnotations,
      });

      const dives = await storage.getDivesByDay(event.dayId);
      const rawDiverName = extracted.diverName || extracted.diverInitials || "";
      const diverName = typeof rawDiverName === "string" ? rawDiverName : String(rawDiverName || "");
      if (diverName) {
        const matchedDive = dives.find(d =>
          d.diverDisplayName?.toLowerCase().includes(diverName.toLowerCase()) ||
          d.diverBadgeId?.toLowerCase() === diverName.toLowerCase()
        );
        if (matchedDive) {
          await storage.updateDive(matchedDive.id, { maxDepthFsw: depth });
        }
      }

      const updated = await storage.getLogEvent(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Depth update error:", error);
      res.status(500).json({ message: "Failed to update depth" });
    }
  });

  app.patch("/api/log-events/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { rawText, editReason, version: expectedVersion } = req.body;
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
      }, typeof expectedVersion === "number" ? expectedVersion : undefined);

      const ctx: AuditContext = { ...req.auditCtx!, projectId: event.projectId || undefined, dayId: event.dayId };
      emitAuditEvent(ctx, "log_event.update", {
        targetId: event.id, targetType: "log_event",
        before: { rawText: event.rawText },
        after: { rawText: rawText.trim() },
        metadata: { editReason: editReason || "Manual edit" },
      });

      res.json(updated);
    } catch (error: any) {
      if (error?.message?.startsWith("VERSION_CONFLICT")) {
        return res.status(409).json({ message: error.message, code: "VERSION_CONFLICT" });
      }
      console.error("LogEvent edit error:", error);
      res.status(500).json({ message: "Failed to update log event" });
    }
  });

  // Retry AI render
  app.post("/api/log-events/:id/retry-render", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    const event = await storage.getLogEvent(req.params.id);
    if (!event) return res.status(404).json({ message: "Log event not found" });
    
    try {
      const sops = event.projectId ? await storage.getActiveProjectSops(event.projectId) : [];
      const sopCtx: SOPContext[] = sops.map(s => ({ title: s.title, content: s.content }));
      const renders = await generateAIRenders(
        event.rawText,
        new Date(event.eventTime),
        event.category as any,
        sopCtx
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

  app.get("/api/days/:dayId/dives", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
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
        "qcDisposition", "verifier", "breathingGas", "fo2Percent", "eadFsw",
        "tableUsed", "scheduleUsed", "repetitiveGroup",
        "decompRequired", "decompMethod", "decompStops", "tableCitation",
        "postDiveStatus", "photoVideoRefs", "supervisorInitials", "notes",
        "lsTime", "rbTime", "lbTime", "rsTime",
      ];
      
      const timeFields = ["lsTime", "rbTime", "lbTime", "rsTime"];
      const numericFields = ["maxDepthFsw", "fo2Percent", "eadFsw"];

      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          let val = req.body[field];
          if (timeFields.includes(field)) {
            if (val === "" || val === null) {
              updates[field] = null;
            } else {
              const timeMatch = String(val).match(/^(\d{1,2}):?(\d{2})$/);
              if (timeMatch) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                const day = await storage.getDay(dive.dayId);
                const base = day?.date ? new Date(day.date + "T00:00:00Z") : new Date();
                base.setUTCHours(hours, minutes, 0, 0);
                updates[field] = base;
              } else {
                const parsed = new Date(val);
                if (!isNaN(parsed.getTime())) {
                  updates[field] = parsed;
                } else {
                  return res.status(400).json({ message: `Invalid time format for ${field}. Use HH:MM or HHMM.` });
                }
              }
            }
          } else if (numericFields.includes(field)) {
            if (val === "" || val === null) {
              updates[field] = null;
            } else {
              const num = Number(val);
              if (isNaN(num)) {
                return res.status(400).json({ message: `Invalid number for ${field}` });
              }
              updates[field] = num;
            }
          } else {
            updates[field] = val;
          }
        }
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const expectedVersion = typeof req.body.version === "number" ? req.body.version : undefined;
      const updated = await storage.updateDive(req.params.id, updates, expectedVersion);

      const ctx: AuditContext = { ...req.auditCtx!, dayId: dive.dayId };
      emitAuditEvent(ctx, "dive.update", {
        targetId: dive.id, targetType: "dive",
        before: sanitizeForAudit(dive),
        after: sanitizeForAudit(updated),
      });
      
      // If diver name was updated with a full name, save to roster and propagate
      if (updates.diverDisplayName && updates.diverDisplayName.length > 2) {
        const newName = updates.diverDisplayName as string;
        const initials = newName.split(/\s+/).map((w: string) => w[0]?.toUpperCase()).join("");
        
        if (initials.length >= 2) {
          // Save to project-level roster
          await storage.upsertDiverRoster(dive.projectId, initials, newName);
          
          // Propagate to other dives in the same day that have just initials
          const dayDives = await storage.getDivesByDay(dive.dayId);
          for (const otherDive of dayDives) {
            if (otherDive.id === dive.id) continue;
            const otherName = otherDive.diverDisplayName?.trim();
            if (otherName && otherName.toUpperCase() === initials) {
              await storage.updateDive(otherDive.id, { diverDisplayName: newName });
            }
          }
        }
      }
      
      // Bug #10: Recompute dive table when depth or time fields change
      const recomputeFields = ["maxDepthFsw", "lsTime", "rbTime", "lbTime", "rsTime", "breathingGas", "fo2Percent"];
      if (recomputeFields.some(f => updates[f] !== undefined)) {
        try {
          await autoComputeDiveTable(dive.id);
        } catch (e) {
          console.warn("Auto-compute dive table after edit failed:", e);
        }
      }
      
      // Re-fetch after potential table recomputation
      const finalDive = await storage.getDive(req.params.id);
      res.json(finalDive || updated);
    } catch (error: any) {
      if (error?.message?.startsWith("VERSION_CONFLICT")) {
        return res.status(409).json({ message: error.message, code: "VERSION_CONFLICT" });
      }
      console.error("Dive update error:", error);
      res.status(500).json({ message: "Failed to update dive" });
    }
  });

  // Compute dive table/schedule for a dive based on depth & bottom time
  app.post("/api/dives/:id/compute-table", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const dive = await storage.getDive(req.params.id);
      if (!dive) return res.status(404).json({ message: "Dive not found" });

      const depthFsw = req.body.maxDepthFsw ?? dive.maxDepthFsw;
      const breathingGas = req.body.breathingGas ?? dive.breathingGas ?? "Air";
      const fo2Percent = req.body.fo2Percent ?? dive.fo2Percent ?? (breathingGas === "Air" ? 21 : null);

      let bottomTimeMinutes: number | null = null;
      if (req.body.bottomTimeMinutes != null) {
        bottomTimeMinutes = Number(req.body.bottomTimeMinutes);
      } else if (dive.lsTime && dive.lbTime) {
        const ls = new Date(dive.lsTime).getTime();
        const lb = new Date(dive.lbTime).getTime();
        let diff = lb - ls;
        if (diff < 0) diff += 24 * 60 * 60 * 1000;
        bottomTimeMinutes = Math.ceil(diff / 60000);
      }

      if (depthFsw == null) {
        return res.status(400).json({ message: "Max depth (fsw) is required to compute the table" });
      }
      if (bottomTimeMinutes == null) {
        return res.status(400).json({ message: "Bottom time is required. Either provide bottomTimeMinutes or ensure LS and LB times are set." });
      }

      const result = lookupDiveTable(depthFsw, bottomTimeMinutes, breathingGas, fo2Percent ?? undefined);

      const updates: Record<string, any> = {
        breathingGas,
        fo2Percent: fo2Percent ?? null,
        tableUsed: result.tableUsed,
        scheduleUsed: result.scheduleUsed,
        repetitiveGroup: result.repetitiveGroup,
        decompRequired: result.decompRequired === "YES" ? "Y" : "N",
        decompStops: result.decompStops?.length ? JSON.stringify(result.decompStops) : null,
        tableCitation: JSON.stringify(result.citation),
      };

      const updated = await storage.updateDive(req.params.id, updates);
      res.json({ ...updated, _tableResult: result });
    } catch (error) {
      console.error("Compute table error:", error);
      res.status(500).json({ message: "Failed to compute dive table" });
    }
  });

  // Preview dive table lookup without saving (for real-time display)
  app.post("/api/dive-table-lookup", requireAuth, async (req: Request, res: Response) => {
    try {
      const { depthFsw, bottomTimeMinutes, breathingGas, fo2Percent } = req.body;
      if (depthFsw == null || bottomTimeMinutes == null) {
        return res.status(400).json({ message: "depthFsw and bottomTimeMinutes are required" });
      }
      const result = lookupDiveTable(depthFsw, bottomTimeMinutes, breathingGas || "Air", fo2Percent || undefined);
      res.json(result);
    } catch (error) {
      console.error("Dive table lookup error:", error);
      res.status(500).json({ message: "Failed to look up dive table" });
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
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL || undefined,
        });
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_completion_tokens: 200,
          messages: [
            {
              role: "system",
              content: `You summarize dive tasks for ADCI dive log forms. Create a concise "Task / Work Accomplished" summary from raw log entries for a single diver. Include specific tasks, equipment, and locations. Do NOT calculate dive times or decompression data. Keep it factual and brief (1-3 sentences).`
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

  app.get("/api/days/:dayId/risks", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
    const risks = await storage.getRiskItemsByDay(req.params.dayId);
    res.json(risks);
  });

  app.get("/api/projects/:projectId/risks", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
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

  app.post("/api/risks", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    if (!isEnabled("riskCreation")) {
      return res.status(503).json({ message: "Risk creation is currently disabled by operations team", code: "FEATURE_DISABLED" });
    }
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: "Not authenticated" });
      
      const { dayId, description, category, initialRiskLevel, affectedTask, owner } = req.body;
      if (!dayId || !description) {
        return res.status(400).json({ message: "dayId and description are required" });
      }
      
      const day = await storage.getDay(dayId);
      if (!day) return res.status(404).json({ message: "Day not found" });
      const projectId = req.body.projectId || day.projectId;
      if (!projectId) return res.status(400).json({ message: "Could not determine projectId" });
      
      const manualCtx: AuditContext = { ...req.auditCtx!, projectId, dayId };
      const risk = await createRiskWithRetry({
        dayId,
        projectId,
        triggerEventId: null,
        category: category || "operational",
        source: "manual",
        description,
        affectedTask: affectedTask || null,
        initialRiskLevel: initialRiskLevel || null,
        owner: owner || null,
        status: "open",
      }, projectId, day.date, 3, manualCtx);
      
      // Also create a log event to record the risk creation in the master log
      const captureTime = new Date();
      const clientTimezone = req.body.clientTimezone;
      let eventTime: Date;
      if (clientTimezone) {
        try {
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: clientTimezone,
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: false,
          });
          const parts = formatter.formatToParts(captureTime);
          const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0", 10);
          eventTime = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
        } catch {
          eventTime = captureTime;
        }
      } else {
        eventTime = captureTime;
      }
      
      const logRawText = `${risk.riskId} LOGGED: ${description}`;
      await storage.createLogEvent({
        dayId,
        projectId,
        authorId: user?.id,
        rawText: logRawText,
        category: "ops",
        eventTime,
        captureTime,
        station: null,
      });
      
      res.status(201).json(risk);
    } catch (error) {
      console.error("Failed to create risk:", error);
      res.status(500).json({ message: "Failed to create risk" });
    }
  });

  app.patch("/api/risks/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = riskUpdateSchema.parse(req.body);
      const expectedVersion = req.body.version as number | undefined;
      
      const risk = await storage.getRiskItem(req.params.id);
      if (!risk) return res.status(404).json({ message: "Risk not found" });
      
      const updated = await storage.updateRiskItem(req.params.id, data, expectedVersion);
      
      const ctx: AuditContext = { ...req.auditCtx!, projectId: risk.projectId, dayId: risk.dayId };
      emitAuditEvent(ctx, "risk.update", {
        targetId: risk.id, targetType: "risk_item",
        before: sanitizeForAudit(risk),
        after: sanitizeForAudit(updated),
        metadata: { editReason: data.editReason, diff: diffFields(sanitizeForAudit(risk), sanitizeForAudit(updated!)) },
      });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      if (error?.message?.startsWith("VERSION_CONFLICT")) {
        return res.status(409).json({ message: error.message, code: "VERSION_CONFLICT" });
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

  app.get("/api/days/:dayId/master-log", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
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
        const extracted = event.extractedJson as any;
        if (extracted?.directiveTag) {
          conflictEntries.push({ ...entry, directiveTag: extracted.directiveTag });
        }
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
    const totalDivers = totalDives === 0 ? 0 : (dives.length > 0 ? uniqueDivers.size : allDiverNames.size);

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

  app.get("/api/projects/:projectId/dive-plans", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    const plans = await storage.getDivePlansByProject(req.params.projectId);
    res.json(plans);
  });

  app.get("/api/dive-plans/:id", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Dive plan not found" });
    res.json(plan);
  });

  app.post("/api/projects/:projectId/dive-plans", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
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

  app.get("/api/days/:dayId/summary", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
    const summary = await storage.getDailySummary(req.params.dayId);
    if (!summary) return res.status(404).json({ message: "Daily summary not found" });
    res.json(summary);
  });

  app.post("/api/days/:dayId/summary", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireDayAccess(), async (req: Request, res: Response) => {
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

  app.get("/api/projects/:projectId/work-selections", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    const selections = await storage.getProjectWorkSelections(req.params.projectId as string);
    res.json(selections);
  });

  app.put("/api/projects/:projectId/work-selections", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
    const { workItemIds } = req.body;
    await storage.setProjectWorkSelections(req.params.projectId as string, workItemIds || []);
    const selections = await storage.getProjectWorkSelections(req.params.projectId as string);
    res.json(selections);
  });

  app.get("/api/projects/:projectId/contacts", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    const contacts = await storage.getProjectContacts(req.params.projectId as string);
    res.json(contacts);
  });

  app.put("/api/projects/:projectId/contacts/:roleId", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
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

  app.get("/api/projects/:projectId/project-dive-plans", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    const plans = await storage.getProjectDivePlansByProject(req.params.projectId);
    res.json(plans);
  });

  app.get("/api/projects/:projectId/project-dive-plans/active", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    const plan = await storage.getActiveProjectDivePlan(req.params.projectId);
    if (!plan) return res.status(404).json({ message: "No approved dive plan found" });
    res.json(plan);
  });

  app.get("/api/project-dive-plans/:id", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getProjectDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
    res.json(plan);
  });

  app.post("/api/projects/:projectId/project-dive-plans", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
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
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
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

IMPORTANT: Always respond in English only. Never translate to any other language.

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
        model: "gpt-4o",
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

  app.post("/api/dive-plan/chamber-search", requireRole("SUPERVISOR", "GOD", "ADMIN"), async (req: Request, res: Response) => {
    try {
      const { location, lat, lng } = req.body;
      
      const openai = new (await import("openai")).default({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });

      const locationDesc = location || (lat && lng ? `coordinates ${lat}, ${lng}` : "unknown location");

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a diving safety assistant. The user needs to find the closest recompression/hyperbaric chambers near a work location. Provide your best knowledge of known recompression chamber facilities near the specified location.

For each facility, provide:
- Name of the facility
- Address
- Phone number (if known)
- Estimated travel time from the work location
- Type (military, civilian hospital, private)

IMPORTANT: Include the standard emergency numbers:
- DAN Emergency Hotline: +1-919-684-9111
- NEDU: 850-230-3100

Format your response as a JSON array:
[{"name": "...", "address": "...", "phone": "...", "travelTime": "...", "type": "...", "notes": "..."}]

If you're not confident about specific facilities, say so in the notes field. Always recommend verifying chamber availability and operational status before starting dive operations.`
          },
          {
            role: "user",
            content: `Find the closest recompression/hyperbaric chambers near: ${locationDesc}`
          }
        ],
        temperature: 0.3,
      });

      let content = response.choices[0]?.message?.content || "[]";
      try {
        if (content.includes("```")) {
          content = content.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
        }
        const chambers = JSON.parse(content);
        res.json({ chambers, location: locationDesc });
      } catch {
        res.json({ chambers: [], rawResponse: content, location: locationDesc });
      }
    } catch (error: any) {
      console.error("Chamber search failed:", error);
      res.status(500).json({ message: error.message });
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
    try {
      const user = getUser(req);
      
      // Provide defaults for lat/lng if not supplied (Bug #4 & #8)
      const body = {
        ...req.body,
        lat: req.body.lat || "0",
        lng: req.body.lng || "0",
        verifiedBy: user.id,
        lastVerifiedAt: new Date(),
      };
      
      const facility = await storage.createDirectoryFacility(body);
      res.status(201).json(facility);
    } catch (error: any) {
      console.error("Create facility error:", error);
      res.status(500).json({ message: error?.message || "Failed to create facility" });
    }
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

  app.get("/api/projects/:projectId/directory", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    const directory = await storage.getProjectDirectory(req.params.projectId);
    res.json(directory || { status: "NEEDS_VERIFICATION" });
  });

  app.post("/api/projects/:projectId/directory/verify", requireRole("ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
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

  app.get("/api/projects/:projectId/library", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
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
  app.get("/api/projects/:projectId/library-exports", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    const exports = await storage.getLibraryExports(req.params.projectId);
    res.json(exports);
  });

  app.get("/api/days/:dayId/library-exports", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
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

  app.get("/api/library-exports/:id/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const exportDoc = await storage.getLibraryExport(req.params.id);
      if (!exportDoc) return res.status(404).json({ message: "Export not found" });

      const buffer = Buffer.from(exportDoc.fileData, "base64");

      if (exportDoc.fileType === "docx") {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(buffer);
        const xml = await zip.file("word/document.xml")?.async("string");
        if (!xml) return res.json({ content: "Unable to extract document content", lines: [] });

        const lines: string[] = [];
        const paragraphs = xml.split(/<w:p[ >]/);
        for (const para of paragraphs) {
          const texts: string[] = [];
          const textMatches = para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
          for (const m of textMatches) {
            texts.push(m[1]);
          }
          const line = texts.join("");
          if (line.trim()) lines.push(line.trim());
        }

        res.json({ content: lines.join("\n"), lines, fileName: exportDoc.fileName, fileType: exportDoc.fileType });
      } else {
        res.json({ content: "Preview not available for spreadsheet files. Please download to view.", lines: [], fileName: exportDoc.fileName, fileType: exportDoc.fileType });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADMIN - Users
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.listUsers();

      const roleFilter = req.query.role as string | undefined;
      const search = req.query.search as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

      let filtered = allUsers;

      if (roleFilter) {
        filtered = filtered.filter(u => u.role === roleFilter.toUpperCase());
      }

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(u =>
          u.username.toLowerCase().includes(q) ||
          (u.fullName && u.fullName.toLowerCase().includes(q)) ||
          (u.initials && u.initials.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q))
        );
      }

      const total = filtered.length;
      const offset = (page - 1) * limit;
      const paged = filtered.slice(offset, offset + limit);

      const safe = paged.map(({ password, ...rest }) => rest);

      res.json({ users: safe, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      console.error("[admin] Failed to list users:", error);
      res.status(500).json({ message: "Failed to list users" });
    }
  });

  app.get("/api/projects/:projectId/members", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
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

  app.post("/api/projects/:projectId/members", requireRole("ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
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
      const data = adminCreateUserSchema.parse(req.body);

      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Generate a secure random temporary password if none provided or if "changeme123"
      const crypto = await import("crypto");
      const tempPassword = data.password && data.password !== "changeme123"
        ? data.password
        : crypto.randomBytes(12).toString("base64url");

      const user = await storage.createUser({
        username: data.username,
        password: hashPassword(tempPassword),
        role: data.role,
        fullName: data.fullName || null,
        initials: data.initials || null,
        email: data.email || null,
        mustChangePassword: true,
      });

      const { password, ...sanitized } = user;
      // Return the temp password so the admin can share it with the user
      res.status(201).json({ ...sanitized, temporaryPassword: tempPassword });
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

  app.delete("/api/projects/:projectId/members/:userId", requireRole("ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const removed = await storage.removeProjectMember(req.params.projectId, req.params.userId);
      if (!removed) return res.status(404).json({ message: "Member not found" });
      res.json({ message: "Member removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // AUDIT TRAIL API
  // ────────────────────────────────────────────────────────────────────────────

  app.get("/api/audit-events", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      // SEC-07 FIX: Add pagination with offset and cap limit to prevent unbounded queries
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const limit = Math.min(Math.max(rawLimit, 1), 500); // Cap between 1 and 500
      const offset = req.query.offset ? Math.max(parseInt(req.query.offset as string), 0) : 0;

      const events = await storage.getAuditEvents({
        targetId: req.query.targetId as string | undefined,
        targetType: req.query.targetType as string | undefined,
        action: req.query.action as string | undefined,
        dayId: req.query.dayId as string | undefined,
        limit: limit + 1, // Fetch one extra to determine if there are more
        offset,
      });

      const hasMore = events.length > limit;
      const page = hasMore ? events.slice(0, limit) : events;

      res.json({
        events: page,
        pagination: {
          limit,
          offset,
          count: page.length,
          hasMore,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit events" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CONVERSATION / AI CHAT ENDPOINTS
  // ────────────────────────────────────────────────────────────────────────────

  app.post("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { conversations } = await import("@shared/schema");
      const title = req.body.title || "DiveOps Assistant";
      const [conv] = await db.insert(conversations).values({ title }).returning();
      res.status(201).json(conv);
    } catch (error) {
      console.error("Create conversation error:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { conversations, messages: messagesTable } = await import("@shared/schema");
      const { eq, asc } = await import("drizzle-orm");
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid conversation ID" });

      const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
      if (!conv) return res.status(404).json({ message: "Conversation not found" });

      const msgs = await db.select().from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(asc(messagesTable.createdAt));

      res.json({ ...conv, messages: msgs });
    } catch (error) {
      console.error("Get conversation error:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { conversations, messages: messagesTable, logEvents, riskItems } = await import("@shared/schema");
      const { eq, desc, asc, count } = await import("drizzle-orm");
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid conversation ID" });

      const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
      if (!conv) return res.status(404).json({ message: "Conversation not found" });

      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ message: "Message content required" });

      await db.insert(messagesTable).values({
        conversationId: id,
        role: "user",
        content: content.trim(),
      });

      const priorMessages = await db.select().from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(asc(messagesTable.createdAt));

      const recentLogs = await db.select().from(logEvents)
        .orderBy(desc(logEvents.createdAt))
        .limit(20);

      const openRisks = await db.select().from(riskItems)
        .where(eq(riskItems.status, "open"))
        .limit(10);

      const contextSummary = [
        `Recent log entries (${recentLogs.length}):`,
        ...recentLogs.slice(0, 10).map(e => `  ${e.eventTime ? new Date(e.eventTime).toISOString().substring(11, 16) : '??:??'} [${e.category}] ${e.rawText?.substring(0, 100)}`),
        `\nOpen risks (${openRisks.length}):`,
        ...openRisks.map(r => `  ${r.riskId}: ${r.description?.substring(0, 100)}`),
      ].join("\n");

      try {
        const openai = new (await import("openai")).default({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL || undefined,
        });

        const chatMessages = [
          {
            role: "system" as const,
            content: `You are the DiveOps™ AI Assistant for Precision Subsea Group. You help supervisors with dive operations questions, safety protocols, documentation, and operational guidance. You follow U.S. Navy Dive Manual standards. You NEVER calculate or infer dive tables or decompression data — only quote verbatim from the manual if asked. Be concise and operationally focused.\n\nCurrent operational context:\n${contextSummary}`,
          },
          ...priorMessages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const stream = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: chatMessages,
          stream: true,
          max_completion_tokens: 1000,
        });

        let fullResponse = "";
        for await (const chunk of stream) {
          const content_chunk = chunk.choices[0]?.delta?.content;
          if (content_chunk) {
            fullResponse += content_chunk;
            res.write(`data: ${JSON.stringify({ content: content_chunk })}\n\n`);
          }
        }

        await db.insert(messagesTable).values({
          conversationId: id,
          role: "assistant",
          content: fullResponse,
        });

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (aiErr: any) {
        console.error("AI chat error:", aiErr);
        const fallback = "I'm sorry, I'm having trouble connecting to the AI service right now. Please try again in a moment.";
        await db.insert(messagesTable).values({
          conversationId: id,
          role: "assistant",
          content: fallback,
        });
        res.setHeader("Content-Type", "text/event-stream");
        res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error("Send message error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to send message" });
      }
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ML DATA EXPORT ENDPOINTS
  // ────────────────────────────────────────────────────────────────────────────

  app.get("/api/ml-export/stats", requireRole("ADMIN", "GOD"), async (_req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { conversations, messages, logEvents, mlExportLog, projects, days } = await import("@shared/schema");
      const { count, desc } = await import("drizzle-orm");

      const [convCount] = await db.select({ value: count() }).from(conversations);
      const [msgCount] = await db.select({ value: count() }).from(messages);
      const [eventCount] = await db.select({ value: count() }).from(logEvents);
      const [projectCount] = await db.select({ value: count() }).from(projects);
      const [dayCount] = await db.select({ value: count() }).from(days);

      const exportHistory = await db.select().from(mlExportLog)
        .orderBy(desc(mlExportLog.exportedAt))
        .limit(20);

      const lastFullExport = exportHistory.find(e => e.exportType === "full-bundle");

      res.json({
        conversations: convCount?.value || 0,
        messages: msgCount?.value || 0,
        logEvents: eventCount?.value || 0,
        projects: projectCount?.value || 0,
        days: dayCount?.value || 0,
        lastFullExport: lastFullExport ? {
          exportedAt: lastFullExport.exportedAt?.toISOString(),
          recordCount: lastFullExport.recordCount,
        } : null,
        exportHistory: exportHistory.map(e => ({
          id: e.id,
          exportType: e.exportType,
          recordCount: e.recordCount,
          exportedAt: e.exportedAt?.toISOString(),
        })),
      });
    } catch (error) {
      console.error("ML export stats error:", error);
      res.status(500).json({ message: "Failed to fetch ML export stats" });
    }
  });

  app.get("/api/ml-export/conversations", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { conversations, messages } = await import("@shared/schema");
      const { eq, asc } = await import("drizzle-orm");

      const allConversations = await db.select().from(conversations);
      const lines: string[] = [];

      for (const conv of allConversations) {
        const msgs = await db.select().from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(asc(messages.createdAt));

        if (msgs.length === 0) continue;

        const chatMessages = msgs.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.createdAt?.toISOString() || null,
        }));

        lines.push(JSON.stringify({
          conversation_id: conv.id,
          title: conv.title,
          created_at: conv.createdAt?.toISOString() || null,
          message_count: chatMessages.length,
          messages: chatMessages,
        }));
      }

      const user = getUser(req);
      const { mlExportLog } = await import("@shared/schema");
      await db.insert(mlExportLog).values({
        exportType: "conversations",
        exportedBy: user.id,
        recordCount: lines.length,
      });

      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="diveops_conversations_${new Date().toISOString().split('T')[0]}.jsonl"`);
      res.send(lines.join("\n"));
    } catch (error) {
      console.error("ML conversation export error:", error);
      res.status(500).json({ message: "Failed to export conversations" });
    }
  });

  app.get("/api/ml-export/log-training", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { logEvents, days, projects } = await import("@shared/schema");
      const { eq, asc } = await import("drizzle-orm");

      const allEvents = await db.select({
        event: logEvents,
        dayDate: days.date,
        projectName: projects.name,
      })
        .from(logEvents)
        .leftJoin(days, eq(logEvents.dayId, days.id))
        .leftJoin(projects, eq(logEvents.projectId, projects.id))
        .orderBy(asc(logEvents.eventTime));

      const lines: string[] = [];

      for (const row of allEvents) {
        const e = row.event;
        lines.push(JSON.stringify({
          id: e.id,
          project: row.projectName || null,
          day_date: row.dayDate || null,
          station: e.station || null,
          event_time: e.eventTime?.toISOString() || null,
          raw_text: e.rawText,
          category: e.category || null,
          extracted_json: e.extractedJson || null,
          structured_payload: e.structuredPayload || null,
          ai_annotations: e.aiAnnotations || null,
          validation_passed: e.validationPassed,
        }));
      }

      const user = getUser(req);
      const { mlExportLog } = await import("@shared/schema");
      await db.insert(mlExportLog).values({
        exportType: "log-training",
        exportedBy: user.id,
        recordCount: lines.length,
      });

      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="diveops_log_training_${new Date().toISOString().split('T')[0]}.jsonl"`);
      res.send(lines.join("\n"));
    } catch (error) {
      console.error("ML log training export error:", error);
      res.status(500).json({ message: "Failed to export log training data" });
    }
  });

  app.get("/api/ml-export/full-bundle", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { conversations, messages, logEvents, days, projects, dives, riskItems } = await import("@shared/schema");
      const { eq, asc } = await import("drizzle-orm");

      const bundle: Record<string, any> = {
        exported_at: new Date().toISOString(),
        format_version: "1.0",
        datasets: {},
      };

      const allConversations = await db.select().from(conversations);
      const convData = [];
      for (const conv of allConversations) {
        const msgs = await db.select().from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(asc(messages.createdAt));
        convData.push({
          id: conv.id,
          title: conv.title,
          created_at: conv.createdAt?.toISOString(),
          messages: msgs.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.createdAt?.toISOString(),
          })),
        });
      }
      bundle.datasets.conversations = convData;

      const allEvents = await db.select().from(logEvents).orderBy(asc(logEvents.eventTime));
      bundle.datasets.log_events = allEvents.map(e => ({
        id: e.id,
        day_id: e.dayId,
        station: e.station,
        event_time: e.eventTime?.toISOString(),
        raw_text: e.rawText,
        category: e.category,
        extracted_json: e.extractedJson,
        structured_payload: e.structuredPayload,
        ai_annotations: e.aiAnnotations,
        validation_passed: e.validationPassed,
      }));

      const allDives = await db.select().from(dives).orderBy(asc(dives.lsTime));
      bundle.datasets.dives = allDives.map(d => ({
        id: d.id,
        day_id: d.dayId,
        diver: d.diverDisplayName,
        dive_number: d.diveNumber,
        station: d.station,
        ls_time: d.lsTime?.toISOString(),
        rb_time: d.rbTime?.toISOString(),
        lb_time: d.lbTime?.toISOString(),
        rs_time: d.rsTime?.toISOString(),
        max_depth_fsw: d.maxDepthFsw,
        task_summary: d.taskSummary,
      }));

      const allRisks = await db.select().from(riskItems);
      bundle.datasets.risks = allRisks.map(r => ({
        id: r.id,
        risk_id: r.riskId,
        description: r.description,
        source: r.source,
        category: r.category,
        initial_risk_level: r.initialRiskLevel,
        residual_risk: r.residualRisk,
        mitigation: r.mitigation,
        status: r.status,
      }));

      const user = getUser(req);
      const { mlExportLog: mlExportLogTable } = await import("@shared/schema");
      const totalRecords = (bundle.datasets.conversations?.length || 0) +
        (bundle.datasets.log_events?.length || 0) +
        (bundle.datasets.dives?.length || 0) +
        (bundle.datasets.risks?.length || 0);
      await db.insert(mlExportLogTable).values({
        exportType: "full-bundle",
        exportedBy: user.id,
        recordCount: totalRecords,
      });

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="diveops_ml_bundle_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(bundle);
    } catch (error) {
      console.error("ML full bundle export error:", error);
      res.status(500).json({ message: "Failed to export full ML bundle" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ML-GATED DATA PURGE ENDPOINTS (requires full-bundle export first)
  // ────────────────────────────────────────────────────────────────────────────

  app.delete("/api/ml-export/purge/project/:projectId", requireRole("GOD"), async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { mlExportLog, projects, days, logEvents, dives, libraryExports, riskItems, auditEvents } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");

      const lastFullExport = await db.select().from(mlExportLog)
        .where(eq(mlExportLog.exportType, "full-bundle"))
        .orderBy(desc(mlExportLog.exportedAt))
        .limit(1);

      if (lastFullExport.length === 0) {
        return res.status(403).json({
          message: "Cannot purge data: No ML full-bundle export has been performed. Export the full ML bundle first to preserve training data before deletion.",
        });
      }

      const projectId = req.params.projectId;
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const projectDays = await db.select({ id: days.id }).from(days).where(eq(days.projectId, projectId));
      const dayIds = projectDays.map(d => d.id);

      let deletedEvents = 0, deletedDives = 0, deletedExports = 0, deletedRisks = 0;

      if (dayIds.length > 0) {
        for (const dayId of dayIds) {
          const evtResult = await db.delete(logEvents).where(eq(logEvents.dayId, dayId));
          deletedEvents += (evtResult as any).rowCount || 0;
          const diveResult = await db.delete(dives).where(eq(dives.dayId, dayId));
          deletedDives += (diveResult as any).rowCount || 0;
          await db.delete(libraryExports).where(eq(libraryExports.dayId, dayId));
        }
      }

      const riskResult = await db.delete(riskItems).where(eq(riskItems.projectId, projectId));
      deletedRisks = (riskResult as any).rowCount || 0;

      await db.delete(days).where(eq(days.projectId, projectId));
      await db.delete(auditEvents).where(eq(auditEvents.projectId, projectId));
      await db.delete(projects).where(eq(projects.id, projectId));

      const user = getUser(req);
      await db.insert(auditEvents).values({
        action: "DATA_PURGE",
        userId: user.id,
        projectId: null,
        details: {
          purgeType: "project",
          projectName: project.name,
          projectId,
          deletedEvents,
          deletedDives,
          deletedRisks,
          deletedDays: dayIds.length,
          mlExportRef: lastFullExport[0].id,
        },
      });

      res.json({
        message: `Project "${project.name}" and all associated data purged successfully`,
        deleted: { events: deletedEvents, dives: deletedDives, risks: deletedRisks, days: dayIds.length },
        mlExportRef: lastFullExport[0].id,
      });
    } catch (error) {
      console.error("Project purge error:", error);
      res.status(500).json({ message: "Failed to purge project data" });
    }
  });

  // Direct project delete (GOD only, no ML export required)
  app.delete("/api/projects/:projectId", requireRole("GOD"), async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const schema = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const projectId = req.params.projectId;
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
          // logRenders reference logEvents
          try { await db.delete(schema.logRenders).where(eq(schema.logRenders.dayId, dayId)); } catch(e) {}
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
      try { await db.delete(schema.sops).where(eq(schema.sops.projectId, projectId)); } catch(e) {}
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId));

      res.json({ message: `Project "${project.name}" deleted successfully` });
    } catch (error) {
      console.error("Project delete error:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.delete("/api/ml-export/purge/conversations", requireRole("GOD"), async (_req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { mlExportLog, conversations, messages, auditEvents } = await import("@shared/schema");
      const { eq, desc, count } = await import("drizzle-orm");

      const lastFullExport = await db.select().from(mlExportLog)
        .where(eq(mlExportLog.exportType, "full-bundle"))
        .orderBy(desc(mlExportLog.exportedAt))
        .limit(1);

      if (lastFullExport.length === 0) {
        return res.status(403).json({
          message: "Cannot purge conversations: No ML full-bundle export has been performed. Export first.",
        });
      }

      const [msgCount] = await db.select({ value: count() }).from(messages);
      const [convCount] = await db.select({ value: count() }).from(conversations);

      await db.delete(messages);
      await db.delete(conversations);

      const user = getUser(_req);
      await db.insert(auditEvents).values({
        action: "DATA_PURGE",
        userId: user.id,
        projectId: null,
        details: {
          purgeType: "conversations",
          deletedConversations: convCount?.value || 0,
          deletedMessages: msgCount?.value || 0,
          mlExportRef: lastFullExport[0].id,
        },
      });

      res.json({
        message: "All AI conversations purged successfully",
        deleted: { conversations: convCount?.value || 0, messages: msgCount?.value || 0 },
        mlExportRef: lastFullExport[0].id,
      });
    } catch (error) {
      console.error("Conversations purge error:", error);
      res.status(500).json({ message: "Failed to purge conversations" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // PROJECT SOPs (Standard Operating Procedures)
  // ────────────────────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/sops", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const sops = await storage.getProjectSops(req.params.projectId);
      res.json(sops);
    } catch (error) {
      console.error("Get SOPs error:", error);
      res.status(500).json({ message: "Failed to get SOPs" });
    }
  });

  app.post("/api/projects/:projectId/sops", requireRole("ADMIN", "GOD", "SUPERVISOR"), requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const sop = await storage.createProjectSop({
        projectId: req.params.projectId,
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

  app.put("/api/sops/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
    try {
      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      const sop = await storage.updateProjectSop(req.params.id, updates);
      if (!sop) return res.status(404).json({ message: "SOP not found" });
      res.json(sop);
    } catch (error) {
      console.error("Update SOP error:", error);
      res.status(500).json({ message: "Failed to update SOP" });
    }
  });

  app.delete("/api/sops/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteProjectSop(req.params.id);
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

  app.post("/api/sops", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
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
  app.patch("/api/sops/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
    try {
      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      const sop = await storage.updateProjectSop(req.params.id, updates);
      if (!sop) return res.status(404).json({ message: "SOP not found" });
      res.json(sop);
    } catch (error) {
      console.error("PATCH SOP error:", error);
      res.status(500).json({ message: "Failed to update SOP" });
    }
  });

  app.get("/api/sops", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) return res.status(400).json({ message: "projectId query param is required" });
      const sops = await storage.getProjectSops(projectId);
      res.json(sops);
    } catch (error) {
      console.error("Get SOPs error:", error);
      res.status(500).json({ message: "Failed to get SOPs" });
    }
  });

  app.post("/api/facilities", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { name, type, facilityType, address, location, lat, latitude, lng, longitude, phone, hours, notes } = req.body;
      const resolvedType = facilityType || type;
      if (!name || !resolvedType) return res.status(400).json({ message: "name and type (or facilityType) are required" });
      const facility = await storage.createDirectoryFacility({
        name,
        facilityType: resolvedType,
        address: address || location || "Unknown",
        lat: lat || latitude || "0",
        lng: lng || longitude || "0",
        phone: phone || null,
        hours: hours || null,
        notes: notes || null,
        verifiedBy: user.id,
        lastVerifiedAt: new Date(),
      });
      res.status(201).json(facility);
    } catch (error: any) {
      console.error("Create facility error:", error);
      res.status(500).json({ message: error?.message || "Failed to create facility" });
    }
  });

  app.get("/api/facilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const facilities = await storage.getDirectoryFacilities();
      res.json(facilities);
    } catch (error: any) {
      // CRIT-04 FIX: If the table doesn't exist yet, return empty array instead of 500
      if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
        console.warn("[Facilities] Table not found, returning empty array");
        return res.json([]);
      }
      console.error("Get facilities error:", error);
      res.status(500).json({ message: "Failed to get facilities" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // HEALTH CHECK & FEATURE FLAGS (Operations)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      const dbCheck = await pool.query("SELECT 1 AS ok");
      const flags = getFlagStatus();
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: dbCheck.rows.length > 0 ? "connected" : "error",
        featureFlags: flags,
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: String(error),
      });
    }
  });

  // Public feature flags endpoint (read-only, any authenticated user)
  app.get("/api/feature-flags", requireAuth, async (_req: Request, res: Response) => {
    res.json(getFlagStatus());
  });

  app.get("/api/admin/feature-flags", requireRole("GOD"), async (_req: Request, res: Response) => {
    res.json(getFlagStatus());
  });

  app.post("/api/admin/feature-flags", requireRole("GOD"), async (req: Request, res: Response) => {
    const { flag, enabled } = req.body;
    const validFlags = ["closeDay", "riskCreation", "exportGeneration", "aiProcessing"];
    if (!validFlags.includes(flag)) {
      return res.status(400).json({ message: `Invalid flag. Valid flags: ${validFlags.join(", ")}` });
    }
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be boolean" });
    }
    setFlag(flag as any, enabled);

    const ctx: AuditContext = { ...req.auditCtx! };
    emitAuditEvent(ctx, "system.feature_flag" as AuditAction, {
      targetType: "feature_flag",
      metadata: { flag, enabled },
    });

    res.json({ flag, enabled, allFlags: getFlagStatus() });
  });

  app.post("/api/admin/feature-flags/reset", requireRole("GOD"), async (req: Request, res: Response) => {
    resetFlags();
    const ctx: AuditContext = { ...req.auditCtx! };
    emitAuditEvent(ctx, "system.feature_flag" as AuditAction, {
      targetType: "feature_flag",
      metadata: { action: "reset_all" },
    });
    res.json({ message: "All feature flags reset to defaults", flags: getFlagStatus() });
  });

  // HIGH-07 FIX: Restrict sweep to GOD role only (destructive system operation)
  app.post("/api/sweep/run", requireRole("GOD"), async (_req: Request, res: Response) => {
    try {
      const { runSweep, isSweepRunning } = await import("./sweep");
      if (isSweepRunning()) {
        return res.status(409).json({ message: "Sweep already running" });
      }
      const result = await runSweep();
      res.json(result);
    } catch (error) {
      console.error("Manual sweep error:", error);
      res.status(500).json({ message: "Sweep failed" });
    }
  });

  // Bootstrap endpoint - create/promote GOD user using a secret token
  // Protected by BOOTSTRAP_SECRET env var. Remove after initial setup.
  app.post("/api/bootstrap", async (req: Request, res: Response) => {
    const secret = process.env.BOOTSTRAP_SECRET;
    if (!secret) {
      return res.status(404).json({ message: "Not found" });
    }
    if (req.body.secret !== secret) {
      return res.status(403).json({ message: "Invalid secret" });
    }
    try {
      const { username, password, fullName, initials, email, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "username and password required" });
      }
      const validRole = role || "GOD";
      
      // Check if user exists
      let user = await storage.getUserByUsername(username);
      if (user) {
        // Update existing user's role via direct DB update
        const { db } = await import("./db");
        const { users } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(users).set({ 
          role: validRole,
          password: hashPassword(password),
          ...(fullName ? { fullName } : {}),
          ...(initials ? { initials: initials.toUpperCase() } : {}),
          ...(email ? { email } : {}),
        }).where(eq(users.id, user.id));
        user = await storage.getUser(user.id);
        return res.json({ message: `User ${username} updated to ${validRole}`, user: { id: user!.id, username: user!.username, role: user!.role } });
      }
      
      // Create new user
      user = await storage.createUser({
        username,
        password: hashPassword(password),
        role: validRole as any,
        fullName: fullName || username,
        initials: initials?.toUpperCase() || username.substring(0, 2).toUpperCase(),
        email: email || "",
      });
      
      res.status(201).json({ message: `User ${username} created as ${validRole}`, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
      console.error("Bootstrap error:", error);
      res.status(500).json({ message: "Bootstrap failed" });
    }
  });

  // GOD-only migration trigger endpoint
  app.post("/api/admin/run-migrations", requireRole("GOD"), async (_req: Request, res: Response) => {
    try {
      const { runMigrations } = await import("./migrate");
      await runMigrations();
      res.json({ message: "Migrations executed successfully" });
    } catch (error: any) {
      console.error("Migration trigger error:", error);
      res.status(500).json({ message: error?.message || "Migration failed" });
    }
  });

  // GOD-only direct SQL migration for table_citation (fallback)
  app.post("/api/admin/fix-schema", requireRole("GOD"), async (_req: Request, res: Response) => {
    try {
      await pool.query(`ALTER TABLE "dives" ADD COLUMN IF NOT EXISTS "table_citation" text`);
      res.json({ message: "Schema fix applied: table_citation column added" });
    } catch (error: any) {
      console.error("Schema fix error:", error);
      res.status(500).json({ message: error?.message || "Schema fix failed" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GEOCODING ENDPOINT (Item #1)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/geocode", requireAuth, async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      if (!address) return res.status(400).json({ message: "Address query parameter is required" });

      const encoded = encodeURIComponent(address);
      const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": "DiveOps-MVP/1.0 (contact@precisionsubsea.com)" },
      });
      if (!response.ok) {
        return res.status(502).json({ message: "Geocoding service unavailable" });
      }
      const results = await response.json() as any[];
      if (!results || results.length === 0) {
        return res.json({ lat: null, lng: null, displayName: null });
      }
      const { lat, lon, display_name } = results[0];
      res.json({ lat: String(lat), lng: String(lon), displayName: display_name });
    } catch (error: any) {
      console.error("Geocoding error:", error);
      res.status(500).json({ message: error?.message || "Geocoding failed" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIVER CERTIFICATIONS CRUD (Item #2)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/diver-certifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (userId) {
        const certs = await storage.getDiverCertifications(userId);
        return res.json(certs);
      }
      const certs = await storage.getAllDiverCertifications();
      res.json(certs);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to fetch diver certifications" });
    }
  });

  app.post("/api/diver-certifications", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
    try {
      const cert = await storage.createDiverCertification(req.body);
      res.status(201).json(cert);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to create diver certification" });
    }
  });

  app.patch("/api/diver-certifications/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
    try {
      const cert = await storage.updateDiverCertification(req.params.id, req.body);
      if (!cert) return res.status(404).json({ message: "Certification not found" });
      res.json(cert);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to update diver certification" });
    }
  });

  app.delete("/api/diver-certifications/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteDiverCertification(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Certification not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to delete diver certification" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // EQUIPMENT CERTIFICATIONS CRUD (Item #2)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/equipment-certifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const certs = await storage.getEquipmentCertifications(projectId || undefined);
      res.json(certs);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to fetch equipment certifications" });
    }
  });

  app.post("/api/equipment-certifications", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
    try {
      const cert = await storage.createEquipmentCertification(req.body);
      res.status(201).json(cert);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to create equipment certification" });
    }
  });

  app.patch("/api/equipment-certifications/:id", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
    try {
      const cert = await storage.updateEquipmentCertification(req.params.id, req.body);
      if (!cert) return res.status(404).json({ message: "Certification not found" });
      res.json(cert);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to update equipment certification" });
    }
  });

  app.delete("/api/equipment-certifications/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteEquipmentCertification(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Certification not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to delete equipment certification" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CERTIFICATIONS - Expiring & Stats endpoints
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/certifications/expiring", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const daysAhead = parseInt(req.query.daysAhead as string || "30", 10);
      const certs = await storage.getExpiringCertifications(projectId || undefined, daysAhead);
      res.json(certs);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to fetch expiring certifications" });
    }
  });

  app.get("/api/certifications/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const stats = await storage.getCertificationStats(projectId || undefined);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to fetch certification stats" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CHANGE PASSWORD ENDPOINT (Item #3 - Invite flow)
  // ──────────────────────────────────────────────────────────────────────────

  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { currentPassword, newPassword } = req.body;

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      // If user must change password (invite flow), currentPassword is the temp password
      // Otherwise require current password verification
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) return res.status(404).json({ message: "User not found" });

      if (!fullUser.mustChangePassword && currentPassword) {
        // Verify current password
        const crypto = await import("crypto");
        const [salt, hash] = fullUser.password.split(".");
        const derived = crypto.scryptSync(currentPassword, salt, 64).toString("hex");
        if (derived !== hash) {
          return res.status(400).json({ message: "Current password is incorrect" });
        }
      }

      await storage.updateUser(user.id, {
        password: hashPassword(newPassword),
        mustChangePassword: false,
      });

      res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to change password" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REFERENCE DOCUMENT VIEWER (Item #4 - Azure Blob SAS URLs)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/reference-docs/list", requireAuth, async (_req: Request, res: Response) => {
    try {
      const blobStorage = await import("./services/blob-storage");
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

  app.get("/api/reference-docs/sas-url", requireAuth, async (req: Request, res: Response) => {
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

      const blobStorage = await import("./services/blob-storage");
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

  // CRIT-02 FIX: Await the async route registration so these routes are registered
  // BEFORE the SPA catch-all in serveStatic(). Previously the un-awaited IIFE caused
  // a race condition where the catch-all was registered first, making all knowledge-base,
  // analytics, and ML routes unreachable (they returned HTML instead of JSON).
  try {
    const { registerKnowledgeBaseRoutes } = await import("./routes/knowledge-base.routes");
    const { registerAnalyticsRoutes } = await import("./routes/analytics.routes");
    const { registerMlRoutes } = await import("./routes/ml.routes");
    
    registerKnowledgeBaseRoutes(app);
    registerAnalyticsRoutes(app);
    registerMlRoutes(app);
    console.log("[Routes] Knowledge-base, analytics, and ML route modules registered successfully");
  } catch (error) {
    console.error("[Routes] Failed to register route modules:", error);
  }

  return httpServer;
}
