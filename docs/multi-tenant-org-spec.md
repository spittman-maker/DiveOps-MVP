# DiveOps-MVP — Multi-Tenant Organization Support
## Technical Specification

| Field | Value |
|---|---|
| **Document ID** | SPEC-ORG-001 |
| **Status** | Draft — For Review |
| **Version** | 1.0.0 |
| **Author** | Skyler Pittman / Manus AI |
| **Date** | 2026-03-10 |
| **Scope** | Database, Backend, Frontend, Auth, Migration, Testing |

---

## Table of Contents

1. [Overview & Motivation](#1-overview--motivation)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Database Schema Changes](#4-database-schema-changes)
5. [Data Migration Plan](#5-data-migration-plan)
6. [Middleware & Auth Changes](#6-middleware--auth-changes)
7. [API Route Changes](#7-api-route-changes)
8. [Frontend UI Changes](#8-frontend-ui-changes)
9. [Rollback Plan](#9-rollback-plan)
10. [Testing Strategy](#10-testing-strategy)
11. [Estimated Effort & Timeline](#11-estimated-effort--timeline)
12. [Open Questions & Risks](#12-open-questions--risks)

---

## 1. Overview & Motivation

DiveOps-MVP currently operates with a flat user and project structure. All users, projects, log events, dives, risk items, and safety records exist in a single shared namespace. Any user with the `ADMIN` role can see and manage all data across the entire system, regardless of which company they belong to. This is architecturally incompatible with commercial multi-company deployment.

The goal of this specification is to introduce an **Organization (Company) layer** that sits above projects and users, creating true data silos between companies while preserving the GOD-level aggregated view that Skyler Pittman requires as system administrator. The design follows a **shared-database, separate-schema-by-row** multi-tenancy pattern, where a `company_id` foreign key on key tables enforces tenant boundaries at the data access layer rather than at the database level.

The three companies to be supported at launch are **SEA Engineering (SEI)**, **Army Dive Locker**, and **Chesapeake Bay Diving (CBD)**.

---

## 2. Current State Analysis

### 2.1 Existing Schema (Relevant Tables)

The following tables are directly affected by the multi-tenant change. Tables that are purely project-scoped (e.g., `log_events`, `dives`, `days`) inherit tenant scope transitively through their `project_id` foreign key and require no structural changes — only access-layer enforcement.

| Table | Primary Key Type | Current Tenant Anchor | Gap |
|---|---|---|---|
| `users` | `varchar` (UUID) | None — global | No `company_id`; role is a flat enum |
| `projects` | `varchar` (UUID) | None — global | No `company_id` |
| `project_members` | Composite (`project_id`, `user_id`) | Via `project_id` | Role is project-scoped but not company-validated |
| `companies` | `uuid` | Self | **Already exists** — stub only, not wired to users or projects |
| `company_roles` | `uuid` | `company_id` FK | Operational contact roles, not auth roles |
| `audit_events` | `varchar` (UUID) | `project_id` (nullable) | No `company_id` on audit trail |
| `diver_certifications` | `varchar` (UUID) | `user_id` | No company scope |
| `equipment_certifications` | `varchar` (UUID) | `project_id` (nullable) | Inherits via project |
| `analytics_snapshots` | `varchar` (UUID) | `project_id` | Inherits via project |
| `dashboard_layouts` | `varchar` (UUID) | `user_id` | No company scope |

### 2.2 Existing Role Enum

The current `userRoleEnum` in `shared/schema.ts` defines four flat roles:

```typescript
export const userRoleEnum = z.enum(["GOD", "ADMIN", "SUPERVISOR", "DIVER"]);
```

`ADMIN` is currently a system-wide role. The `requireRole("ADMIN", "GOD")` middleware in `server/auth.ts` grants any `ADMIN` user access to all projects and all users, which is the core security gap this spec addresses.

### 2.3 Existing Auth Middleware

`server/authz.ts` contains `requireProjectAccess()` and `requireDayAccess()`. Both currently bypass all checks for `ADMIN` and `GOD` roles:

```typescript
function isAdminOrGod(role: string): boolean {
  return role === "ADMIN" || role === "GOD";
}
// ...
if (isAdminOrGod(user.role)) return next(); // ADMIN bypasses company check
```

This must be changed so that `ADMIN` bypass is scoped to the user's own company.

### 2.4 Companies Stub

The `companies` table already exists in the schema and migrations (`0000_dark_guardsmen.sql`). The `seed.ts` file seeds a single company. However, `users.company_id` and `projects.company_id` columns **do not yet exist**. The `companies` table is currently used only for the DD5 dive plan cover page and contact role defaults — it is not yet wired into the access control layer.

---

## 3. Target Architecture

### 3.1 Four-Tier Role Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1 — GOD (System Admin)                                │
│  User: Skyler Pittman (spittman@precisionsubsea.com)        │
│  Scope: All companies, all data, aggregated view            │
│  Can: Create companies, assign company admins, see all      │
└────────────────────────┬────────────────────────────────────┘
                         │ manages
┌────────────────────────▼────────────────────────────────────┐
│  TIER 2 — ADMIN (Company Admin)                             │
│  Scope: Single company only                                 │
│  Can: Create projects, create/assign users within company   │
│  Cannot: See other companies' data                          │
└────────────────────────┬────────────────────────────────────┘
                         │ manages
┌────────────────────────▼────────────────────────────────────┐
│  TIER 3 — SUPERVISOR                                        │
│  Scope: Assigned projects within their company              │
│  Can: Toggle between company projects, run daily ops        │
│  Cannot: Create projects or manage users                    │
└────────────────────────┬────────────────────────────────────┘
                         │ works with
┌────────────────────────▼────────────────────────────────────┐
│  TIER 4 — DIVER                                             │
│  Scope: Assigned projects only                              │
│  Can: View assigned project data, limited log access        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Initial Company Roster

| Company | Short Code | Initial Users |
|---|---|---|
| SEA Engineering | SEI | John Spurlock, Dennis Johnston, Corey Garcia, Skyler Pittman |
| Army Dive Locker | ADL | Jake Feyers |
| Chesapeake Bay Diving | CBD | Baker, Martin Dorn, Aaron Addison, Jamie Morris |

> **Note:** Skyler Pittman holds the GOD role and is not scoped to any single company. His account is company-agnostic at the data layer.

### 3.3 Multi-Tenancy Pattern

The system uses a **shared database, row-level tenancy** pattern. All company data lives in the same PostgreSQL database. Tenant isolation is enforced entirely by the application access layer — specifically by middleware that injects `company_id` into every query predicate. There is no Row-Level Security (RLS) at the PostgreSQL level in this spec (see Section 12 for future consideration).

---

## 4. Database Schema Changes

### 4.1 Modified Tables

#### 4.1.1 `users` — Add `company_id`

```sql
ALTER TABLE users
  ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_users_company_id ON users(company_id);
```

**Rationale:** Users belong to exactly one company. GOD is the only user with `company_id = NULL`, which is the sentinel value indicating system-wide scope. All other users must have a non-null `company_id` after migration.

**Schema change in `shared/schema.ts`:**

```typescript
export const users = pgTable("users", {
  // ... existing columns ...
  companyId: uuid("company_id").references(() => companies.companyId, { onDelete: "setNull" }),
  // ...
}, (t) => ({
  companyIdx: index("idx_users_company_id").on(t.companyId),
}));
```

#### 4.1.2 `projects` — Add `company_id`

```sql
ALTER TABLE projects
  ADD COLUMN company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT;

CREATE INDEX idx_projects_company_id ON projects(company_id);
```

**Rationale:** Every project must belong to exactly one company. `ON DELETE RESTRICT` prevents accidental deletion of a company that still has active projects. The column is `NOT NULL` — all existing projects must be assigned to a company during migration before this constraint is applied.

**Schema change in `shared/schema.ts`:**

```typescript
export const projects = pgTable("projects", {
  // ... existing columns ...
  companyId: uuid("company_id").notNull().references(() => companies.companyId, { onDelete: "restrict" }),
  // ...
}, (t) => ({
  companyIdx: index("idx_projects_company_id").on(t.companyId),
}));
```

#### 4.1.3 `audit_events` — Add `company_id`

```sql
ALTER TABLE audit_events
  ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_audit_events_company_id ON audit_events(company_id);
```

**Rationale:** Audit events must be filterable by company so that GOD can view cross-company audit trails and company admins can view their own company's audit trail only.

#### 4.1.4 `diver_certifications` — Add `company_id`

```sql
ALTER TABLE diver_certifications
  ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_diver_certs_company_id ON diver_certifications(company_id);
```

**Rationale:** Certifications are tied to users, and users are tied to companies. Adding `company_id` directly enables efficient company-scoped queries without joining through `users`.

### 4.2 New Tables

#### 4.2.1 `company_members` (replaces implicit user-company link)

While `users.company_id` handles the primary affiliation, a dedicated `company_members` table is needed to support the GOD workflow of assigning company admins and to provide a clean API surface for company membership management.

```sql
CREATE TABLE company_members (
  company_id   UUID    NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_role TEXT    NOT NULL CHECK (company_role IN ('ADMIN', 'SUPERVISOR', 'DIVER')),
  added_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  added_by     VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT pk_company_members PRIMARY KEY (company_id, user_id)
);

CREATE INDEX idx_company_members_user_id ON company_members(user_id);
```

**Drizzle schema:**

```typescript
export const companyMembers = pgTable("company_members", {
  companyId: uuid("company_id").notNull().references(() => companies.companyId, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyRole: text("company_role").notNull().$type<"ADMIN" | "SUPERVISOR" | "DIVER">(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: "setNull" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.companyId, t.userId] }),
  userIdx: index("idx_company_members_user_id").on(t.userId),
}));
```

> **Note on dual membership records:** `users.company_id` remains the canonical single-company affiliation for fast lookups. `company_members` is the management table for role assignment and audit. They must be kept in sync by the application layer (a transaction that writes both).

### 4.3 Unchanged Tables (Tenant Scope Inherited Transitively)

The following tables are already scoped to a project via `project_id` and require no structural changes. Company-level access is enforced by validating the project's `company_id` at the middleware layer before any query on these tables is permitted.

| Table | Tenant Path |
|---|---|
| `days` | `days.project_id → projects.company_id` |
| `log_events` | `log_events.project_id → projects.company_id` |
| `dives` | `dives.project_id → projects.company_id` |
| `risk_items` | `risk_items.project_id → projects.company_id` |
| `client_comms` | `client_comms.project_id → projects.company_id` |
| `dive_plans` | `dive_plans.project_id → projects.company_id` |
| `project_dive_plans` | `project_dive_plans.project_id → projects.company_id` |
| `daily_summaries` | `daily_summaries.project_id → projects.company_id` |
| `library_exports` | `library_exports.project_id → projects.company_id` |
| `safety_checklists` | `safety_checklists.project_id → projects.company_id` |
| `checklist_completions` | `checklist_completions.project_id → projects.company_id` |
| `analytics_snapshots` | `analytics_snapshots.project_id → projects.company_id` |
| `project_members` | `project_members.project_id → projects.company_id` |
| `project_sops` | `project_sops.project_id → projects.company_id` |
| `project_directory` | `project_directory.project_id → projects.company_id` |
| `equipment_certifications` | `equipment_certifications.project_id → projects.company_id` |

### 4.4 Global / Shared Tables (No Tenant Scope)

The following tables are intentionally global and are not scoped to any company. They are either system configuration, reference data, or GOD-only resources.

| Table | Reason for Global Scope |
|---|---|
| `companies` | The tenant registry itself |
| `work_library_items` | Shared controlled task library (DD5 Section 2.9) |
| `directory_facilities` | Shared hyperbaric chamber / ER registry |
| `dive_plan_templates` | Shared DD5 template library |
| `audit_events` | Append-only compliance log; GOD sees all |
| `idempotency_keys` | System-level deduplication |
| `conversations` / `messages` | AI assistant sessions |

### 4.5 Summary of Schema Changes

| Change | Type | Tables Affected |
|---|---|---|
| Add `company_id` column | `ALTER TABLE` | `users`, `projects`, `audit_events`, `diver_certifications` |
| Add `company_members` table | `CREATE TABLE` | New |
| Add indexes | `CREATE INDEX` | `users`, `projects`, `audit_events`, `diver_certifications`, `company_members` |

---

## 5. Data Migration Plan

### 5.1 Guiding Principles

The migration must be **non-destructive**, **idempotent**, and **reversible**. It will be executed as a numbered Drizzle migration file (`0013_multi_tenant_org.sql`) within the existing `migrations/` directory, run via the existing `server/migrate.ts` mechanism. A full database backup must be taken immediately before execution.

### 5.2 Step-by-Step Migration

**Step 1 — Create the three companies (idempotent upsert):**

```sql
INSERT INTO companies (company_id, company_name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'SEA Engineering'),
  ('00000000-0000-0000-0000-000000000002', 'Army Dive Locker'),
  ('00000000-0000-0000-0000-000000000003', 'Chesapeake Bay Diving')
ON CONFLICT (company_name) DO NOTHING;
```

Using deterministic UUIDs for the three seed companies makes the migration idempotent and simplifies subsequent steps.

**Step 2 — Add `company_id` to `users` (nullable first):**

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;
```

The column is added as nullable so that existing rows are not immediately invalidated.

**Step 3 — Assign users to companies by username:**

```sql
-- SEA Engineering
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE username IN ('jspurlock', 'djohnston', 'cgarcia');
-- Note: Skyler (GOD) intentionally left NULL

-- Army Dive Locker
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000002'
WHERE username IN ('jfeyers');

-- Chesapeake Bay Diving
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000003'
WHERE username IN ('baker', 'mdorn', 'aaddison', 'jmorris');
```

> **Action Required:** Exact usernames must be confirmed against the live `users` table before executing this migration. This step should be run in a transaction with a `SELECT` verification before `COMMIT`.

**Step 4 — Populate `company_members` from `users.company_id` and `users.role`:**

```sql
INSERT INTO company_members (company_id, user_id, company_role)
SELECT company_id, id, role
FROM users
WHERE company_id IS NOT NULL
  AND role IN ('ADMIN', 'SUPERVISOR', 'DIVER')
ON CONFLICT (company_id, user_id) DO NOTHING;
```

**Step 5 — Add `company_id` to `projects` (nullable first):**

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE RESTRICT;
```

**Step 6 — Assign existing projects to companies:**

All existing projects must be manually assigned. The mapping below is based on known project context. This step **requires human confirmation** before execution.

```sql
-- Example: assign all existing projects to SEA Engineering as the default
-- MUST be reviewed and corrected per actual project ownership before running
UPDATE projects
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;
```

**Step 7 — Apply NOT NULL constraint on `projects.company_id`:**

Only after all rows have been assigned:

```sql
-- Verify no NULLs remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Migration aborted: projects with NULL company_id exist';
  END IF;
END $$;

ALTER TABLE projects ALTER COLUMN company_id SET NOT NULL;
```

**Step 8 — Add `company_id` to `audit_events` and `diver_certifications`:**

```sql
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

ALTER TABLE diver_certifications
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;
```

**Step 9 — Backfill `audit_events.company_id` from project:**

```sql
UPDATE audit_events ae
SET company_id = p.company_id
FROM projects p
WHERE ae.project_id = p.id
  AND ae.company_id IS NULL;
```

**Step 10 — Backfill `diver_certifications.company_id` from user:**

```sql
UPDATE diver_certifications dc
SET company_id = u.company_id
FROM users u
WHERE dc.user_id = u.id
  AND dc.company_id IS NULL;
```

**Step 11 — Create indexes:**

```sql
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_company_id ON audit_events(company_id);
CREATE INDEX IF NOT EXISTS idx_diver_certs_company_id ON diver_certifications(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);
```

### 5.3 Migration Execution Checklist

The following checklist must be completed in order, with a sign-off before proceeding to the next step.

| # | Action | Owner | Sign-off |
|---|---|---|---|
| 1 | Take full PostgreSQL database backup (Azure Database for PostgreSQL) | DevOps | ☐ |
| 2 | Confirm exact usernames for all personnel against live `users` table | Skyler | ☐ |
| 3 | Confirm project-to-company assignment mapping | Skyler | ☐ |
| 4 | Run migration in staging environment, verify row counts | Dev | ☐ |
| 5 | Run integration tests against staging | Dev | ☐ |
| 6 | Schedule production maintenance window | DevOps | ☐ |
| 7 | Run migration in production (inside transaction) | Dev | ☐ |
| 8 | Verify production row counts match staging | Dev | ☐ |
| 9 | Smoke test all three company logins | Skyler | ☐ |

---

## 6. Middleware & Auth Changes

### 6.1 Session Payload Extension

The session user object returned by `GET /api/auth/me` must be extended to include company context. This is the single source of truth for the frontend's company-aware rendering.

**Current response shape:**
```typescript
{ id, username, role, fullName, initials, activeProjectId, mustChangePassword }
```

**New response shape:**
```typescript
{
  id, username, role, fullName, initials,
  activeProjectId, mustChangePassword,
  companyId: string | null,       // null for GOD only
  companyName: string | null,     // null for GOD only
  activeCompanyId: string | null, // GOD's currently-selected company context (nullable)
}
```

`activeCompanyId` is a session-level variable for GOD only. It is stored in `user_preferences` (new column, see below) and allows GOD to "switch into" a company context for scoped viewing.

**`user_preferences` table addition:**

```sql
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS active_company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;
```

### 6.2 New Middleware: `requireCompanyAccess`

A new middleware function must be added to `server/authz.ts`. This is the primary enforcement point for company-level isolation.

```typescript
/**
 * Resolves the company_id for the target resource (project or direct company param)
 * and verifies the requesting user belongs to that company.
 * GOD bypasses all checks.
 * ADMIN is allowed only if their company_id matches the resource's company_id.
 * SUPERVISOR and DIVER are allowed only if they are project members AND
 * the project belongs to their company.
 */
export function requireCompanyAccess(paramName = "projectId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // GOD has unrestricted access
    if (user.role === "GOD") return next();

    const projectId = req.params[paramName];
    if (!projectId) return res.status(400).json({ message: "Missing project ID" });

    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Enforce company boundary
    if (project.companyId !== user.companyId) {
      return res.status(403).json({ message: "Forbidden: project belongs to a different company" });
    }

    // ADMIN: company match is sufficient
    if (user.role === "ADMIN") return next();

    // SUPERVISOR / DIVER: must also be a project member
    const members = await storage.getProjectMembers(projectId);
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember) return res.status(403).json({ message: "Not a member of this project" });

    next();
  };
}
```

### 6.3 Modified Middleware: `requireProjectAccess`

The existing `requireProjectAccess` in `server/authz.ts` must be updated to call `requireCompanyAccess` internally, or replaced entirely. The current bypass for `ADMIN` must be removed:

```typescript
// BEFORE (insecure — ADMIN bypasses all checks)
if (isAdminOrGod(user.role)) return next();

// AFTER (ADMIN is checked against company boundary)
if (user.role === "GOD") return next();
// Fall through to company check for ADMIN
```

### 6.4 Modified Middleware: `requireRole`

The `requireRole` middleware in `server/auth.ts` does not need structural changes. However, all call sites that use `requireRole("ADMIN", "GOD")` for user and project management routes must be audited to ensure that the subsequent `requireCompanyAccess` middleware is also applied in the middleware chain.

### 6.5 New Middleware: `requireGod`

A dedicated middleware for GOD-only routes (company creation, system-wide audit, feature flags) to make intent explicit:

```typescript
export function requireGod(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  if ((req.user as User).role !== "GOD") return res.status(403).json({ message: "Forbidden: GOD only" });
  next();
}
```

### 6.6 Company Context Injection for GOD

When GOD switches company context via the UI (see Section 8.1), the selected `activeCompanyId` is stored in `user_preferences`. All storage layer queries that currently call `storage.getAllProjects()` for GOD must be updated to optionally filter by `activeCompanyId` when it is set, enabling GOD to "act as" a company admin for scoped views without losing global access.

### 6.7 Audit Context Extension

`server/audit.ts` `AuditContext` must include `companyId`:

```typescript
export interface AuditContext {
  correlationId: string;
  userId?: string;
  userRole?: UserRole;
  companyId?: string;   // NEW
  projectId?: string;
  dayId?: string;
  ipAddress?: string;
}
```

The `emitAuditEvent` call in the request middleware (`server/routes.ts` lines 145–157) must be updated to populate `companyId` from `req.user.companyId`.

---

## 7. API Route Changes

### 7.1 New Routes

#### Company Management (GOD only)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/companies` | GOD | List all companies with member counts |
| `POST` | `/api/companies` | GOD | Create a new company |
| `PATCH` | `/api/companies/:companyId` | GOD | Update company name / logo |
| `DELETE` | `/api/companies/:companyId` | GOD | Soft-delete company (requires no active projects) |
| `GET` | `/api/companies/:companyId/members` | GOD, ADMIN (own company) | List all users in a company |
| `POST` | `/api/companies/:companyId/members` | GOD | Add a user to a company, assign company role |
| `DELETE` | `/api/companies/:companyId/members/:userId` | GOD | Remove user from company |
| `POST` | `/api/companies/:companyId/activate` | GOD | Set GOD's active company context |

#### Company-Scoped User Creation (ADMIN)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/companies/:companyId/users` | GOD, ADMIN (own company) | Create a user within a specific company |

### 7.2 Modified Routes

#### `GET /api/projects`

**Current behavior:** GOD sees all projects; others see only their `project_members` entries.

**New behavior:**
- GOD with no `activeCompanyId` set: returns all projects across all companies (aggregated view).
- GOD with `activeCompanyId` set: returns only projects belonging to the active company.
- ADMIN: returns only projects where `projects.company_id = user.companyId`.
- SUPERVISOR / DIVER: returns only projects where user is a `project_members` entry AND `projects.company_id = user.companyId`.

```typescript
// Pseudocode for new GET /api/projects handler
if (user.role === "GOD") {
  const prefs = await storage.getUserPreferences(user.id);
  if (prefs?.activeCompanyId) {
    return res.json(await storage.getProjectsByCompany(prefs.activeCompanyId));
  }
  return res.json(await storage.getAllProjects()); // aggregated
}
if (user.role === "ADMIN") {
  return res.json(await storage.getProjectsByCompany(user.companyId));
}
// SUPERVISOR / DIVER
return res.json(await storage.getUserProjectsInCompany(user.id, user.companyId));
```

#### `POST /api/projects`

**Current behavior:** Any `ADMIN` or `GOD` can create a project.

**New behavior:**
- GOD: must supply `companyId` in request body; project is created under that company.
- ADMIN: `companyId` is automatically set to `user.companyId`; body-supplied `companyId` is ignored.

```typescript
const companyId = user.role === "GOD"
  ? req.body.companyId   // required for GOD
  : user.companyId;      // forced for ADMIN
if (!companyId) return res.status(400).json({ message: "companyId is required" });
```

#### `GET /api/users` and `POST /api/users`

**Current behavior:** Any `ADMIN` or `GOD` can list/create all users system-wide.

**New behavior:**
- GOD: lists all users across all companies (or filtered by `activeCompanyId`).
- ADMIN: lists only users where `users.company_id = user.companyId`.
- `POST /api/users` for ADMIN: created user is automatically assigned `company_id = user.companyId`.
- ADMIN cannot assign the `GOD` role; attempting to do so returns `403`.

#### `GET /api/admin/users`

Same scoping as `GET /api/users` above. The paginated admin user list must be filtered by company for ADMIN users.

#### `GET /api/projects/:projectId/members` and `POST /api/projects/:projectId/members`

**New behavior:** Before adding a member to a project, the system must verify that the target user's `company_id` matches the project's `company_id`. Cross-company membership is forbidden.

```typescript
// Validation before addProjectMember
const targetUser = await storage.getUser(req.body.userId);
if (targetUser.companyId !== project.companyId) {
  return res.status(403).json({
    message: "Cannot add a user from a different company to this project"
  });
}
```

#### `GET /api/audit-events`

**Current behavior:** GOD-only; returns all audit events.

**New behavior:**
- GOD: returns all audit events (unchanged).
- ADMIN: returns only audit events where `audit_events.company_id = user.companyId`.
- Route guard changes from `requireRole("GOD")` to `requireRole("GOD", "ADMIN")`.

#### `GET /api/dashboard/stats` and related dashboard routes

All dashboard routes that call `storage.getAllProjects()` as a fallback must be updated to use `storage.getProjectsByCompany(user.companyId)` for non-GOD users.

### 7.3 Routes Requiring No Changes (Transitively Scoped)

The following routes already enforce access via `requireProjectAccess()` or `requireDayAccess()`. Once those middleware functions are updated (Section 6.2–6.3), these routes are automatically company-scoped without further modification.

`/api/projects/:projectId/days`, `/api/days/:id`, `/api/log-events/*`, `/api/dives/*`, `/api/risks/*`, `/api/safety/*`, `/api/analytics/*`, `/api/certifications/*`, `/api/library/*`, `/api/dive-plan/*`

### 7.4 Storage Layer Additions

The following new methods must be added to `IStorage` in `server/storage.ts`:

```typescript
// Company management
getCompany(companyId: string): Promise<Company | undefined>;
getAllCompanies(): Promise<Company[]>;
createCompany(company: InsertCompany): Promise<Company>;
updateCompany(companyId: string, updates: Partial<InsertCompany>): Promise<Company | undefined>;

// Company-scoped project queries
getProjectsByCompany(companyId: string): Promise<Project[]>;
getUserProjectsInCompany(userId: string, companyId: string): Promise<Project[]>;

// Company member management
getCompanyMembers(companyId: string): Promise<CompanyMember[]>;
addCompanyMember(member: InsertCompanyMember): Promise<CompanyMember>;
removeCompanyMember(companyId: string, userId: string): Promise<boolean>;

// Company-scoped user queries
getUsersByCompany(companyId: string): Promise<User[]>;
listUsersForAdmin(requestingUserId: string): Promise<User[]>; // company-filtered for ADMIN
```

---

## 8. Frontend UI Changes

### 8.1 GOD: Company Context Switcher

GOD requires a persistent company context switcher in the application header. This allows Skyler to toggle between "All Companies" (aggregated view) and a specific company's scoped view.

**Location:** Header bar, between the DiveOps logo and the date display.

**Component:** `<CompanyContextSwitcher />` — rendered only when `user.role === "GOD"`.

**Behavior:**
- Displays a dropdown with options: "All Companies" + one entry per company.
- Selecting a company calls `POST /api/companies/:companyId/activate`, which persists the selection to `user_preferences.active_company_id`.
- Selecting "All Companies" clears `active_company_id`.
- On selection, invalidates all React Query caches: `["projects"]`, `["users"]`, `["audit-events"]`, `["dashboard"]`.
- The currently selected company name is displayed prominently (e.g., "Viewing: SEA Engineering" badge).

**State management:** The selected company context is stored server-side in `user_preferences` and loaded as part of `GET /api/auth/me`. The `useAuth` hook must expose `activeCompanyId` and `activeCompanyName`.

### 8.2 `useAuth` Hook Extension

```typescript
interface User {
  // ... existing fields ...
  companyId: string | null;
  companyName: string | null;
  activeCompanyId: string | null;   // GOD only — currently-selected company context
}

interface AuthContextType {
  // ... existing fields ...
  companyId: string | null;
  companyName: string | null;
  activeCompanyId: string | null;
  setActiveCompany: (companyId: string | null) => Promise<void>;
}
```

### 8.3 Admin Tab Changes

The Admin tab (`client/src/components/tabs/admin.tsx`) must be restructured to reflect company-scoped administration.

**For ADMIN users:**
- The "Users" sub-tab shows only users in their company.
- The "Create User" form does not show a `companyId` field (automatically assigned).
- The role selector in "Create User" must exclude `GOD`.
- The "Projects" sub-tab shows only their company's projects.
- A new "Company Info" sub-tab shows the company name, logo, and member list (read-only for ADMIN, editable for GOD).

**For GOD users:**
- A new top-level "Companies" sub-tab is added, showing all companies with member counts and project counts.
- GOD can create new companies, assign company admins, and view cross-company analytics from this tab.
- The existing "Users" and "Projects" sub-tabs respect the active company context from the switcher.

### 8.4 Project Switcher Changes

The project switcher (currently in `use-project.tsx` and rendered in `console-layout.tsx`) must be updated to only show projects belonging to the user's company (or GOD's active company context).

No structural change to the switcher component is required — the scoping is handled server-side by the updated `GET /api/projects` route.

### 8.5 `useProject` Hook Extension

```typescript
interface ProjectContextType {
  // ... existing fields ...
  activeCompanyId: string | null;   // mirrors auth context
}
```

The `ProjectProvider` must pass `activeCompanyId` through context so that child components can conditionally render company-specific UI elements.

### 8.6 Company Badge in Header

For non-GOD users, a read-only company badge should be displayed in the header alongside the existing role badge:

```
[S. Pittman] [System Admin]                    ← GOD (no company badge)
[J. Spurlock] [Administrator] [SEA Engineering] ← ADMIN
[J. Feyers]   [Supervisor]    [Army Dive Locker] ← SUPERVISOR
```

### 8.7 Cross-Company Data Leakage Guards

The following frontend components currently fetch data that may inadvertently expose cross-company information. Each must be audited and updated to use the company-scoped API responses:

| Component | Risk | Fix |
|---|---|---|
| `AdminTab` — user list | Lists all users | Server-side scoping (Section 7.2) |
| `AdminTab` — project list | Lists all projects | Server-side scoping (Section 7.2) |
| `CertificationsTab` | Lists all diver certs | Server-side scoping via `company_id` filter |
| `DashboardTab` — stats | Falls back to `getAllProjects` | Updated fallback (Section 7.2) |
| `DivePlanTab` — template list | Global templates are fine; project plans must be scoped | Server-side scoping |

---

## 9. Rollback Plan

### 9.1 Pre-Migration Snapshot

Before executing the migration, a full point-in-time snapshot of the Azure Database for PostgreSQL Flexible Server must be taken. Azure retains automated backups for 7 days by default; a manual backup should be triggered immediately before the migration window.

```bash
az postgres flexible-server backup create \
  --resource-group <rg-name> \
  --name <db-server-name> \
  --backup-name "pre-multitenant-migration-$(date +%Y%m%d)"
```

### 9.2 Application-Level Rollback

The migration is designed to be additive (new columns, new table). The application code change is the primary rollback surface. A feature flag `multiTenantOrg` should be added to the existing `server/feature-flags.ts` system:

```typescript
export interface FeatureFlags {
  // ... existing flags ...
  multiTenantOrg: boolean;  // NEW — gates all org-scoped middleware
}

const defaults: FeatureFlags = {
  // ... existing defaults ...
  multiTenantOrg: false,  // OFF by default; enabled explicitly after migration
};
```

When `multiTenantOrg` is `false`, the existing flat-access behavior is preserved. When `true`, the new company-scoped middleware is active. This allows a hot rollback without a database restore: set the flag to `false` via `POST /api/admin/feature-flags` and redeploy the previous container image.

### 9.3 Database Rollback Script

If a full database rollback is required (e.g., data integrity issues discovered post-migration), the following script reverses all schema changes:

```sql
-- Rollback script: 0013_multi_tenant_org_rollback.sql
BEGIN;

DROP TABLE IF EXISTS company_members;

ALTER TABLE users DROP COLUMN IF EXISTS company_id;
ALTER TABLE projects DROP COLUMN IF EXISTS company_id;
ALTER TABLE audit_events DROP COLUMN IF EXISTS company_id;
ALTER TABLE diver_certifications DROP COLUMN IF EXISTS company_id;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS active_company_id;

DROP INDEX IF EXISTS idx_users_company_id;
DROP INDEX IF EXISTS idx_projects_company_id;
DROP INDEX IF EXISTS idx_audit_events_company_id;
DROP INDEX IF EXISTS idx_diver_certs_company_id;
DROP INDEX IF EXISTS idx_company_members_user_id;

COMMIT;
```

> **Warning:** The rollback script does not remove the three seed companies from the `companies` table, as that table pre-existed this migration. The `companies` rows are harmless if left in place.

### 9.4 Rollback Decision Criteria

A rollback should be triggered if any of the following conditions are observed within 24 hours of production deployment:

- Any user can access another company's projects or data (cross-tenant data leak).
- GOD cannot access all companies' data.
- Any company's ADMIN cannot create projects or users within their company.
- Authentication failure rate exceeds 1% of login attempts.
- Any database query error rate exceeds baseline by more than 5%.

---

## 10. Testing Strategy

### 10.1 Unit Tests

Unit tests must cover the new and modified middleware functions in isolation, using mocked storage and request objects.

| Test Case | File | Expected Outcome |
|---|---|---|
| `requireCompanyAccess` — GOD bypasses | `authz.test.ts` | `next()` called |
| `requireCompanyAccess` — ADMIN same company | `authz.test.ts` | `next()` called |
| `requireCompanyAccess` — ADMIN different company | `authz.test.ts` | `403 Forbidden` |
| `requireCompanyAccess` — SUPERVISOR project member same company | `authz.test.ts` | `next()` called |
| `requireCompanyAccess` — SUPERVISOR not a project member | `authz.test.ts` | `403 Forbidden` |
| `requireCompanyAccess` — DIVER different company project | `authz.test.ts` | `403 Forbidden` |
| `requireGod` — GOD user | `auth.test.ts` | `next()` called |
| `requireGod` — ADMIN user | `auth.test.ts` | `403 Forbidden` |

### 10.2 Integration Tests

Integration tests must run against a test database seeded with all three companies and their respective users and projects.

**Seed fixture for integration tests:**

```typescript
// test/fixtures/multi-tenant.ts
export const TEST_COMPANIES = {
  sei: { companyId: 'test-sei-uuid', companyName: 'SEA Engineering' },
  adl: { companyId: 'test-adl-uuid', companyName: 'Army Dive Locker' },
  cbd: { companyId: 'test-cbd-uuid', companyName: 'Chesapeake Bay Diving' },
};

export const TEST_USERS = {
  god: { username: 'skyler', role: 'GOD', companyId: null },
  seiAdmin: { username: 'jspurlock', role: 'ADMIN', companyId: 'test-sei-uuid' },
  adlSupervisor: { username: 'jfeyers', role: 'SUPERVISOR', companyId: 'test-adl-uuid' },
  cbdDiver: { username: 'baker', role: 'DIVER', companyId: 'test-cbd-uuid' },
};
```

**Critical integration test scenarios:**

| Scenario | Actor | Action | Expected Result |
|---|---|---|---|
| Cross-company project access | SEI Admin | `GET /api/projects/:adl-project-id` | `403 Forbidden` |
| Cross-company user creation | SEI Admin | `POST /api/users` with `companyId = adl` | User created under SEI, `adl` companyId ignored |
| Cross-company member add | SEI Admin | Add ADL user to SEI project | `403 Forbidden` |
| GOD aggregated project list | GOD | `GET /api/projects` (no active company) | All projects from all companies |
| GOD scoped project list | GOD | `GET /api/projects` (activeCompanyId = SEI) | Only SEI projects |
| GOD company switch | GOD | `POST /api/companies/:sei/activate` | `user_preferences.active_company_id` updated |
| ADMIN creates project | SEI Admin | `POST /api/projects` | Project created with `company_id = SEI` |
| SUPERVISOR project toggle | ADL Supervisor | `GET /api/projects` | Only ADL projects where supervisor is a member |
| Audit trail scoping | SEI Admin | `GET /api/audit-events` | Only SEI audit events |
| Certification scoping | CBD Admin | `GET /api/certifications` | Only CBD users' certifications |

### 10.3 End-to-End Tests

E2E tests should be added to the existing Playwright/Cypress test suite (if present) or written as manual test scripts. The following flows must be validated in a staging environment with real browser sessions:

1. **GOD company switcher flow:** Log in as GOD → switch to "SEA Engineering" → verify only SEI projects appear → switch to "All Companies" → verify all projects appear.
2. **ADMIN onboarding flow:** Log in as SEI Admin → create a new project → create a new user → assign user to project → verify user can log in and sees only SEI data.
3. **Cross-company isolation check:** Log in as ADL Supervisor → attempt to navigate to a known SEI project URL → verify `403` or redirect.
4. **DIVER limited access:** Log in as CBD Diver → verify no Admin tab → verify only assigned projects visible.

### 10.4 Regression Tests

All existing tests must continue to pass after the migration. The key regression risk areas are:

- `GET /api/projects` returning the correct project list for each role.
- `requireProjectAccess` still correctly blocking non-members.
- Dashboard stats loading correctly for all roles.
- Audit event emission still working for all actions.

---

## 11. Estimated Effort & Timeline

### 11.1 Work Breakdown

| Phase | Task | Estimated Effort |
|---|---|---|
| **DB** | Write migration SQL (`0013_multi_tenant_org.sql`) | 0.5 days |
| **DB** | Confirm user/project mapping with Skyler, execute migration in staging | 0.5 days |
| **Backend** | Add `company_id` to `users` and `projects` Drizzle schema | 0.5 days |
| **Backend** | Add `company_members` table and Drizzle schema | 0.5 days |
| **Backend** | Implement `requireCompanyAccess` and `requireGod` middleware | 1 day |
| **Backend** | Update `requireProjectAccess` and `requireDayAccess` | 0.5 days |
| **Backend** | Add company management routes (`/api/companies/*`) | 1 day |
| **Backend** | Update `GET /api/projects`, `POST /api/projects` | 0.5 days |
| **Backend** | Update `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` | 0.5 days |
| **Backend** | Update `GET /api/audit-events` scoping | 0.5 days |
| **Backend** | Update `GET /api/dashboard/*` fallback scoping | 0.5 days |
| **Backend** | Add `multiTenantOrg` feature flag | 0.25 days |
| **Backend** | Add storage layer methods (`getProjectsByCompany`, etc.) | 1 day |
| **Backend** | Extend `AuditContext` with `companyId` | 0.25 days |
| **Frontend** | Extend `useAuth` hook with company fields | 0.5 days |
| **Frontend** | Build `<CompanyContextSwitcher />` component for GOD | 1 day |
| **Frontend** | Update `console-layout.tsx` header (company badge, switcher) | 0.5 days |
| **Frontend** | Update Admin tab (company-scoped user/project lists, new Companies sub-tab) | 2 days |
| **Frontend** | Audit and fix cross-company data leakage in all tabs | 1 day |
| **Testing** | Write unit tests for new middleware | 1 day |
| **Testing** | Write integration test fixtures and scenarios | 1.5 days |
| **Testing** | E2E testing in staging with all three company logins | 1 day |
| **Testing** | Regression test pass | 0.5 days |
| **Ops** | Pre-migration backup, staging migration run | 0.5 days |
| **Ops** | Production migration window, smoke test | 0.5 days |
| **Ops** | Post-deployment monitoring (24h) | 0.25 days |

### 11.2 Summary Timeline

| Week | Focus | Deliverables |
|---|---|---|
| Week 1 | Database + Backend core | Migration SQL, schema changes, new middleware, company routes |
| Week 2 | Backend route updates + Storage layer | All modified routes, storage methods, feature flag |
| Week 3 | Frontend + Testing | Company switcher, Admin tab updates, unit + integration tests |
| Week 4 | Staging validation + Production deployment | E2E tests, staging migration, production deployment, monitoring |

**Total estimated effort:** ~18 developer-days (approximately 3.5–4 calendar weeks for a single developer, or 2 weeks with two developers working in parallel on backend and frontend).

---

## 12. Open Questions & Risks

### 12.1 Open Questions

| # | Question | Owner | Priority |
|---|---|---|---|
| OQ-1 | What are the exact usernames for all personnel in the live database? Required before migration Step 3. | Skyler | **Critical** |
| OQ-2 | Which existing projects belong to which company? Required before migration Step 6. | Skyler | **Critical** |
| OQ-3 | Should GOD be able to create projects directly (bypassing the company admin layer), or must all project creation go through a company admin? | Skyler | High |
| OQ-4 | Should ADMIN users be able to see the full audit trail for their company, or only their own actions? | Skyler | Medium |
| OQ-5 | Is there a need for users to belong to multiple companies (e.g., a contractor who works for both SEI and CBD)? If yes, the `users.company_id` single-column approach must be replaced with a many-to-many model. | Skyler | Medium |
| OQ-6 | Should the `conversations` (AI assistant) table be company-scoped? Currently it is user-scoped via `userId`. | Skyler | Low |
| OQ-7 | Should `directory_facilities` (hyperbaric chambers) remain global, or should companies maintain their own verified lists? | Skyler | Low |

### 12.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Incorrect user-to-company mapping in migration | Medium | High | Human sign-off on mapping before execution; run in staging first |
| ADMIN users losing access to projects they currently manage | Medium | High | Verify all project memberships are preserved; test all ADMIN logins in staging |
| GOD's aggregated dashboard breaking due to scoping changes | Low | High | Feature flag allows instant rollback; test GOD view explicitly |
| Cross-company data leak via a missed route | Medium | Critical | Systematic route audit checklist; integration test for every cross-company scenario |
| Performance regression from additional `company_id` joins | Low | Medium | Indexes on all `company_id` columns; query plan analysis in staging |
| Session cache serving stale company context after migration | Low | Medium | Force session invalidation / re-login for all users after migration |

### 12.3 Future Considerations (Out of Scope for This Spec)

The following items are intentionally deferred and should be addressed in subsequent specifications:

- **PostgreSQL Row-Level Security (RLS):** Enforcing tenant isolation at the database level as a defense-in-depth measure, in addition to the application-layer enforcement specified here.
- **Company-level feature flags:** Allowing individual companies to enable/disable features independently (e.g., AI processing, safety tab).
- **Cross-company GOD analytics dashboard:** A dedicated aggregated analytics view for GOD showing KPIs across all companies simultaneously.
- **Company logo upload:** The `companies.logo_asset_key` column exists but is not yet wired to the Azure Blob Storage upload pipeline.
- **Invitation-based user onboarding:** Replacing the current "admin creates user, shares temp password" flow with an email invitation link scoped to a company.

---

*End of Specification — SPEC-ORG-001 v1.0.0*
