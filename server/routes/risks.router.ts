import express, { Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { requireDayAccess, requireProjectAccess } from "../authz";
import { isEnabled } from "../feature-flags";
import { emitAuditEvent, sanitizeForAudit, diffFields, type AuditContext } from "../audit";
import { z } from "zod";
import { riskUpdateSchema } from "./_schemas";
import { p, getUser, createRiskWithRetry } from "./_helpers";

export const risksRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// RISK ITEMS
// ──────────────────────────────────────────────────────────────────────────

risksRouter.get("/days/:dayId/risks", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
  const risks = await storage.getRiskItemsByDay(p(req.params.dayId));
  res.json(risks);
});

risksRouter.get("/projects/:projectId/risks", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const risks = await storage.getRiskItemsByProject(p(req.params.projectId));
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

risksRouter.get("/risks/:id", requireAuth, async (req: Request, res: Response) => {
  const risk = await storage.getRiskItem(p(req.params.id));
  if (!risk) return res.status(404).json({ message: "Risk not found" });

  // Include trigger event
  let triggerEvent = null;
  if (risk.triggerEventId) {
    triggerEvent = await storage.getLogEvent(risk.triggerEventId);
  }

  res.json({ ...risk, triggerEvent });
});

risksRouter.post("/risks", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
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

risksRouter.patch("/risks/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const data = riskUpdateSchema.parse(req.body);
    const expectedVersion = req.body.version as number | undefined;

    const risk = await storage.getRiskItem(p(req.params.id));
    if (!risk) return res.status(404).json({ message: "Risk not found" });

    const updated = await storage.updateRiskItem(p(req.params.id), data, expectedVersion);

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
