import express, { Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, canWriteLogEvents, isGod } from "../auth";
import { requireProjectAccess, requireDayAccess } from "../authz";
import { emitAuditEvent, sanitizeForAudit, type AuditContext } from "../audit";
import type { AuditAction } from "@shared/schema";
import { generateShiftExport, snapshotExportData, generateShiftExportFromSnapshot } from "../document-export";
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

function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export const daysRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// DAYS
// ──────────────────────────────────────────────────────────────────────────

daysRouter.get("/projects/:projectId/days", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  try {
    // HIGH-08 FIX: Validate project exists before querying days
    const project = await storage.getProject(p(req.params.projectId));
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get ALL days/shifts for the project, ordered by most recent first
    const days = await storage.getDaysByProject(p(req.params.projectId));

    // If no days exist and user can write, create one for today
    if (days.length === 0) {
      const user = getUser(req);
      if (canWriteLogEvents(user.role)) {
        const today = getTodayDate();
        const day = await storage.createDay({
          projectId: p(req.params.projectId),
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

daysRouter.get("/days/:id", requireAuth, async (req: Request, res: Response) => {
  const day = await storage.getDay(p(req.params.id));
  if (!day) return res.status(404).json({ message: "Day not found" });
  // BUG-ISO-02 FIX: Enforce company boundary on direct day access
  if (isEnabled("multiTenantOrg")) {
    const user = getUser(req);
    if (!isGod(user.role)) {
      const project = await storage.getProject(day.projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }
  }
  res.json(day);
});

daysRouter.post("/projects/:projectId/days", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const date = req.body.date || getTodayDate();

    // BUG-1 FIX: Prevent duplicate open shifts.
    // Only allow creating a new shift if ALL existing shifts for this date are CLOSED.
    const existingDays = await storage.getDaysByProject(p(req.params.projectId));
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
    const shiftCount = await storage.getShiftCountForDate(p(req.params.projectId), date);
    const shiftNumber = String(shiftCount + 1);

    const day = await storage.createDay({
      projectId: p(req.params.projectId),
      date,
      shift: shiftNumber,
      status: "DRAFT",
      createdBy: user.id,
    });
    // PSG Data Layer: forward day opened
    const dayProject = await storage.getProject(p(req.params.projectId));
    psg.onDayOpened(day, dayProject);
    res.status(201).json(day);
  } catch (error: any) {
    console.error("Create day error:", error);
    res.status(500).json({ message: error?.message || "Failed to create new day" });
  }
});

daysRouter.patch("/days/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const day = await storage.getDay(p(req.params.id));
  if (!day) return res.status(404).json({ message: "Day not found" });

  // Check if day is closed
  if (day.status === "CLOSED") {
    const user = getUser(req);
    if (!isGod(user.role)) {
      return res.status(403).json({ message: "Day is closed. Only GOD can edit." });
    }
  }

  const updated = await storage.updateDay(p(req.params.id), req.body);
  res.json(updated);
});

 // DELETE /api/days/:id — GOD only, cascade-deletes dives and log events
daysRouter.delete("/days/:id", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const dayId = p(req.params.id);
    const day = await storage.getDay(dayId);
    if (!day) return res.status(404).json({ message: "Day not found" });

    // Cascade: nullify audit events, then delete log events, dives, and the day itself
    const { pool } = await import("../storage");
    await pool.query(`UPDATE "audit_events" SET "day_id" = NULL WHERE "day_id" = $1`, [dayId]);
    await pool.query(`DELETE FROM "log_events" WHERE "day_id" = $1`, [dayId]);
    await pool.query(`DELETE FROM "dives" WHERE "day_id" = $1`, [dayId]);
    await pool.query(`DELETE FROM "days" WHERE "id" = $1`, [dayId]);

    const user = getUser(req);
    emitAuditEvent(req.auditCtx!, "day.delete", {
      targetId: dayId, targetType: "day",
      before: sanitizeForAudit(day),
      after: undefined,
    });

    res.json({ message: "Day and all associated dives and log events deleted", dayId });
  } catch (error: any) {
    console.error("Delete day error:", error);
    res.status(500).json({ message: error?.message || "Failed to delete day" });
  }
});

daysRouter.patch("/days/:id/breathing-gas", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const day = await storage.getDay(p(req.params.id));
  if (!day) return res.status(404).json({ message: "Day not found" });
  if (day.status === "CLOSED") {
    const user = getUser(req);
    if (!isGod(user.role)) {
      return res.status(403).json({ message: "Day is closed. Only GOD can edit." });
    }
  }

  const { breathingGas, fo2Percent } = req.body;
  const updated = await storage.updateDay(p(req.params.id), {
    defaultBreathingGas: breathingGas || null,
    defaultFo2Percent: fo2Percent != null ? fo2Percent : null,
  } as any);

  const dives = await storage.getDivesByDay(p(req.params.id));
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

daysRouter.get("/days/:id/compliance", requireAuth, async (req: Request, res: Response) => {
  const day = await storage.getDay(p(req.params.id));
  if (!day) return res.status(404).json({ message: "Day not found" });
  // BUG-03 FIX: Enforce company boundary on compliance endpoint
  if (isEnabled("multiTenantOrg")) {
    const user = getUser(req);
    if (!isGod(user.role)) {
      const project = await storage.getProject(day.projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }
  }

  const dives = await storage.getDivesByDay(p(req.params.id));
  const events = await storage.getLogEventsByDay(p(req.params.id));

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

daysRouter.post("/days/:id/close", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  if (!isEnabled("closeDay")) {
    return res.status(503).json({ message: "Close Day is currently disabled by operations team", code: "FEATURE_DISABLED" });
  }

  const user = getUser(req);
  const closeoutData = req.body?.closeoutData || undefined;
  const forceClose = req.body?.forceClose === true;

  if (!forceClose) {
    const gaps = await evaluateComplianceGaps(p(req.params.id));
    if (gaps.length > 0) {
      return res.status(422).json({
        message: "Compliance gaps detected — review before closing",
        gaps,
        canForceClose: isGod(user.role) || user.role === "ADMIN",
      });
    }
  }

  const beforeDay = await storage.getDay(p(req.params.id));
  const day = await storage.closeDay(p(req.params.id), user.id, closeoutData);
  if (!day) return res.status(404).json({ message: "Day not found" });

  const ctx: AuditContext = { ...req.auditCtx!, projectId: day.projectId, dayId: day.id };
  emitAuditEvent(ctx, forceClose ? "day.close_override" : "day.close", {
    targetId: day.id, targetType: "day",
    before: { status: beforeDay?.status }, after: { status: "CLOSED", closedBy: user.id },
    metadata: forceClose ? { forceClose: true } : undefined,
  });
  // PSG Data Layer: forward day closed
  const closedProject = await storage.getProject(day.projectId);
  psg.onDayClosed(day, closedProject, closeoutData);
  res.json(day);
});

daysRouter.post("/days/:id/close-and-export", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  if (!isEnabled("closeDay")) {
    return res.status(503).json({ message: "Close Day is currently disabled by operations team", code: "FEATURE_DISABLED" });
  }
  if (!isEnabled("exportGeneration")) {
    return res.status(503).json({ message: "Export generation is currently disabled by operations team", code: "FEATURE_DISABLED" });
  }

  const user = getUser(req);
  const dayId = p(req.params.id);
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

    // Surface validation results to the client so supervisors see warnings
    if (exportResult.validation && !exportResult.validation.valid) {
      console.warn(`[close-day] Closing day ${dayId} with ${exportResult.validation.criticalErrors.length} critical validation errors`);
    }

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
      metadata: { withExport: true, fileCount: result.exportedFiles.length, transactional: true,
        validationPassed: exportResult.validation?.valid ?? true,
        criticalErrors: exportResult.validation?.criticalErrors?.length ?? 0,
      },
    });

    res.json({ ...result, validation: exportResult.validation });
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

daysRouter.post("/days/:id/reopen", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
  const user = getUser(req);
  const day = await storage.getDay(p(req.params.id));
  if (!day) return res.status(404).json({ message: "Day not found" });
  if (day.status !== "CLOSED") return res.status(400).json({ message: "Day is not closed" });

  const reopened = await storage.reopenDay(p(req.params.id));
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
  const tz = project?.timezone;
  let timeStr: string;
  if (tz) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    timeStr = `${parts.find(p => p.type === 'hour')?.value || '00'}:${parts.find(p => p.type === 'minute')?.value || '00'}`;
  } else {
    timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
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
daysRouter.get("/days/:id/status", requireAuth, async (req: Request, res: Response) => {
  const day = await storage.getDay(p(req.params.id));
  if (!day) return res.status(404).json({ message: "Day not found" });

  const today = getTodayDate();
  const isPastMidnight = day.date !== today;

  res.json({
    ...day,
    isPastMidnight,
    requiresConfirmation: isPastMidnight && day.status !== "CLOSED",
  });
});
