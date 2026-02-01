import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import express from "express";
import { storage } from "./storage";
import { passport, hashPassword, requireAuth, requireRole, canWriteLogEvents, isGod, isAdminOrHigher } from "./auth";
import { classifyEvent, extractData, parseEventTime, generateRiskId, getMasterLogSection, renderInternalCanvasLine } from "./extraction";
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
          
          // If safety incident, create a risk item
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
          
          // If dive operation, create/update dive record for the diver
          if (category === "dive_op" && extracted.diveOperation && extracted.diverInitials?.length) {
            for (const initials of extracted.diverInitials) {
              const diver = await storage.getUserByInitials(initials, data.projectId);
              if (diver) {
                const dive = await storage.getOrCreateDiveForDiver(day.id, data.projectId, diver.id);
                const timeField = `${extracted.diveOperation}Time` as 'lsTime' | 'rbTime' | 'lbTime' | 'rsTime';
                await storage.updateDiveTimes(dive.id, timeField, eventTime, extracted.depthFsw);
              }
            }
          }
        })
        .catch((error) => {
          console.error("AI rendering failed:", error);
        });
      
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
    res.json(dives);
  });

  app.get("/api/users/:userId/dives", requireAuth, async (req: Request, res: Response) => {
    const dives = await storage.getDivesByDiver(req.params.userId, req.query.dayId as string);
    res.json(dives);
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
    
    // Group by section
    const sections: Record<string, any[]> = {
      ops: [],
      dive: [],
      directives: [],
      safety: [],
      risk: [],
    };
    
    for (const event of events) {
      const renders = await storage.getLogRendersByEvent(event.id);
      const masterRender = renders.find(r => r.renderType === "master_log_line");
      
      const section = getMasterLogSection(event.category as any);
      sections[section].push({
        id: event.id,
        eventTime: event.eventTime,
        rawText: event.rawText,
        masterLogLine: masterRender?.renderText || event.rawText,
        status: masterRender?.status || "ok",
      });
    }
    
    // Get dives for this day with diver info
    const dives = await storage.getDivesByDay(req.params.dayId);
    const divesWithNames = await Promise.all(dives.map(async (dive) => {
      const diver = await storage.getUser(dive.diverId);
      return {
        ...dive,
        diverName: diver?.fullName || diver?.username || dive.diverId,
      };
    }));
    
    // Calculate summary from log events (more accurate than dives table)
    // Count L/S (left surface) patterns as dive starts, extract diver initials
    const allDiverInitials = new Set<string>();
    let diveStartCount = 0;
    let extractedMaxDepth = 0;
    
    for (const event of events) {
      const text = event.rawText.toUpperCase();
      
      // Extract diver initials (2-3 letter codes before L, R, or after time)
      const initialsMatch = text.match(/\b([A-Z]{2,3})\s*[LR]\b/g);
      if (initialsMatch) {
        initialsMatch.forEach(m => {
          const initials = m.replace(/\s*[LR]$/, '').trim();
          if (initials.length >= 2 && initials.length <= 3) {
            allDiverInitials.add(initials);
          }
        });
      }
      
      // Also extract full names like "Zach Meador L" or "Michael Meehan L"
      const nameMatch = event.rawText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s+L\b/g);
      if (nameMatch) {
        nameMatch.forEach(() => diveStartCount++);
      }
      
      // Count L/S patterns (left surface / start dive)
      const lsMatches = text.match(/\bL\/?S\b/g);
      if (lsMatches) {
        diveStartCount += lsMatches.length;
      }
      
      // Count standalone L patterns after initials (e.g., "0658 Michael Meehan L")
      const standaloneL = text.match(/\b[A-Z]{2,3}\s+L\b/g);
      if (standaloneL) {
        diveStartCount += standaloneL.length;
      }
      
      // Extract depths (fsw patterns)
      const depthMatch = text.match(/(\d+)\s*FSW/i);
      if (depthMatch) {
        const depth = parseInt(depthMatch[1], 10);
        if (depth > extractedMaxDepth) extractedMaxDepth = depth;
      }
    }
    
    // Use dives table if it has data, otherwise use extracted data
    const uniqueDivers = dives.length > 0 
      ? new Set(dives.map(d => d.diverId))
      : allDiverInitials;
    const maxDepth = Math.max(
      extractedMaxDepth,
      ...dives.map(d => d.maxDepthFsw || 0)
    );
    const totalDives = dives.length > 0 ? dives.length : Math.max(diveStartCount, sections.dive.length);
    const totalDivers = dives.length > 0 ? uniqueDivers.size : Math.max(allDiverInitials.size, 1);
    
    res.json({
      day,
      isLocked: day.status === "CLOSED",
      isDraft: day.status !== "CLOSED",
      sections,
      dives: divesWithNames,
      summary: {
        totalDives,
        totalDivers,
        maxDepth,
        safetyIncidents: sections.safety.length,
        directivesCount: sections.directives.length,
        extractedDiverInitials: Array.from(allDiverInitials),
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

  app.get("/api/project-dive-plans/:id/download", requireAuth, async (req: Request, res: Response) => {
    const { generateDD5DivePlanDocx } = await import("./dive-plan-generator");
    
    const plan = await storage.getProjectDivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
    
    const creator = await storage.getUser(plan.createdBy);
    const preparedBy = creator?.displayName || creator?.username || "Unknown";
    
    const buffer = await generateDD5DivePlanDocx(
      plan.planData as any,
      preparedBy
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

  return httpServer;
}
