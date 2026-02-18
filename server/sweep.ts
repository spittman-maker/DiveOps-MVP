import { storage } from "./storage";
import { extractData, classifyEvent, fixTypos } from "./extraction";
import { generateAIRenders } from "./ai-drafting";
import { lookupDiveTable } from "@shared/navy-dive-tables";

const SWEEP_INTERVAL_MS = 30 * 60 * 1000;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let sweepRunning = false;

export interface SweepResult {
  startedAt: Date;
  finishedAt: Date;
  daysProcessed: number;
  divesFixed: number;
  tablesComputed: number;
  namesUpdated: number;
  aiReprocessed: number;
  errors: string[];
}

async function sweepDay(dayId: string, projectId: string, errors: string[]): Promise<{
  divesFixed: number;
  tablesComputed: number;
  namesUpdated: number;
  aiReprocessed: number;
}> {
  let divesFixed = 0;
  let tablesComputed = 0;
  let namesUpdated = 0;
  let aiReprocessed = 0;

  try {
    const day = await storage.getDay(dayId);
    if (!day) return { divesFixed, tablesComputed, namesUpdated, aiReprocessed };

    const dives = await storage.getDivesByDay(dayId);
    const events = await storage.getLogEventsByDay(dayId);
    const roster = await storage.getDiverRosterByProject(projectId);
    const rosterMap = new Map(roster.map(r => [r.initials, r.fullName]));

    // 1. Fix diver display names from roster
    for (const dive of dives) {
      const displayName = dive.diverDisplayName?.trim() || "";
      if (displayName.length <= 3 && displayName.length >= 2) {
        const rosterName = rosterMap.get(displayName.toUpperCase());
        if (rosterName) {
          await storage.updateDive(dive.id, { diverDisplayName: rosterName });
          namesUpdated++;
        }
      }
    }

    // 2. Compute missing dive tables
    const freshDives = await storage.getDivesByDay(dayId);
    for (const d of freshDives) {
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
              eadFsw: result.eadFsw ?? null,
              tableUsed: result.tableUsed,
              scheduleUsed: result.scheduleUsed,
              repetitiveGroup: result.repetitiveGroup,
              decompRequired: result.decompRequired,
              decompStops: result.decompStops,
            });
            tablesComputed++;
          } catch (err) {
            errors.push(`Table compute failed for dive ${d.id}: ${err}`);
          }
        }
      }
    }

    // 3. Check for stop-work events and set R/S on active dives
    const stopWorkEvents = events.filter(e => {
      const ej = e.extractedJson as any;
      return ej?.stopWork === true;
    });
    for (const swe of stopWorkEvents) {
      const allDives = await storage.getDivesByDay(dayId);
      const eventTime = swe.eventTime || swe.captureTime;
      const activeDives = allDives.filter(d => {
        if (!d.lsTime || d.rsTime) return false;
        const lsMs = new Date(d.lsTime).getTime();
        const sweMs = new Date(eventTime).getTime();
        return lsMs < sweMs && (!swe.station || !d.station || d.station === swe.station);
      });
      for (const ad of activeDives) {
        await storage.updateDiveTimes(ad.id, 'rsTime', eventTime);
        divesFixed++;
      }
    }

    // 4. AI re-processing: find log events missing renders or with failed status
    for (const event of events) {
      try {
        const existingRenders = await storage.getLogRendersByEvent(event.id);
        const masterOk = existingRenders.some(r => r.renderType === "master_log_line" && r.status === "ok");
        const internalOk = existingRenders.some(r => r.renderType === "internal_canvas_line" && r.status === "ok");
        
        if (masterOk && internalOk) continue;

        const category = classifyEvent(event.rawText);
        const eventTime = event.eventTime || event.captureTime;
        const renders = await generateAIRenders(event.rawText, new Date(eventTime), category);

        if (!internalOk) {
          await storage.upsertLogRender(event.id, "internal_canvas_line", {
            renderText: renders.internalCanvasLine,
            section: renders.section,
            model: renders.model,
            promptVersion: renders.promptVersion,
            status: renders.status,
          });
        }

        if (!masterOk) {
          await storage.upsertLogRender(event.id, "master_log_line", {
            renderText: renders.masterLogLine,
            section: renders.section,
            model: renders.model,
            promptVersion: renders.promptVersion,
            status: renders.status,
          });
        }

        if (renders.annotations) {
          await storage.updateLogEvent(event.id, { aiAnnotations: renders.annotations });
        }

        aiReprocessed++;
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        errors.push(`AI reprocess failed for event ${event.id}: ${err}`);
      }
    }

    // 5. Re-check annotations for events that have stale ones
    const annotatedEvents = events.filter(e => {
      const anns = (e.aiAnnotations || []) as Array<{ type: string; message: string }>;
      return anns.some(a => a.message.includes("Dive event without diver name"));
    });
    for (const event of annotatedEvents) {
      const extracted = extractData(event.rawText);
      const hasDiveOp = extracted.diveOperation === "ls" || extracted.diveOperation === "rb";
      const hasDiver = (extracted.diverNames && extracted.diverNames.length > 0) ||
                       (extracted.diverInitials && extracted.diverInitials.length > 0);
      if (!hasDiveOp || hasDiver) {
        const anns = ((event.aiAnnotations || []) as Array<{ type: string; message: string }>)
          .filter(a => !a.message.includes("Dive event without diver name"));
        await storage.updateLogEvent(event.id, { aiAnnotations: anns });
        divesFixed++;
      }
    }

  } catch (err) {
    errors.push(`Day ${dayId} sweep error: ${err}`);
  }

  return { divesFixed, tablesComputed, namesUpdated, aiReprocessed };
}

export async function runSweep(): Promise<SweepResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let daysProcessed = 0;
  let totalDivesFixed = 0;
  let totalTablesComputed = 0;
  let totalNamesUpdated = 0;
  let totalAiReprocessed = 0;

  try {
    const projects = await storage.getAllProjects();

    for (const project of projects) {
      const day = await storage.getMostRecentDayByProject(project.id);
      if (!day) continue;
      if (day.status !== "ACTIVE") continue;

      daysProcessed++;
      const result = await sweepDay(day.id, project.id, errors);
      totalDivesFixed += result.divesFixed;
      totalTablesComputed += result.tablesComputed;
      totalNamesUpdated += result.namesUpdated;
      totalAiReprocessed += result.aiReprocessed;
    }
  } catch (err) {
    errors.push(`Sweep error: ${err}`);
  }

  const finishedAt = new Date();
  const durationSec = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`[SWEEP] Completed in ${durationSec}s — ${daysProcessed} days, ${totalDivesFixed} dives fixed, ${totalTablesComputed} tables computed, ${totalNamesUpdated} names updated, ${totalAiReprocessed} AI reprocessed, ${errors.length} errors`);

  return {
    startedAt,
    finishedAt,
    daysProcessed,
    divesFixed: totalDivesFixed,
    tablesComputed: totalTablesComputed,
    namesUpdated: totalNamesUpdated,
    aiReprocessed: totalAiReprocessed,
    errors,
  };
}

export function startPeriodicSweep(): void {
  if (sweepTimer) return;
  console.log(`[SWEEP] Starting periodic sweep every ${SWEEP_INTERVAL_MS / 60000} minutes`);
  sweepTimer = setInterval(async () => {
    if (sweepRunning) {
      console.log("[SWEEP] Previous sweep still running, skipping");
      return;
    }
    sweepRunning = true;
    try {
      await runSweep();
    } catch (err) {
      console.error("[SWEEP] Unhandled error:", err);
    } finally {
      sweepRunning = false;
    }
  }, SWEEP_INTERVAL_MS);

  setTimeout(async () => {
    if (sweepRunning) return;
    sweepRunning = true;
    try {
      console.log("[SWEEP] Running initial sweep on startup (60s delay)...");
      await runSweep();
    } catch (err) {
      console.error("[SWEEP] Initial sweep error:", err);
    } finally {
      sweepRunning = false;
    }
  }, 60000);
}

export function stopPeriodicSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
    console.log("[SWEEP] Periodic sweep stopped");
  }
}

export function isSweepRunning(): boolean {
  return sweepRunning;
}
