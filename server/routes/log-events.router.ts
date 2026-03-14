import express, { type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../storage";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { User } from "@shared/schema";
import { requireAuth, requireRole, isGod } from "../auth";
import { requireDayAccess } from "../authz";
import { classifyEvent, extractData, parseEventTime, detectDirectiveTag, hasRiskKeywords, isStopWork, detectHazards, generateRiskId } from "../extraction";
import { processStructuredLog } from "../logging";
import { generateAIRenders, type SOPContext } from "../ai-drafting";
import { lookupDiveTable } from "@shared/navy-dive-tables";
import { emitAuditEvent, type AuditContext } from "../audit";
import { isEnabled } from "../feature-flags";
import { psg } from "../psg-data-layer";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

/** Safely extract a single string from Express 5 req.params (string | string[]). */
function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

/** Safely extract a single string from Express 5 headers (string | string[] | undefined). */
function getHeader(req: Request, name: string): string | undefined {
  const val = req.headers[name];
  return Array.isArray(val) ? val[0] : val;
}

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

// Auto-compute dive table when sufficient data is available (module-scoped for reuse)
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
    const result = lookupDiveTable(d.maxDepthFsw, bottomTimeMinutes, breathingGas.toLowerCase() as "air" | "nitrox", fo2 ?? undefined);
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

// ────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────────────────────

export const logEventsRouter = express.Router();

// Validate log entry before submission (returns validation result without persisting)
// Supports batch entries (slash-delimited or multi-line)
logEventsRouter.post("/log-events/validate", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
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
logEventsRouter.post("/log-events", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const data = logEventSchema.parse(req.body);
    const user = getUser(req);

    // Get day for date context and derive projectId if not provided
    const day = await storage.getDay(data.dayId);
    if (!day) return res.status(404).json({ message: "Day not found" });
    const projectId = data.projectId || day.projectId;
    if (!projectId) return res.status(400).json({ message: "Could not determine projectId" });

    // Fetch project for company isolation check AND timezone
    const project = await storage.getProject(projectId);
    // BUG-ISO-03 FIX: Enforce company boundary on log-event writes
    if (isEnabled("multiTenantOrg") && !isGod(user.role)) {
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
      }
    }
    // Check if day is closed
    if (day.status === "CLOSED" && !isGod(user.role)) {
      return res.status(403).json({ message: "Day is closed" });
    }
    // Project timezone for local-time → UTC conversion (BUG-TZ-01 FIX)
    const projectTimezone = project?.timezone || undefined;

    // Determine event time
    const captureTime = new Date();
    let eventTime: Date;

    if (data.eventTimeOverride) {
      const override = new Date(data.eventTimeOverride);
      if (isNaN(override.getTime()) || override.getFullYear() < 2000 || override.getFullYear() > 2100) {
        return res.status(400).json({ message: "Invalid eventTimeOverride — must be a valid ISO date" });
      }
      eventTime = override;
    } else {
      // Try to parse HHMM from raw text — supervisor's entered time is law
      // Pass project timezone so "0705" in Pacific/Honolulu => 17:05 UTC
      const parsedTime = parseEventTime(data.rawText, day.date, projectTimezone);
      if (parsedTime) {
        eventTime = parsedTime;
      } else if (data.clientTimezone) {
        // No explicit time entered — use server capture time (real UTC)
        // The display layer uses browser-local getHours() for formatting
        eventTime = captureTime;
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
      return generateAIRenders(data.rawText, eventTime, category, sopCtx, projectTimezone);
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

    // If text contains risk keywords (and wasn't already captured as safety/directive/stop-work), create risk item(s)
    if (category !== "safety" && category !== "directive" && !stopWork && hasRiskKeywords(data.rawText)) {
      try {
        // Check if this is a multi-risk entry (e.g., "risks are X, Y, Z" or "risks include A, B, C")
        const multiRiskMatch = data.rawText.match(/^risks?\s+(?:are|include|is)\s+(.+)/i);
        if (multiRiskMatch) {
          const riskItems = multiRiskMatch[1].split(/,\s*(?:and\s+)?/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          for (const riskDesc of riskItems) {
            await createRiskWithRetry({
              dayId: day.id,
              projectId: projectId,
              triggerEventId: logEvent.id,
              category: "operational",
              source: "supervisor_entry",
              description: riskDesc,
              status: "open",
            }, projectId, day.date, 3, ctx);
          }
        } else {
          // Single risk entry
          await createRiskWithRetry({
            dayId: day.id,
            projectId: projectId,
            triggerEventId: logEvent.id,
            category: "operational",
            source: "supervisor_entry",
            description: data.rawText,
            status: "open",
          }, projectId, day.date, 3, ctx);
        }
      } catch (e: any) {
        console.error("Failed to create keyword risk after retries:", e);
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

    // PSG Data Layer: forward log event
    psg.onLogEventCreated(logEvent, project, day);

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
logEventsRouter.post("/days/:dayId/re-extract-dives", requireRole("ADMIN", "GOD"), requireDayAccess(), async (req: Request, res: Response) => {
  try {
    const dayId = p(req.params.dayId);
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
            const result = lookupDiveTable(d.maxDepthFsw, btMin, d.breathingGas.toLowerCase() as "air" | "nitrox", fo2 ?? undefined);
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
logEventsRouter.get("/days/:dayId/log-events", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
  const events = await storage.getLogEventsByDay(p(req.params.dayId));

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
logEventsRouter.patch("/log-events/:id/event-time", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const data = editEventTimeSchema.parse(req.body);

    const event = await storage.getLogEvent(p(req.params.id));
    if (!event) return res.status(404).json({ message: "Log event not found" });

    // Check if day is closed
    const day = await storage.getDay(event.dayId);
    if (day?.status === "CLOSED") {
      const user = getUser(req);
      if (!isGod(user.role)) {
        return res.status(403).json({ message: "Day is closed" });
      }
    }

    const updated = await storage.updateLogEvent(p(req.params.id), {
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
logEventsRouter.patch("/log-events/:id/depth", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const { depthFsw } = req.body;
    const depth = parseInt(depthFsw, 10);
    if (isNaN(depth) || depth <= 0) {
      return res.status(400).json({ message: "Valid depth (FSW) is required" });
    }

    const event = await storage.getLogEvent(p(req.params.id));
    if (!event) return res.status(404).json({ message: "Log event not found" });

    const extracted = (event.extractedJson || {}) as Record<string, any>;
    extracted.depthFsw = depth;

    const annotations = (event.aiAnnotations || []) as Array<{ type: string; message: string }>;
    const filteredAnnotations = annotations.filter(
      a => !a.message.includes("no depth (FSW) specified")
    );

    await storage.updateLogEvent(p(req.params.id), {
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

    const updated = await storage.getLogEvent(p(req.params.id));
    res.json(updated);
  } catch (error) {
    console.error("Depth update error:", error);
    res.status(500).json({ message: "Failed to update depth" });
  }
});

logEventsRouter.patch("/log-events/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const { rawText, editReason, version: expectedVersion } = req.body;
    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ message: "rawText is required" });
    }

    const event = await storage.getLogEvent(p(req.params.id));
    if (!event) return res.status(404).json({ message: "Log event not found" });

    const day = await storage.getDay(event.dayId);
    if (day?.status === "CLOSED") {
      const user = getUser(req);
      if (!isGod(user.role)) {
        return res.status(403).json({ message: "Day is closed" });
      }
    }

    const updated = await storage.updateLogEvent(p(req.params.id), {
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
logEventsRouter.post("/log-events/:id/retry-render", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const event = await storage.getLogEvent(p(req.params.id));
  if (!event) return res.status(404).json({ message: "Log event not found" });

  try {
    const sops = event.projectId ? await storage.getActiveProjectSops(event.projectId) : [];
    const sopCtx: SOPContext[] = sops.map(s => ({ title: s.title, content: s.content }));
    const project = event.projectId ? await storage.getProject(event.projectId) : null;
    const projectTimezone = project?.timezone || undefined;
    const renders = await generateAIRenders(
      event.rawText,
      new Date(event.eventTime),
      event.category as any,
      sopCtx,
      projectTimezone
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
