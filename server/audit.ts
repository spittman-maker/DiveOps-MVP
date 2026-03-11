import { db } from "./storage";
import * as schema from "@shared/schema";
import type { AuditAction, UserRole } from "@shared/schema";
import crypto from "crypto";

export function generateCorrelationId(): string {
  return `cid-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export interface AuditContext {
  correlationId: string;
  userId?: string;
  userRole?: UserRole;
  companyId?: string;
  projectId?: string;
  dayId?: string;
  ipAddress?: string;
}

export async function emitAuditEvent(
  ctx: AuditContext,
  action: AuditAction,
  opts: {
    targetId?: string;
    targetType?: string;
    before?: Record<string, any>;
    after?: Record<string, any>;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  try {
    await db.insert(schema.auditEvents).values({
      correlationId: ctx.correlationId,
      action,
      userId: ctx.userId || null,
      userRole: ctx.userRole || null,
      companyId: ctx.companyId || null,
      projectId: ctx.projectId || null,
      dayId: ctx.dayId || null,
      targetId: opts.targetId || null,
      targetType: opts.targetType || null,
      before: opts.before || null,
      after: opts.after || null,
      metadata: opts.metadata || null,
      ipAddress: ctx.ipAddress || null,
    } as any);
  } catch (err) {
    console.error("[AUDIT] Failed to emit audit event:", action, err);
  }
}

export function sanitizeForAudit(obj: any): Record<string, any> {
  if (!obj) return {};
  const safe = { ...obj };
  delete safe.password;
  delete safe.fileData;
  if (safe.extractedJson && typeof safe.extractedJson === "object") {
    safe.extractedJson = "[present]";
  }
  if (safe.structuredPayload && typeof safe.structuredPayload === "object") {
    safe.structuredPayload = "[present]";
  }
  return safe;
}

export function diffFields(before: Record<string, any>, after: Record<string, any>): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (key === "updatedAt" || key === "version") continue;
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }
  return diff;
}
