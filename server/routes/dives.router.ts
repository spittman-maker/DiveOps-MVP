import express, { type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireRole, isGod } from "../auth";
import { requireDayAccess } from "../authz";
import { localHHMMtoUTC } from "../extraction";
import { emitAuditEvent, sanitizeForAudit, type AuditContext } from "../audit";
import { lookupDiveTable } from "@shared/navy-dive-tables";
import { isEnabled } from "../feature-flags";
import { psg } from "../psg-data-layer";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Safely extract a single string from Express 5 req.params (string | string[]). */
function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

function getUser(req: Request): User {
  return req.user as User;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

const diveConfirmSchema = z.object({
  status: z.enum(["confirmed", "flagged"]),
  note: z.string().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Auto-compute dive table when sufficient data is available
// ────────────────────────────────────────────────────────────────────────────

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
// Router
// ────────────────────────────────────────────────────────────────────────────

export const divesRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// DIVES (Derived from LogEvents)
// ──────────────────────────────────────────────────────────────────────────

divesRouter.get("/days/:dayId/dives", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
  const dives = await storage.getDivesByDay(p(req.params.dayId));
  const logEvents = await storage.getLogEventsByDay(p(req.params.dayId));

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

// BUG-09 FIX: POST /api/days/:dayId/dives — Create a new dive
divesRouter.post("/days/:dayId/dives", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireDayAccess(), async (req: Request, res: Response) => {
  try {
    const day = await storage.getDay(p(req.params.dayId));
    if (!day) return res.status(404).json({ message: "Day not found" });
    const existingDives = await storage.getDivesByDay(day.id);
    const nextDiveNumber = existingDives.length + 1;
    const dive = await storage.createDive({
      dayId: day.id,
      projectId: day.projectId,
      diveNumber: nextDiveNumber,
      diverDisplayName: req.body.diverDisplayName || null,
      maxDepthFsw: req.body.maxDepthFsw || null,
      breathingGas: req.body.breathingGas || day.defaultBreathingGas || "Air",
      fo2Percent: req.body.fo2Percent || null,
      lsTime: req.body.lsTime || null,
      rbTime: req.body.rbTime || null,
      lbTime: req.body.lbTime || null,
      rsTime: req.body.rsTime || null,
      tableUsed: req.body.tableUsed || null,
      decompRequired: req.body.decoRequired ? "Y" : "N",
    });
    // PSG Data Layer: forward dive log
    const diveProject = await storage.getProject(day.projectId);
    psg.onDiveLogged(dive, diveProject);
    res.status(201).json(dive);
  } catch (error: any) {
    console.error("Create dive error:", error);
    res.status(500).json({ message: error?.message || "Failed to create dive" });
  }
});

// BUG-09 FIX: GET /api/dives/:id — Get a single dive by ID
divesRouter.get("/dives/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const dive = await storage.getDive(p(req.params.id));
    if (!dive) return res.status(404).json({ message: "Dive not found" });
    // Company isolation
    if (isEnabled("multiTenantOrg") && !isGod(user.role)) {
      const project = await storage.getProject(dive.projectId);
      if (project?.companyId && user.companyId && project.companyId !== user.companyId) {
        return res.status(403).json({ message: "Forbidden: dive belongs to a different company" });
      }
    }
    res.json(dive);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to fetch dive" });
  }
});

divesRouter.get("/users/:userId/dives", requireAuth, async (req: Request, res: Response) => {
  const dives = await storage.getDivesByDiver(p(req.params.userId), req.query.dayId as string);
  res.json(dives);
});

// Update dive PSG-LOG-01 fields (supervisor edit)
divesRouter.patch("/dives/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const dive = await storage.getDive(p(req.params.id));
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
    // BUG-TZ-01 FIX: Fetch day + project timezone once for all time field conversions
    const diveDay = await storage.getDay(dive.dayId);
    const diveProject = diveDay?.projectId ? await storage.getProject(diveDay.projectId) : null;
    const diveTz = diveProject?.timezone || undefined;
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
              // Convert from project local time to UTC using project timezone
              const dayDate = diveDay?.date || new Date().toISOString().slice(0, 10);
              updates[field] = localHHMMtoUTC(hours, minutes, dayDate, diveTz);
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
    const updated = await storage.updateDive(p(req.params.id), updates, expectedVersion);

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
    const finalDive = await storage.getDive(p(req.params.id));
    res.json(finalDive || updated);
  } catch (error: any) {
    if (error?.message?.startsWith("VERSION_CONFLICT")) {
      return res.status(409).json({ message: error.message, code: "VERSION_CONFLICT" });
    }
    console.error("Dive update error:", error);
    res.status(500).json({ message: "Failed to update dive" });
  }
});

// DELETE /api/dives/:id — GOD only
divesRouter.delete("/dives/:id", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const diveId = p(req.params.id);
    const dive = await storage.getDive(diveId);
    if (!dive) return res.status(404).json({ message: "Dive not found" });

    const { pool } = await import("../storage");
    await pool.query(`DELETE FROM "dives" WHERE "id" = $1`, [diveId]);

    emitAuditEvent(req.auditCtx!, "dive.delete", {
      targetId: diveId, targetType: "dive",
      before: sanitizeForAudit(dive),
      after: undefined,
    });

    res.json({ message: "Dive deleted", diveId });
  } catch (error: any) {
    console.error("Delete dive error:", error);
    res.status(500).json({ message: error?.message || "Failed to delete dive" });
  }
});

// Compute dive table/schedule for a dive based on depth & bottom time
divesRouter.post("/dives/:id/compute-table", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const dive = await storage.getDive(p(req.params.id));
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

    const updated = await storage.updateDive(p(req.params.id), updates);
    res.json({ ...updated, _tableResult: result });
  } catch (error) {
    console.error("Compute table error:", error);
    res.status(500).json({ message: "Failed to compute dive table" });
  }
});

// Preview dive table lookup without saving (for real-time display)
divesRouter.post("/dive-table-lookup", requireAuth, async (req: Request, res: Response) => {
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
divesRouter.post("/dives/:id/generate-summary", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const dive = await storage.getDive(p(req.params.id));
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
      const { getAnthropicClient, AI_MODEL } = await import("../ai-client");
      const anthropic = getAnthropicClient();

      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 200,
        system: `You summarize dive tasks for ADCI dive log forms. Create a concise "Task / Work Accomplished" summary from raw log entries for a single diver. Include specific tasks, equipment, and locations. Do NOT calculate dive times or decompression data. Keep it factual and brief (1-3 sentences).`,
        messages: [
          {
            role: "user",
            content: `Diver: ${diverName}\nRaw log entries:\n${rawEntries}\n\nWrite the Task / Work Accomplished summary.`
          }
        ],
      });

      const textBlock = response.content.find((b: any) => b.type === "text") as { type: "text"; text: string } | undefined;
      const summary = textBlock?.text?.trim() || dive.taskSummary || "UNKNOWN";
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
divesRouter.post("/dives/:id/confirm", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = diveConfirmSchema.parse(req.body);
    const user = getUser(req);

    const dive = await storage.getDive(p(req.params.id));
    if (!dive) return res.status(404).json({ message: "Dive not found" });

    // Diver can only confirm their own dives
    if (user.role === "DIVER" && dive.diverId !== user.id) {
      return res.status(403).json({ message: "Cannot confirm another diver's dive" });
    }

    const confirmation = await storage.createDiveConfirmation({
      diveId: p(req.params.id),
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
// DIVE LOG DETAILS
// ──────────────────────────────────────────────────────────────────────────

divesRouter.get("/dives/:diveId/details", requireAuth, async (req: Request, res: Response) => {
  const details = await storage.getDiveLogDetails(p(req.params.diveId));
  if (!details) return res.status(404).json({ message: "Dive log details not found" });
  res.json(details);
});

divesRouter.post("/dives/:diveId/details", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const dive = await storage.getDive(p(req.params.diveId));
  if (!dive) return res.status(404).json({ message: "Dive not found" });

  const existing = await storage.getDiveLogDetails(p(req.params.diveId));
  if (existing) {
    const updated = await storage.updateDiveLogDetails(existing.id, req.body);
    return res.json(updated);
  }

  const details = await storage.createDiveLogDetails({
    ...req.body,
    diveId: p(req.params.diveId),
  });

  res.status(201).json(details);
});

divesRouter.patch("/dive-details/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const updated = await storage.updateDiveLogDetails(p(req.params.id), req.body);
  if (!updated) return res.status(404).json({ message: "Dive log details not found" });
  res.json(updated);
});
