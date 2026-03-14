import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { User, UserRole } from "@shared/schema";
import type { AuditContext } from "../audit";
import { emitAuditEvent } from "../audit";
import { generateRiskId } from "../extraction";

/** Get authenticated user (typed). */
export function getUser(req: Request): User {
  return req.user as User;
}

/** Safely extract a single string from Express 5 headers (string | string[] | undefined). */
export function getHeader(req: Request, name: string): string | undefined {
  const val = req.headers[name];
  return Array.isArray(val) ? val[0] : val;
}

/** Safely extract a single string from Express 5 req.params (string | string[]). */
export function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

/** Safely extract a route param by name as string. */
export function getParam(req: Request, name: string): string {
  const val = req.params[name];
  const str = Array.isArray(val) ? val[0] : val;
  if (!str) throw Object.assign(new Error(`Missing param: ${name}`), { status: 400 });
  return str;
}

/** Safely extract a query param as string. */
export function getQuery(req: Request, name: string): string | undefined {
  const val = req.query[name];
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  return undefined;
}

/** Validate request body against a Zod schema. */
export function validateBody<T>(schema: { parse: (data: unknown) => T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err: any) {
    const message = err.errors ? err.errors.map((e: any) => e.message).join(", ") : "Invalid request body";
    throw Object.assign(new Error(message), { status: 400 });
  }
}

/** Get today's date as YYYY-MM-DD. */
export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/** Check if an error is a unique constraint violation. */
export function isUniqueConstraintError(err: any): boolean {
  const msg = String(err?.message || err?.detail || '');
  return msg.includes('unique') || msg.includes('duplicate key') || msg.includes('23505');
}

/** Generate next sequential risk ID for a given date. */
export async function getNextRiskId(_projectId: string, date: string): Promise<string> {
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

/** Create a risk item with retry on unique constraint collision. */
export async function createRiskWithRetry(riskData: any, projectId: string, date: string, maxRetries = 5, auditCtx?: AuditContext): Promise<any> {
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

/** Auto-compute dive table when sufficient data is available. */
export async function autoComputeDiveTable(diveId: string) {
  const { lookupDiveTable } = await import("@shared/navy-dive-tables");
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
