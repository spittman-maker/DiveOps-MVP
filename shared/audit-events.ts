/**
 * Audit event categories and side-effect contracts.
 *
 * Every state-changing operation in DiveOps must emit an audit event.
 * This file defines the event categories and documents side-effect rules.
 */

/**
 * Audit event categories mapped to the actions they cover.
 * The actual AuditAction union type is defined in shared/schema.ts.
 */
export const AUDIT_CATEGORIES = {
  auth: [
    "auth.login",
    "auth.login_failed",
    "auth.logout",
    "auth.password_change",
  ],
  user: [
    "user.create",
    "user.update",
    "user.delete",
  ],
  project: [
    "project.create",
    "project.update",
    "project.archive",
    "project.member_add",
    "project.member_remove",
  ],
  day: [
    "day.create",
    "day.activate",
    "day.close",
    "day.close_override",
    "day.reopen",
    "day.delete",
  ],
  logEvent: [
    "log_event.create",
    "log_event.update",
    "log_event.delete",
  ],
  dive: [
    "dive.create",
    "dive.update",
    "dive.delete",
    "dive.confirm",
  ],
  risk: [
    "risk.create",
    "risk.update",
  ],
  export: [
    "export.shift_report",
    "export.master_log",
  ],
  admin: [
    "admin.bootstrap",
    "admin.seed",
    "admin.migration",
  ],
  system: [
    "system.feature_flag",
    "system.sweep",
  ],
} as const;

/**
 * Side-effect contracts for operations that trigger external work.
 *
 * Each side effect defines:
 * - trigger:      what causes it
 * - retry:        whether and how to retry on failure
 * - failure:      what happens if it fails
 * - audit:        what audit event is emitted
 * - idempotency:  how duplicate triggers are handled
 */
export const SIDE_EFFECT_CONTRACTS = {
  documentGeneration: {
    trigger: "day.close_and_export or manual export request",
    retry: "no automatic retry — user must re-trigger",
    failure: "day remains closed but export flag not set; error logged with correlation ID",
    audit: "export.shift_report",
    idempotency: "re-export overwrites previous export for same day",
  },
  aiDrafting: {
    trigger: "log_event.create with AI rendering enabled",
    retry: "single retry with exponential backoff",
    failure: "log event saved without AI annotations; canvas line shows raw text",
    audit: "log_event.create (includes ai_annotations field)",
    idempotency: "retry-render endpoint can re-trigger for same event",
  },
  diveTableComputation: {
    trigger: "dive.update when depth/time data changes",
    retry: "no retry — computation is local",
    failure: "dive saved without table data; user can manually trigger compute-table",
    audit: "dive.update (includes table fields)",
    idempotency: "re-computation overwrites previous table data",
  },
  safetyChecklistSeeding: {
    trigger: "POST /api/safety/:projectId/seed-checklists",
    retry: "no automatic retry",
    failure: "partial seed possible; user can retry",
    audit: "safety.checklist.seed",
    idempotency: "skips checklists that already exist for the project",
  },
} as const;
