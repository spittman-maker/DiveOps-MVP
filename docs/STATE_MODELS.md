# DiveOps Core State Models

This document defines the lifecycle states for core DiveOps entities, based on the actual schema definitions in `shared/schema.ts` and `shared/safety-schema.ts`, and the transition logic implemented in the server route handlers.

---

## Roles Reference

From `shared/schema.ts` (`userRoleEnum`):

| Role | Level |
|------|-------|
| `GOD` | Platform superadmin — can override all restrictions |
| `ADMIN` | Company/org admin |
| `SUPERVISOR` | Dive supervisor — primary operational user |
| `DIVER` | Field diver — read-heavy, limited write |

---

## 1. Day (Shift)

**Schema:** `days` table, `status` column
**Type:** `DayStatus = "DRAFT" | "ACTIVE" | "CLOSED"`
**Default:** `"DRAFT"`

### States

| State | Description |
|-------|-------------|
| `DRAFT` | Newly created shift. Data entry in progress. |
| `ACTIVE` | Shift is operationally active. Reopened shifts return to this state. |
| `CLOSED` | Shift closed out. Editing restricted (GOD can override). |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `DRAFT` | `POST /projects/:projectId/days` | SUPERVISOR, ADMIN, GOD | No open shifts for the same date | `day.create` |
| `DRAFT` | `ACTIVE` | `PATCH /days/:id` | SUPERVISOR, ADMIN, GOD | Day exists | `day.activate` |
| `DRAFT` or `ACTIVE` | `CLOSED` | `POST /days/:id/close` | SUPERVISOR, ADMIN, GOD | Compliance gaps must pass (or `forceClose=true` by ADMIN/GOD) | `day.close` or `day.close_override` |
| `DRAFT` or `ACTIVE` | `CLOSED` | `POST /days/:id/close-and-export` | SUPERVISOR, ADMIN, GOD | Not already closed; export generation enabled | `day.close` (with `withExport` metadata) |
| `CLOSED` | `ACTIVE` | `POST /days/:id/reopen` | SUPERVISOR, ADMIN, GOD | Day must be in CLOSED state | `day.reopen` |
| any | (deleted) | `DELETE /days/:id` | GOD only | Cascade-deletes dives, log events; nullifies audit refs | `day.delete` |

### Compliance Validations (for close)

Evaluated by `evaluateComplianceGaps()`:
- Shift breathing gas is set
- Each dive has: diver name, max depth, breathing gas, FO2% (if Nitrox), LS time, RS time, dive table
- Closeout data has: `scopeStatus`, `documentationStatus`

### Edit Restrictions

- When `CLOSED`: only GOD can edit via `PATCH /days/:id`
- Supervisors and Admins are blocked from editing closed days

---

## 2. Dive Confirmation

**Schema:** `diveConfirmations` table, `status` column
**Type:** `"confirmed" | "flagged"`

Note: The `dives` table itself has no status field. Dives are derived from log events. The confirmation is a separate record created by the diver.

### States

| State | Description |
|-------|-------------|
| `confirmed` | Diver has reviewed and confirmed the dive record is accurate. |
| `flagged` | Diver has flagged the dive record as needing correction. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `confirmed` or `flagged` | (confirmation creation) | DIVER (self) | Dive must exist; diver must be the assigned diver | N/A |

---

## 3. ProjectDivePlan

**Schema:** `projectDivePlans` table, `status` column
**Type:** `ProjectDivePlanStatus = "Draft" | "Submitted" | "Approved" | "Superseded"`
**Default:** `"Draft"`

### States

| State | Description |
|-------|-------------|
| `Draft` | Plan is being authored. Editable. Auto-save supported. |
| `Submitted` | Plan submitted for review. Awaiting approval. |
| `Approved` | Plan approved and active for the project. |
| `Superseded` | A newer revision has been approved; this plan is archived. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `Draft` | `POST /projects/:projectId/project-dive-plans` | SUPERVISOR, ADMIN, GOD | Project exists; revision auto-incremented | N/A |
| `Draft` | `Submitted` | `POST /project-dive-plans/:id/submit` | SUPERVISOR, ADMIN, GOD | Status must be `Draft` | N/A |
| `Submitted` | `Approved` | `POST /project-dive-plans/:id/approve` | ADMIN, GOD | Status must be `Submitted`; any currently active plan is moved to `Superseded` | N/A |
| `Approved` | `Superseded` | (automatic, during approval of a newer plan) | System | Triggered when a new plan for the same project is approved | N/A |
| any | `Draft` (new revision) | `POST /project-dive-plans/:id/new-revision` | SUPERVISOR, ADMIN, GOD | Creates a new record copying plan data; revision incremented | N/A |

### Edit Restrictions

- `Approved` or `Superseded` plans cannot be modified via `PATCH`
- `Approved` plans can only be deleted by GOD
- Draft/Submitted plans can be deleted by SUPERVISOR or GOD

---

## 4. DivePlan (Shift-level)

**Schema:** `divePlans` table, `status` column
**Type:** `"Draft" | "Active" | "Closed"`
**Default:** `"Draft"`

### States

| State | Description |
|-------|-------------|
| `Draft` | Plan being prepared for a shift. |
| `Active` | Plan is in use for the current shift. |
| `Closed` | Plan is finalized. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `Draft` | `POST /projects/:projectId/dive-plans` | SUPERVISOR, ADMIN, GOD | — | N/A |
| `Draft` or `Active` | `Closed` | `POST /dive-plans/:id/close` | SUPERVISOR, ADMIN, GOD | Plan exists | N/A |
| `Closed` | `Draft` | `PATCH /dive-plans/:id` (with `status: "Draft"`) | ADMIN, GOD | Only Admin or higher can reopen; version incremented | N/A |
| any | any | `PATCH /dive-plans/:id` | SUPERVISOR, ADMIN, GOD | Closed plans require ADMIN/GOD | N/A |

---

## 5. Risk Item

**Schema:** `riskItems` table, `status` column
**Type:** `"open" | "mitigated" | "closed"`
**Default:** `"open"`

### States

| State | Description |
|-------|-------------|
| `open` | Risk identified, not yet addressed. |
| `mitigated` | Controls/mitigations applied; residual risk documented. |
| `closed` | Risk resolved or accepted; closure authority recorded. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `open` | `POST /risks` | SUPERVISOR, ADMIN, GOD | `dayId` and `description` required; day must exist; feature flag enabled | `risk.create` |
| `open` | `mitigated` | `PATCH /risks/:id` | SUPERVISOR, ADMIN, GOD | Risk exists; optimistic concurrency via `version` field | `risk.update` |
| `open` or `mitigated` | `closed` | `PATCH /risks/:id` | SUPERVISOR, ADMIN, GOD | Risk exists; version check | `risk.update` |
| any | any | `PATCH /risks/:id` | SUPERVISOR, ADMIN, GOD | General update; version-based conflict detection | `risk.update` |

### Notes

- Risks use optimistic concurrency control via the `version` field (returns 409 on conflict)
- `closureAuthority` field records who authorized closure
- `editReason` is tracked for audit purposes

---

## 6. Checklist Completion

**Schema:** `checklistCompletions` table, `status` column
**Type:** `CompletionStatus = "in_progress" | "completed" | "completed_with_issues"`
**Default:** `"in_progress"`

### States

| State | Description |
|-------|-------------|
| `in_progress` | Checklist started but not yet submitted. |
| `completed` | All items passed. Digital signature captured. |
| `completed_with_issues` | Completed but one or more items flagged as `fail` or `flag`. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `completed` or `completed_with_issues` | `POST /safety/checklists/:checklistId/complete` | Any authenticated user (with safety feature flag) | Checklist must exist; responses validated against schema | N/A |

### Notes

- Status is determined automatically based on response content:
  - If any response has `status: "fail"` or `status: "flag"` → `completed_with_issues`
  - Otherwise → `completed`
- Completed checklists are auto-saved to the project's document library
- Digital signature field captured at completion time

---

## 7. JHA Record (Job Hazard Analysis)

**Schema:** `jhaRecords` table, `status` column
**Type:** `JhaStatus = "draft" | "pending_review" | "approved" | "superseded"`
**Default:** `"draft"`

### States

| State | Description |
|-------|-------------|
| `draft` | JHA being authored (manually or via AI generation). |
| `pending_review` | JHA submitted for supervisor review. AI-generated JHAs start here. |
| `approved` | JHA reviewed and approved. `approvedBy`/`approvedAt` recorded. |
| `superseded` | Replaced by a newer version. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `draft` | `POST /safety/jha` | SUPERVISOR, ADMIN, GOD | Project exists | `safety.jha.create` |
| (none) | `pending_review` | `POST /safety/jha/generate` (AI) | SUPERVISOR, ADMIN, GOD | AI generation succeeds | `safety.jha.generate` |
| `draft` | `pending_review` | `PATCH /safety/jha/:id` | SUPERVISOR, ADMIN, GOD | JHA exists | `safety.jha.update` |
| `pending_review` | `approved` | `PATCH /safety/jha/:id` | SUPERVISOR, ADMIN, GOD | Sets `approvedBy`, `approvedAt` | `safety.jha.update` |
| any | any | `PATCH /safety/jha/:id` | SUPERVISOR, ADMIN, GOD | General update with status change tracking | `safety.jha.update` |
| any | (deleted) | `DELETE /safety/jha/:id` | SUPERVISOR, ADMIN, GOD | JHA exists | `safety.jha.delete` |

---

## 8. Safety Meeting

**Schema:** `safetyMeetings` table, `status` column
**Type:** `SafetyMeetingStatus = "draft" | "in_progress" | "completed"`
**Default:** `"draft"`

### States

| State | Description |
|-------|-------------|
| `draft` | Meeting agenda prepared (manually or AI-generated). |
| `in_progress` | Meeting is underway. |
| `completed` | Meeting concluded. Digital signature and attendees recorded. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `draft` | `POST /safety/meetings` or `POST /safety/meetings/generate` | SUPERVISOR, ADMIN, GOD | Project exists | `safety.meeting.create` or `safety.meeting.generate` |
| `draft` | `in_progress` | `PATCH /safety/meetings/:id` | SUPERVISOR, ADMIN, GOD | Meeting exists | `safety.meeting.update` |
| `in_progress` | `completed` | `PATCH /safety/meetings/:id` | SUPERVISOR, ADMIN, GOD | Sets `signedAt` | `safety.meeting.update` |
| any | (deleted) | `DELETE /safety/meetings/:id` | SUPERVISOR, ADMIN, GOD | Meeting exists | `safety.meeting.delete` |

---

## 9. Near-Miss Report

**Schema:** `nearMissReports` table, `status` column
**Type:** `NearMissStatus = "reported" | "under_review" | "resolved" | "closed"`
**Default:** `"reported"`

### States

| State | Description |
|-------|-------------|
| `reported` | Initial report submitted. |
| `under_review` | Being investigated. `reviewedBy`/`reviewedAt` set. |
| `resolved` | Corrective actions taken. `resolvedBy`/`resolvedAt` set. |
| `closed` | Report finalized and closed. |

### Transitions

| From | To | Endpoint | Roles | Validations | Audit Event |
|------|----|----------|-------|-------------|-------------|
| (none) | `reported` | `POST /safety/near-misses` | Any authenticated user (with safety flag) | Project, day exist | `safety.near_miss.create` |
| `reported` | `under_review` | `PATCH /safety/near-misses/:id` | SUPERVISOR, ADMIN, GOD | Sets `reviewedBy`, `reviewedAt` | `safety.near_miss.update` |
| `under_review` | `resolved` | `PATCH /safety/near-misses/:id` | SUPERVISOR, ADMIN, GOD | Sets `resolvedBy`, `resolvedAt` | `safety.near_miss.update` |
| `resolved` | `closed` | `PATCH /safety/near-misses/:id` | SUPERVISOR, ADMIN, GOD | Report exists | `safety.near_miss.update` |
| any | (deleted) | `DELETE /safety/near-misses/:id` | SUPERVISOR, ADMIN, GOD | Report exists | `safety.near_miss.delete` |

---

## 10. Anomaly Flag

**Schema:** `anomalyFlags` table, `status` column
**Type:** `AnomalyStatus = "open" | "acknowledged" | "resolved" | "false_positive"`
**Default:** `"open"`

### States

| State | Description |
|-------|-------------|
| `open` | Anomaly detected by analytics engine. |
| `acknowledged` | Operator has seen and acknowledged the anomaly. |
| `resolved` | Anomaly root cause addressed. `resolvedBy`/`resolvedAt` set. |
| `false_positive` | Anomaly dismissed as not a real issue. |

### Transitions

| From | To | Audit Event |
|------|----|-------------|
| (none) | `open` | `anomaly.detect` |
| `open` | `acknowledged` | `anomaly.acknowledge` |
| `open` or `acknowledged` | `resolved` | N/A |
| `open` or `acknowledged` | `false_positive` | `anomaly.dismiss` |

---

## 11. Project Directory Entry

**Schema:** `projectDirectory` table, `status` column
**Type:** `"VERIFIED" | "NEEDS_VERIFICATION"`
**Default:** `"NEEDS_VERIFICATION"`

### States

| State | Description |
|-------|-------------|
| `NEEDS_VERIFICATION` | Personnel entry added but not yet verified. |
| `VERIFIED` | Personnel credentials and identity confirmed. |

---

## Entities Without Status Fields

The following entities referenced in the task description do not have explicit status columns in the current schema:

- **Project** (`projects` table): No `status` or `archived` field exists. Projects are implicitly active. No archive/deactivate transition is implemented.
- **Dive** (`dives` table): No status field. Dives are data records derived from log events. Confirmation status lives on the separate `diveConfirmations` table.

---

## QC Closeout Data (embedded in Day)

The `closeoutData` JSON field on the `days` table contains:

```typescript
interface QCCloseoutData {
  scopeStatus: "complete" | "incomplete";
  documentationStatus: "complete" | "incomplete";
  exceptions: string;
  advisedFor: string;
  advisedAgainst: string;
  advisoryOutcome: string;
  standingRisks: Array<{ riskId: string; status: string }>;
  deviations: string;
  outstandingIssues: string;
  plannedNextShift: string;
}
```

This is not a separate entity but embedded data set during the day close process.
