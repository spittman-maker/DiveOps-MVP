# DiveOps MVP — Data Lifecycle Rules

This document defines when data can be edited, when it becomes immutable, how it is deleted, and what must remain auditable. All code changes must respect these rules.

---

## Terminology

| Term | Meaning |
|---|---|
| **Immutable** | Record cannot be modified after a trigger event. GOD role may override. |
| **Soft-delete** | Record is marked inactive (`isActive = false`, `status = "closed"`) but remains in the database. |
| **Hard-delete** | Record is permanently removed via `DELETE` statement. |
| **Cascade-delete** | Deleting a parent automatically deletes all children (via FK `ON DELETE CASCADE`). |
| **Append-only** | Records are only inserted, never updated or deleted. |

---

## Projects

| Aspect | Rule |
|---|---|
| **Editable fields** | `name`, `clientName`, `jobsiteName`, `jobsiteAddress`, `jobsiteLat`, `jobsiteLng`, `timezone`, `emergencyContacts`. Editable at any time by ADMIN or GOD. |
| **Immutability trigger** | None. Projects remain editable throughout their lifecycle. |
| **Deletion** | Hard-delete by GOD only. Cascade-deletes all days, dives, log events, log renders, risk items, client comms, daily summaries, library exports, analytics snapshots, anomaly flags, and audit events for the project. |
| **Archival** | No archive status exists in schema. Projects persist until deleted. |
| **Auditability** | No dedicated audit action for project edits currently. Day/dive/log operations under the project are audited. |

### Project Members

| Aspect | Rule |
|---|---|
| **Editable** | `role` can be changed. Members can be added or removed. |
| **Deletion** | Hard-delete via `ON DELETE CASCADE` when project or user is deleted, or explicitly removed by ADMIN/GOD. |

---

## Days (Operational Shifts)

Days follow a three-state lifecycle: `DRAFT` -> `ACTIVE` -> `CLOSED`.

| Aspect | Rule |
|---|---|
| **Editable fields (DRAFT/ACTIVE)** | `date`, `shift`, `status`, `defaultBreathingGas`, `defaultFo2Percent`, `closeoutData`. Editable by SUPERVISOR, ADMIN, GOD. |
| **Immutability trigger** | **Closing the day** (`POST /days/:id/close`). Sets `status = "CLOSED"`, records `closedBy` and `closedAt`, increments `version`. |
| **What becomes immutable** | All fields. Once CLOSED, only GOD can edit via `PATCH /days/:id`. Non-GOD users receive `403 "Day is closed. Only GOD can edit."` |
| **Reopening** | `POST /days/:id/reopen` — SUPERVISOR, ADMIN, GOD. Changes status from CLOSED back to ACTIVE, clears `closedBy`/`closedAt`, increments `version`. A system log event is created recording who reopened and when. Audited as `day.reopen`. |
| **Close guard** | Cannot close unless compliance gaps are resolved (breathing gas, diver names, depths, times, dive tables, closeout data). ADMIN/GOD can force-close with `forceClose: true`, audited as `day.close_override`. |
| **Duplicate prevention** | Cannot create a new shift for a date if any existing shift for that date is still DRAFT or ACTIVE (HTTP 409). |
| **Deletion** | Hard-delete by GOD only. Cascade-deletes all dives and log events for the day. Audit events referencing the day have `day_id` set to NULL (not deleted). |
| **Archival** | No explicit archive state. Closed days serve as the archived record. |
| **Auditability** | All state transitions audited: `day.create`, `day.activate`, `day.close`, `day.close_override`, `day.reopen`, `day.delete`. Before/after snapshots recorded. |
| **Versioning** | `version` column incremented on every close, reopen, or export operation (optimistic concurrency). |

### Close-and-Export (Transactional)

When `POST /days/:id/close-and-export` is used, closing and document generation happen inside a single database transaction. If export fails, the day remains open and the transaction rolls back. This is audited with `metadata.withExport = true`.

---

## Log Events

Log events are the **immutable source of truth** — the raw field observations.

| Aspect | Rule |
|---|---|
| **Editable fields** | `rawText`, `category`, `extractedJson`, `structuredPayload`, `aiAnnotations`, `validationPassed`, `station`. Edits require `editReason` and increment `version`. |
| **Immutability trigger** | **Day closure.** When the parent day is CLOSED, log events under it cannot be created or modified (enforced by the `canWriteLogEvents` + day-status check in the route layer). GOD can still edit via day-level override. |
| **What remains immutable** | `authorId`, `captureTime`, `dayId`, `projectId` — these are set at creation and never changed. |
| **Deletion** | Hard-delete. Cascade-deletes all associated `logRenders`. When a day is deleted, all log events are cascade-deleted. Audited as `log_event.delete`. |
| **Archival** | No soft-delete. Events persist as long as their parent day exists. |
| **Auditability** | All mutations audited: `log_event.create`, `log_event.update`, `log_event.delete`. Before/after JSON snapshots captured. `editReason` field provides human-readable justification. |
| **Versioning** | `version` column tracks edit count. |

### Log Renders (AI-Generated Lines)

| Aspect | Rule |
|---|---|
| **Editable** | Not directly editable. Regenerated by re-processing the parent log event. |
| **Deletion** | Cascade-deleted when parent log event is deleted (`ON DELETE CASCADE`). |
| **Auditability** | Not independently audited. The parent log event audit trail covers regeneration. |

---

## Dives

| Aspect | Rule |
|---|---|
| **Editable fields** | All operational fields: `diverDisplayName`, `diveNumber`, `station`, `lsTime`, `rbTime`, `lbTime`, `rsTime`, `maxDepthFsw`, `breathingGas`, `fo2Percent`, `taskSummary`, `toolsEquipment`, `qcDisposition`, `tableUsed`, `scheduleUsed`, `decompRequired`, `postDiveStatus`, `notes`, etc. |
| **Immutability trigger** | **Day closure.** Same rule as log events — dives under a CLOSED day cannot be modified except by GOD. |
| **What remains immutable** | `dayId`, `projectId` — set at creation. |
| **Deletion** | Hard-delete. Cascade-deletes `diveConfirmations` and `diveLogDetails`. When a day is deleted, all dives are cascade-deleted. GOD-only for direct dive deletion. Audited as `dive.delete`. |
| **Archival** | No soft-delete. Dives persist with their parent day. |
| **Auditability** | All mutations audited: `dive.create`, `dive.update`, `dive.delete`. |
| **Versioning** | `version` column tracks edit count. |
| **Breathing gas propagation** | When day-level breathing gas is updated, it propagates to all dives that do not have `breathingGasOverride = true`. |

### Dive Confirmations

| Aspect | Rule |
|---|---|
| **Editable** | Not editable after creation. A diver confirms or flags a dive record. |
| **Deletion** | Cascade-deleted with parent dive. |

---

## Risk Items

| Aspect | Rule |
|---|---|
| **Editable fields** | `description`, `category`, `source`, `affectedTask`, `initialRiskLevel`, `residualRisk`, `status`, `owner`, `mitigation`, `closureAuthority`, `linkedDirectiveId`. Edits require `editReason` and increment `version`. |
| **Immutability trigger** | **Day closure** for risks scoped to a day. Risk status can transition to `"closed"` or `"mitigated"` as a soft-close. |
| **Status lifecycle** | `open` -> `mitigated` -> `closed`. Closing requires `closureAuthority`. |
| **Deletion** | Hard-delete. Cascade-deleted when parent day or project is deleted. |
| **Archival** | Risks with `status = "closed"` serve as the archived record. They remain queryable. |
| **Auditability** | All mutations audited: `risk.create`, `risk.update`. Before/after snapshots include `editReason`. |
| **Versioning** | `version` column tracks edit count. |

---

## Dive Plans (Daily)

| Aspect | Rule |
|---|---|
| **Editable fields** | `planJson`, `status`, `cachedRenders`. |
| **Status lifecycle** | `Draft` -> `Active` -> `Closed`. |
| **Immutability trigger** | Setting `status = "Closed"` records `closedBy`/`closedAt`. |
| **Deletion** | Cascade-deleted when parent project is deleted. Stations under the plan are cascade-deleted. |
| **Auditability** | Not independently audited in the current schema. |
| **Versioning** | `planVersion` column tracks revisions. |

### Project Dive Plans (DD5)

| Aspect | Rule |
|---|---|
| **Editable fields** | `planData` (controlled fill zones only — locked sections must not be modified). `status` transitions through `Draft` -> `Submitted` -> `Approved` -> `Superseded`. |
| **Immutability trigger** | **Approval** (`status = "Approved"`). Once approved, the plan is frozen. Further changes create a new revision and the old plan moves to `Superseded` (with `supersededBy` pointing to the new plan). |
| **Deletion** | Cascade-deleted with parent project. |
| **Versioning** | `revision` column. Each new submission increments the revision. Revision history is tracked inside `planData.revisionHistory[]` with deterministic descriptions. |

---

## Certifications

### Diver Certifications

| Aspect | Rule |
|---|---|
| **Editable fields** | `certName`, `certType`, `certNumber`, `issuingAuthority`, `issuedDate`, `expirationDate`, `fileUrl`, `status`, `notes`. |
| **Status lifecycle** | `active` -> expired (determined by `expirationDate` vs current date). |
| **Deletion** | Hard-delete. Cascade-deleted when parent user is deleted (`ON DELETE CASCADE`). Project/company references set to NULL on parent deletion (`ON DELETE SET NULL`). |
| **Archival** | Expired certifications remain in the database with their expiration date for audit trail. |
| **Auditability** | Not independently audited in the current schema. Changes to certification status are tracked via `updatedAt`. |

### Equipment Certifications

| Aspect | Rule |
|---|---|
| **Editable fields** | `equipmentName`, `equipmentCategory`, `certType`, `certNumber`, `expirationDate`, `status`, `notes`. |
| **Deletion** | Hard-delete. Project reference set to NULL on project deletion (`ON DELETE SET NULL`). |
| **Archival** | Same as diver certifications — expired records persist. |

---

## Companies

| Aspect | Rule |
|---|---|
| **Editable fields** | `companyName`, `logoAssetKey`. |
| **Immutability trigger** | None. Companies remain editable. |
| **Deletion** | Hard-delete. Projects referencing the company are restricted (`ON DELETE RESTRICT`) — cannot delete a company that has projects. Company members, company roles, and contact defaults are cascade-deleted. User `companyId` is set to NULL. |
| **Auditability** | Audited: `company.create`, `company.update`, `company.delete`. |

### Company Members

| Aspect | Rule |
|---|---|
| **Editable** | `companyRole` can be changed. |
| **Deletion** | Hard-delete. Cascade-deleted when company or user is deleted. Audited as `company_member.add` / `company_member.remove`. |

---

## Users

| Aspect | Rule |
|---|---|
| **Editable fields** | `username`, `password`, `role`, `fullName`, `initials`, `email`, `companyId`, `mustChangePassword`. |
| **Immutability trigger** | None. Users are always editable by ADMIN/GOD. |
| **Deletion** | No delete endpoint in standard routes. Deleting a user would cascade-delete: certifications, company memberships, project memberships, dashboard layouts, user preferences. Log events, dives, and days reference the user but use non-cascading FKs. |
| **Archival** | No soft-delete or archive status. Users persist. |
| **Auditability** | Audited: `user.create`, `user.update`. Auth events audited: `auth.login`, `auth.login_failed`, `auth.logout`, `auth.password_change`. |

---

## Audit Events (Append-Only)

| Aspect | Rule |
|---|---|
| **Editable** | **Never.** Audit events are append-only. No update or delete operations exist. |
| **Deletion** | Audit events referencing a deleted day have `day_id` set to NULL rather than being deleted. When a project is hard-deleted by GOD, audit events for that project are deleted as part of the cascade — this is a known trade-off for the GOD-only project deletion path. |
| **Retention** | All audit events are retained indefinitely. |
| **Fields captured** | `correlationId`, `action`, `userId`, `userRole`, `companyId`, `projectId`, `dayId`, `targetId`, `targetType`, `before` (JSON snapshot), `after` (JSON snapshot), `metadata`, `ipAddress`, `timestamp`. |

---

## Library Exports (Generated Documents)

| Aspect | Rule |
|---|---|
| **Editable** | **Never.** Exports are generated at close time and stored as base64. |
| **Duplicate prevention** | Unique constraint on `(dayId, fileName)`. Insert logic skips files that already exist. |
| **Deletion** | Cascade-deleted when parent day or project is deleted. |
| **Auditability** | Generation audited as `export.generate`. Close-and-export metadata includes file count and validation status. |

---

## Summary: Deletion Strategy by Entity

| Entity | Delete Type | Who Can Delete | Cascade Children |
|---|---|---|---|
| Project | Hard | GOD | Days, dives, log events, renders, risks, exports, summaries, comms, analytics, audit events |
| Day | Hard | GOD | Dives, log events (audit events nullified, not deleted) |
| Log Event | Hard | SUPERVISOR+ (open day) | Log renders |
| Dive | Hard | GOD | Dive confirmations, dive log details |
| Risk Item | Hard | Cascade only | — |
| Dive Plan | Hard | Cascade only | Stations |
| Certification | Hard | ADMIN/GOD | — |
| Company | Hard (restricted) | GOD | Members, roles, contact defaults (blocked if projects exist) |
| User | No delete endpoint | — | Would cascade certs, memberships, preferences |
| Audit Event | Never deleted | — | — (except project cascade by GOD) |
| Library Export | Hard | Cascade only | — |
| Safety records | Hard | SUPERVISOR+ | Audited before deletion |

---

## Summary: Immutability Triggers

| Trigger | Entities Affected | Override |
|---|---|---|
| Day closure (`status = "CLOSED"`) | Day fields, log events, dives, risks (day-scoped) | GOD role, or reopen the day |
| Plan approval (`status = "Approved"`) | Project dive plan (DD5) | Create new revision (old becomes `Superseded`) |
| Export generation | Library exports | None — append-only |
| Audit event creation | Audit events | None — append-only |
