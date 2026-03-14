import express, { type Request, type Response } from "express";
import { storage, pool } from "../storage";
import { requireAuth, requireRole, hashPassword, isGod, isAdminOrHigher } from "../auth";
import { requireProjectAccess } from "../authz";
import { isEnabled, setFlag, resetFlags, getFlagStatus } from "../feature-flags";
import { generateCorrelationId, emitAuditEvent, type AuditContext } from "../audit";
import type { AuditAction } from "@shared/schema";
import type { User } from "@shared/schema";
import { z } from "zod";
import { randomBytes } from "crypto";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// Admin-created users still require 8-char minimum password
const adminCreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role: z.enum(["GOD", "ADMIN", "SUPERVISOR", "DIVER"]),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api
// ────────────────────────────────────────────────────────────────────────────

export const adminRouter = express.Router();

// Bootstrap single-use flag
let bootstrapUsed = false;

// ──────────────────────────────────────────────────────────────────────────
// ADMIN - Users
// ──────────────────────────────────────────────────────────────────────────

adminRouter.get("/admin/users", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  // Multi-tenant scoping for admin user list
  if (isEnabled("multiTenantOrg")) {
    const user = getUser(req);
    if (!isGod(user.role) && user.companyId) {
      try {
        const users = await storage.getUsersByCompany(user.companyId);
        const sanitized = users.map(({ password, ...rest }: any) => rest);
        return res.json(sanitized);
      } catch (error) {
        return res.status(500).json({ message: "Failed to list users" });
      }
    }
  }
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

// ──────────────────────────────────────────────────────────────────────────
// ADMIN: USER MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────

adminRouter.get("/users", requireRole("ADMIN", "GOD", "SUPERVISOR"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    let users;
    if (isEnabled("multiTenantOrg") && !isGod(user.role)) {
      // ADMIN: only see users in their company
      if (!user.companyId) {
        return res.json([]);
      }
      users = await storage.getUsersByCompany(user.companyId);
    } else if (isEnabled("multiTenantOrg") && isGod(user.role) && req.query.companyId) {
      // GOD filtering by company
      users = await storage.getUsersByCompany(req.query.companyId as string);
    } else {
      users = await storage.listUsers();
    }
    const sanitized = users.map(({ password, ...rest }) => rest);
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ message: "Failed to list users" });
  }
});

  adminRouter.post("/users", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
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
      : randomBytes(12).toString("base64url");
    // Multi-tenant: resolve companyId for new user
    let newUserCompanyId: string | null = null;
    if (isEnabled("multiTenantOrg")) {
      const creator = getUser(req);
      if (isGod(creator.role)) {
        newUserCompanyId = (req.body as any).companyId || null;
      } else {
        newUserCompanyId = creator.companyId || null;
      }
      // ADMIN cannot create GOD users
      if (!isGod(creator.role) && data.role === "GOD") {
        return res.status(403).json({ message: "Only GOD can create GOD users" });
      }
      // BUG-16 FIX: Require companyId for non-GOD users
      if (data.role !== "GOD" && !newUserCompanyId) {
        return res.status(400).json({ message: "companyId is required for non-GOD users" });
      }
    }
    const user = await storage.createUser({
      username: data.username,
      password: hashPassword(tempPassword),
      role: data.role,
      fullName: data.fullName || null,
      initials: data.initials || null,
      email: data.email || null,
      mustChangePassword: true,
      ...(newUserCompanyId ? { companyId: newUserCompanyId } : {}),
    });

    const { password, ...sanitized } = user;
    const createUserCorrelationId = generateCorrelationId();
    const createUserActor = getUser(req);
    const createUserCtx = { correlationId: createUserCorrelationId, userId: createUserActor.id, ipAddress: req.ip || "unknown" };
    emitAuditEvent(createUserCtx, "user.create", { targetId: user.id, targetType: "user", metadata: { createdUsername: user.username, role: user.role } }).catch(() => {});
    // Return the temp password so the admin can share it with the user
    res.status(201).json({ ...sanitized, temporaryPassword: tempPassword });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create user" });
  }
});

adminRouter.patch("/users/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password = hashPassword(updates.password);
    }

    const user = await storage.updateUser(p(req.params.id), updates);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { password, ...sanitized } = user;
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ message: "Failed to update user" });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// AUDIT TRAIL API
// ────────────────────────────────────────────────────────────────────────────

// BUG-ROLE-02 FIX: Restrict audit events to GOD-only (was ADMIN + GOD)
adminRouter.get("/audit-events", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    // SEC-07 FIX: Add pagination with offset and cap limit to prevent unbounded queries
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string) : 200;
    const limit = Math.min(Math.max(rawLimit, 1), 500); // Cap between 1 and 500
    const offset = req.query.offset ? Math.max(parseInt(req.query.offset as string), 0) : 0;
    const events = await storage.getAuditEvents({
      targetId: req.query.targetId as string | undefined,
      targetType: req.query.targetType as string | undefined,
      action: req.query.action as string | undefined,
      dayId: req.query.dayId as string | undefined,
      userId: req.query.userId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
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

// ──────────────────────────────────────────────────────────────────────────
// HEALTH CHECK & FEATURE FLAGS (Operations)
// ──────────────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * ─────────────────────────────────────────────────────────────────────────
 * Azure Container Apps health probe endpoint.
 *
 * Success (HTTP 200):
 *   { status: "ok", timestamp: string, version: string, database: "connected" }
 *
 * Failure (HTTP 503):
 *   { status: "error", timestamp: string, version: string, database: "disconnected", error: string }
 *
 * The endpoint is intentionally unauthenticated so the Azure health probe
 * can reach it without a session cookie.
 */
adminRouter.get("/health", async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const version = process.env.npm_package_version || "unknown";
  try {
    const dbCheck = await pool.query("SELECT 1 AS ok");
    const dbAlive = dbCheck.rows.length > 0 && dbCheck.rows[0].ok === 1;
    if (!dbAlive) {
      return res.status(503).json({
        status: "error",
        timestamp,
        version,
        database: "disconnected",
        error: "Database health check returned unexpected result",
      });
    }
    return res.status(200).json({
      status: "ok",
      timestamp,
      version,
      database: "connected",
    });
  } catch (error: any) {
    return res.status(503).json({
      status: "error",
      timestamp,
      version,
      database: "disconnected",
      error: error?.message || String(error),
    });
  }
});

// Public feature flags endpoint (read-only, any authenticated user)
adminRouter.get("/feature-flags", requireAuth, async (_req: Request, res: Response) => {
  res.json(getFlagStatus());
});

adminRouter.get("/admin/feature-flags", requireRole("GOD"), async (_req: Request, res: Response) => {
  res.json(getFlagStatus());
});

adminRouter.post("/admin/feature-flags", requireRole("GOD"), async (req: Request, res: Response) => {
  const { flag, enabled } = req.body;
  const validFlags = ["closeDay", "riskCreation", "exportGeneration", "aiProcessing", "safetyTab", "multiTenantOrg"];
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

adminRouter.post("/admin/feature-flags/reset", requireRole("GOD"), async (req: Request, res: Response) => {
  resetFlags();
  const ctx: AuditContext = { ...req.auditCtx! };
  emitAuditEvent(ctx, "system.feature_flag" as AuditAction, {
    targetType: "feature_flag",
    metadata: { action: "reset_all" },
  });
  res.json({ message: "All feature flags reset to defaults", flags: getFlagStatus() });
});

// HIGH-07 FIX: Restrict sweep to GOD role only (destructive system operation)
adminRouter.post("/sweep/run", requireRole("GOD"), async (_req: Request, res: Response) => {
  try {
    const { runSweep, isSweepRunning } = await import("../sweep");
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
adminRouter.post("/bootstrap", async (req: Request, res: Response) => {
  if (process.env.BOOTSTRAP_ENABLED !== "true") {
    return res.status(404).json({ message: "Not found" });
  }
  if (bootstrapUsed) {
    return res.status(410).json({ message: "Bootstrap token already used" });
  }
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) {
    return res.status(404).json({ message: "Not found" });
  }
  const expiresAt = process.env.BOOTSTRAP_EXPIRES_AT;
  if (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.now() > Date.parse(expiresAt)) {
    return res.status(410).json({ message: "Bootstrap token expired" });
  }
  const remoteAddress = req.ip || req.socket.remoteAddress || "";
  const isLocalhost = remoteAddress.includes("127.0.0.1") || remoteAddress === "::1" || remoteAddress.endsWith(":127.0.0.1");
  if (!isLocalhost) {
    return res.status(403).json({ message: "Bootstrap endpoint is restricted to localhost" });
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
      const { db } = await import("../db");
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
      bootstrapUsed = true;
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

    bootstrapUsed = true;
    res.status(201).json({ message: `User ${username} created as ${validRole}`, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error("Bootstrap error:", error);
    res.status(500).json({ message: "Bootstrap failed" });
  }
});

// GOD-only migration trigger endpoint
adminRouter.post("/admin/run-migrations", requireRole("GOD"), async (_req: Request, res: Response) => {
  try {
    const { runMigrations } = await import("../migrate");
    await runMigrations();
    res.json({ message: "Migrations executed successfully" });
  } catch (error: any) {
    console.error("Migration trigger error:", error);
    res.status(500).json({ message: error?.message || "Migration failed" });
  }
});

// GOD-only direct SQL migration for table_citation (fallback)
adminRouter.post("/admin/fix-schema", requireRole("GOD"), async (_req: Request, res: Response) => {
  try {
    await pool.query(`ALTER TABLE "dives" ADD COLUMN IF NOT EXISTS "table_citation" text`);
    res.json({ message: "Schema fix applied: table_citation column added" });
  } catch (error: any) {
    console.error("Schema fix error:", error);
    res.status(500).json({ message: error?.message || "Schema fix failed" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// SEED (Development/Testing Only — blocked in production)
// ──────────────────────────────────────────────────────────────────────────

adminRouter.post("/seed", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Seed endpoint is disabled in production" });
  }
  const seedToken = process.env.DEV_SEED_TOKEN;
  if (!seedToken) {
    return res.status(403).json({ message: "Seed endpoint disabled: DEV_SEED_TOKEN is not configured" });
  }
  if (req.body?.seedToken !== seedToken) {
    return res.status(403).json({ message: "Invalid seed token" });
  }
  try {
    const generatedPasswords: Record<string, string> = {
      god: randomBytes(12).toString("base64url"),
      supervisor: randomBytes(12).toString("base64url"),
      diver: randomBytes(12).toString("base64url"),
    };

    let god = await storage.getUserByUsername("spittman@precisionsubsea.com");
    if (!god) {
      god = await storage.getUserByUsername("god");
    }
    if (!god) {
      god = await storage.createUser({
        username: "spittman@precisionsubsea.com",
        password: hashPassword(generatedPasswords.god),
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
        password: hashPassword(generatedPasswords.supervisor),
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
        password: hashPassword(generatedPasswords.diver),
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

    const showPasswords = process.env.DEV_SEED_SHOW_PASSWORDS === "true" && process.env.NODE_ENV === "development";

    if (showPasswords) {
      console.info("[seed] Generated temporary credentials:", {
        god: generatedPasswords.god,
        supervisor: generatedPasswords.supervisor,
        diver: generatedPasswords.diver,
      });
    }

    res.json({
      message: "Seed data created",
      users: { god: god.username, supervisor: supervisor.username, diver: diver.username },
      project: { id: project.id, name: project.name },
      ...(showPasswords ? { temporaryPasswords: generatedPasswords } : {}),
    });
  } catch (error) {
    console.error("Seed error:", error);
    res.status(500).json({ message: "Seed failed" });
  }
});

adminRouter.delete("/projects/:projectId/members/:userId", requireRole("ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  try {
    const removed = await storage.removeProjectMember(p(req.params.projectId), p(req.params.userId));
    if (!removed) return res.status(404).json({ message: "Member not found" });
    res.json({ message: "Member removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove member" });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// ML DATA EXPORT ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

adminRouter.get("/ml-export/stats", requireRole("ADMIN", "GOD"), async (_req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
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

adminRouter.get("/ml-export/conversations", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
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

adminRouter.get("/ml-export/log-training", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
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

adminRouter.get("/ml-export/full-bundle", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
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

adminRouter.delete("/ml-export/purge/project/:projectId", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
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

    const projectId = p(req.params.projectId);
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
      action: "DATA_PURGE" as any,
      correlationId: `purge-${Date.now()}`,
      userId: user.id,
      projectId: null,
      metadata: {
        purgeType: "project",
        projectName: project.name,
        projectId,
        deletedEvents,
        deletedDives,
        deletedRisks,
        deletedDays: dayIds.length,
        mlExportRef: lastFullExport[0].id,
      },
    } as any);

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
adminRouter.delete("/projects/:projectId", requireRole("GOD"), async (req: Request, res: Response) => {
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

adminRouter.delete("/ml-export/purge/conversations", requireRole("GOD"), async (_req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
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
      action: "DATA_PURGE" as any,
      correlationId: `purge-${Date.now()}`,
      userId: user.id,
      projectId: null,
      metadata: {
        purgeType: "conversations",
        deletedConversations: convCount?.value || 0,
        deletedMessages: msgCount?.value || 0,
        mlExportRef: lastFullExport[0].id,
      },
    } as any);

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
