/**
 * State machine types and transition validation functions for DiveOps entities.
 *
 * These enums and validators mirror the actual status fields defined in schema.ts
 * and safety-schema.ts, and the transition logic implemented in the route handlers.
 */

import type { UserRole } from "./schema";

// ────────────────────────────────────────────────────────────────────────────
// State Enums
// ────────────────────────────────────────────────────────────────────────────

export enum DayState {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
}

export enum ProjectDivePlanState {
  Draft = "Draft",
  Submitted = "Submitted",
  Approved = "Approved",
  Superseded = "Superseded",
}

export enum DivePlanState {
  Draft = "Draft",
  Active = "Active",
  Closed = "Closed",
}

export enum RiskState {
  Open = "open",
  Mitigated = "mitigated",
  Closed = "closed",
}

export enum DiveConfirmationState {
  Confirmed = "confirmed",
  Flagged = "flagged",
}

export enum ChecklistCompletionState {
  InProgress = "in_progress",
  Completed = "completed",
  CompletedWithIssues = "completed_with_issues",
}

export enum JhaState {
  Draft = "draft",
  PendingReview = "pending_review",
  Approved = "approved",
  Superseded = "superseded",
}

export enum SafetyMeetingState {
  Draft = "draft",
  InProgress = "in_progress",
  Completed = "completed",
}

export enum NearMissState {
  Reported = "reported",
  UnderReview = "under_review",
  Resolved = "resolved",
  Closed = "closed",
}

export enum AnomalyState {
  Open = "open",
  Acknowledged = "acknowledged",
  Resolved = "resolved",
  FalsePositive = "false_positive",
}

export enum DirectoryEntryState {
  NeedsVerification = "NEEDS_VERIFICATION",
  Verified = "VERIFIED",
}

// ────────────────────────────────────────────────────────────────────────────
// State Machine Config Types
// ────────────────────────────────────────────────────────────────────────────

export interface StateTransition<S extends string> {
  from: S;
  to: S;
  /** Roles allowed to perform this transition. Empty array = system-only. */
  allowedRoles: UserRole[];
  /** Description of what this transition represents. */
  label: string;
}

export interface StateMachineConfig<S extends string> {
  /** All valid states for this entity. */
  states: readonly S[];
  /** The initial state when the entity is created. */
  initialState: S;
  /** All allowed transitions. */
  transitions: StateTransition<S>[];
}

// ────────────────────────────────────────────────────────────────────────────
// Role Helpers
// ────────────────────────────────────────────────────────────────────────────

const SUPERVISOR_AND_ABOVE: UserRole[] = ["SUPERVISOR", "ADMIN", "GOD"];
const ADMIN_AND_ABOVE: UserRole[] = ["ADMIN", "GOD"];
const GOD_ONLY: UserRole[] = ["GOD"];

// ────────────────────────────────────────────────────────────────────────────
// State Machine Definitions
// ────────────────────────────────────────────────────────────────────────────

export const dayStateMachine: StateMachineConfig<DayState> = {
  states: [DayState.DRAFT, DayState.ACTIVE, DayState.CLOSED],
  initialState: DayState.DRAFT,
  transitions: [
    { from: DayState.DRAFT, to: DayState.ACTIVE, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Activate shift" },
    { from: DayState.DRAFT, to: DayState.CLOSED, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Close shift" },
    { from: DayState.ACTIVE, to: DayState.CLOSED, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Close shift" },
    { from: DayState.CLOSED, to: DayState.ACTIVE, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Reopen shift" },
  ],
};

export const projectDivePlanStateMachine: StateMachineConfig<ProjectDivePlanState> = {
  states: [ProjectDivePlanState.Draft, ProjectDivePlanState.Submitted, ProjectDivePlanState.Approved, ProjectDivePlanState.Superseded],
  initialState: ProjectDivePlanState.Draft,
  transitions: [
    { from: ProjectDivePlanState.Draft, to: ProjectDivePlanState.Submitted, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Submit for approval" },
    { from: ProjectDivePlanState.Submitted, to: ProjectDivePlanState.Approved, allowedRoles: ADMIN_AND_ABOVE, label: "Approve plan" },
    { from: ProjectDivePlanState.Approved, to: ProjectDivePlanState.Superseded, allowedRoles: [], label: "Superseded by newer revision (system)" },
  ],
};

export const divePlanStateMachine: StateMachineConfig<DivePlanState> = {
  states: [DivePlanState.Draft, DivePlanState.Active, DivePlanState.Closed],
  initialState: DivePlanState.Draft,
  transitions: [
    { from: DivePlanState.Draft, to: DivePlanState.Active, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Activate plan" },
    { from: DivePlanState.Draft, to: DivePlanState.Closed, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Close plan" },
    { from: DivePlanState.Active, to: DivePlanState.Closed, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Close plan" },
    { from: DivePlanState.Closed, to: DivePlanState.Draft, allowedRoles: ADMIN_AND_ABOVE, label: "Reopen plan (new version)" },
  ],
};

export const riskStateMachine: StateMachineConfig<RiskState> = {
  states: [RiskState.Open, RiskState.Mitigated, RiskState.Closed],
  initialState: RiskState.Open,
  transitions: [
    { from: RiskState.Open, to: RiskState.Mitigated, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Apply mitigation" },
    { from: RiskState.Open, to: RiskState.Closed, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Close risk" },
    { from: RiskState.Mitigated, to: RiskState.Closed, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Close risk" },
  ],
};

export const jhaStateMachine: StateMachineConfig<JhaState> = {
  states: [JhaState.Draft, JhaState.PendingReview, JhaState.Approved, JhaState.Superseded],
  initialState: JhaState.Draft,
  transitions: [
    { from: JhaState.Draft, to: JhaState.PendingReview, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Submit for review" },
    { from: JhaState.PendingReview, to: JhaState.Approved, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Approve JHA" },
    { from: JhaState.Approved, to: JhaState.Superseded, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Supersede with new version" },
  ],
};

export const safetyMeetingStateMachine: StateMachineConfig<SafetyMeetingState> = {
  states: [SafetyMeetingState.Draft, SafetyMeetingState.InProgress, SafetyMeetingState.Completed],
  initialState: SafetyMeetingState.Draft,
  transitions: [
    { from: SafetyMeetingState.Draft, to: SafetyMeetingState.InProgress, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Start meeting" },
    { from: SafetyMeetingState.InProgress, to: SafetyMeetingState.Completed, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Complete meeting" },
  ],
};

export const nearMissStateMachine: StateMachineConfig<NearMissState> = {
  states: [NearMissState.Reported, NearMissState.UnderReview, NearMissState.Resolved, NearMissState.Closed],
  initialState: NearMissState.Reported,
  transitions: [
    { from: NearMissState.Reported, to: NearMissState.UnderReview, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Begin review" },
    { from: NearMissState.UnderReview, to: NearMissState.Resolved, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Mark resolved" },
    { from: NearMissState.Resolved, to: NearMissState.Closed, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Close report" },
  ],
};

export const anomalyStateMachine: StateMachineConfig<AnomalyState> = {
  states: [AnomalyState.Open, AnomalyState.Acknowledged, AnomalyState.Resolved, AnomalyState.FalsePositive],
  initialState: AnomalyState.Open,
  transitions: [
    { from: AnomalyState.Open, to: AnomalyState.Acknowledged, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Acknowledge anomaly" },
    { from: AnomalyState.Open, to: AnomalyState.FalsePositive, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Dismiss as false positive" },
    { from: AnomalyState.Acknowledged, to: AnomalyState.Resolved, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Resolve anomaly" },
    { from: AnomalyState.Acknowledged, to: AnomalyState.FalsePositive, allowedRoles: SUPERVISOR_AND_ABOVE, label: "Dismiss as false positive" },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Transition Validation Functions
// ────────────────────────────────────────────────────────────────────────────

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Generic transition validator that works with any state machine config.
 */
function validateTransition<S extends string>(
  config: StateMachineConfig<S>,
  from: S,
  to: S,
  userRole: UserRole,
): TransitionResult {
  if (from === to) {
    return { allowed: false, reason: "No state change" };
  }

  const transition = config.transitions.find((t) => t.from === from && t.to === to);

  if (!transition) {
    return {
      allowed: false,
      reason: `Transition from "${from}" to "${to}" is not allowed`,
    };
  }

  // Empty allowedRoles means system-only transition
  if (transition.allowedRoles.length === 0) {
    return {
      allowed: false,
      reason: `Transition "${transition.label}" is system-only and cannot be performed by a user`,
    };
  }

  if (!transition.allowedRoles.includes(userRole)) {
    return {
      allowed: false,
      reason: `Role "${userRole}" is not authorized for transition "${transition.label}". Required: ${transition.allowedRoles.join(", ")}`,
    };
  }

  return { allowed: true };
}

// ── Entity-specific validators ──────────────────────────────────────────────

export function canTransitionDay(
  from: DayState,
  to: DayState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(dayStateMachine, from, to, userRole);
}

export function canTransitionProjectDivePlan(
  from: ProjectDivePlanState,
  to: ProjectDivePlanState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(projectDivePlanStateMachine, from, to, userRole);
}

export function canTransitionDivePlan(
  from: DivePlanState,
  to: DivePlanState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(divePlanStateMachine, from, to, userRole);
}

export function canTransitionRisk(
  from: RiskState,
  to: RiskState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(riskStateMachine, from, to, userRole);
}

export function canTransitionJha(
  from: JhaState,
  to: JhaState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(jhaStateMachine, from, to, userRole);
}

export function canTransitionSafetyMeeting(
  from: SafetyMeetingState,
  to: SafetyMeetingState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(safetyMeetingStateMachine, from, to, userRole);
}

export function canTransitionNearMiss(
  from: NearMissState,
  to: NearMissState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(nearMissStateMachine, from, to, userRole);
}

export function canTransitionAnomaly(
  from: AnomalyState,
  to: AnomalyState,
  userRole: UserRole,
): TransitionResult {
  return validateTransition(anomalyStateMachine, from, to, userRole);
}

// ── Day-specific helpers ────────────────────────────────────────────────────

/**
 * Check if a GOD user can edit a closed day.
 * In the current codebase, only GOD can edit CLOSED days via PATCH.
 */
export function canEditClosedDay(userRole: UserRole): boolean {
  return userRole === "GOD";
}

/**
 * Check if a user can force-close a day despite compliance gaps.
 * Current logic: ADMIN and GOD can force-close.
 */
export function canForceCloseDay(userRole: UserRole): boolean {
  return userRole === "ADMIN" || userRole === "GOD";
}

/**
 * Check if a user can delete a day (GOD only, cascade deletes dives/events).
 */
export function canDeleteDay(userRole: UserRole): boolean {
  return userRole === "GOD";
}

// ── ProjectDivePlan-specific helpers ────────────────────────────────────────

/**
 * Check if a project dive plan can be edited (not Approved or Superseded).
 */
export function canEditProjectDivePlan(status: ProjectDivePlanState): boolean {
  return status !== ProjectDivePlanState.Approved && status !== ProjectDivePlanState.Superseded;
}

/**
 * Check if a user can delete an approved project dive plan (GOD only).
 */
export function canDeleteApprovedProjectDivePlan(userRole: UserRole): boolean {
  return userRole === "GOD";
}

// ── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Get all valid next states from a given state for a specific entity and role.
 */
export function getNextStates<S extends string>(
  config: StateMachineConfig<S>,
  currentState: S,
  userRole: UserRole,
): S[] {
  return config.transitions
    .filter((t) => t.from === currentState)
    .filter((t) => t.allowedRoles.length === 0 || t.allowedRoles.includes(userRole))
    .map((t) => t.to);
}

/**
 * Get all transitions available from a given state for a specific role.
 */
export function getAvailableTransitions<S extends string>(
  config: StateMachineConfig<S>,
  currentState: S,
  userRole: UserRole,
): StateTransition<S>[] {
  return config.transitions.filter(
    (t) => t.from === currentState && t.allowedRoles.includes(userRole),
  );
}
