import { z } from "zod";

// ── Auth Schemas ──────────────────────────────────────────────────────────────

/** Public registration — always creates DIVER accounts (MED-01 FIX). */
export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

/** Admin-created users — role is required, 8-char min password. */
export const adminCreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role: z.enum(["GOD", "ADMIN", "SUPERVISOR", "DIVER"]),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

/** System setup — first-time initialization. */
export const setupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Full name is required"),
  initials: z.string().min(1, "Initials are required").max(4),
  email: z.string().email("Valid email required"),
});

// ── Log Event Schemas ─────────────────────────────────────────────────────────

export const logEventSchema = z.object({
  rawText: z.string().min(1),
  dayId: z.string(),
  projectId: z.string().optional(),
  station: z.string().optional(),
  eventTimeOverride: z.string().optional(),
  clientTimezone: z.string().optional(),
});

export const editEventTimeSchema = z.object({
  eventTime: z.string(),
  editReason: z.string().min(1),
});

// ── Dive Schemas ──────────────────────────────────────────────────────────────

export const diveConfirmSchema = z.object({
  status: z.enum(["confirmed", "flagged"]),
  note: z.string().optional(),
});

// ── Risk Schemas ──────────────────────────────────────────────────────────────

export const riskUpdateSchema = z.object({
  description: z.string().optional(),
  status: z.enum(["open", "mitigated", "closed"]).optional(),
  owner: z.string().optional(),
  mitigation: z.string().optional(),
  residualRisk: z.string().optional(),
  closureAuthority: z.string().optional(),
  editReason: z.string().min(1),
});

// ── Analytics Schemas ─────────────────────────────────────────────────────────

export const analyticsComputeSchema = z.object({
  projectId: z.string().min(1),
  dayId: z.string().min(1),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const anomalyUpdateSchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved", "false_positive"]),
  resolvedBy: z.string().optional(),
});

export const snapshotTriggerSchema = z.object({
  dayId: z.string().min(1),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const anomalyDetectSchema = z.object({
  dayId: z.string().min(1),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lookbackDays: z.number().int().min(3).max(90).optional(),
});

export const predictionGenerateSchema = z.object({
  predictionType: z.enum(["risk", "delay", "crew_utilization"]).optional().default("risk"),
});
