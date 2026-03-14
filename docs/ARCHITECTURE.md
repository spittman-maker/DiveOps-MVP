# DiveOps MVP — Architecture Target

This document defines the target architecture for DiveOps MVP. All code changes must conform to these rules. Do not drift from this structure.

---

## Layers

| Layer | Location | Responsibility | May depend on |
|---|---|---|---|
| **Routes** | `server/routes/*.router.ts` | HTTP only: parse request, call middleware, call service, send response | middleware, services, shared |
| **Middleware** | `server/middleware/`, `server/auth.ts`, `server/authz.ts` | Auth, authz, validation, rate limiting, correlation IDs | shared, storage (for access checks only) |
| **Services** | `server/services/*.service.ts` | Business logic, workflow orchestration, domain rules | repositories/storage, shared |
| **Repositories** | `server/repositories/*.repository.ts`, `server/storage.ts` | DB access only: queries, mutations, transactions | shared (schema) |
| **Shared** | `shared/` | Schemas, types, contracts, constants — source of truth for data shape | nothing |
| **Client** | `client/` | UI rendering, user interaction — no hidden business rules | shared (types only) |

---

## Invariant Rules

These rules are non-negotiable. Every PR must satisfy all five.

### 1. Route files never contain business logic

Route handlers do exactly three things:

1. Extract validated input (from middleware)
2. Call a service function
3. Send the response

No conditionals that encode domain policy. No multi-step workflows. No data transformation beyond serialization.

### 2. Services never touch `req` or `res`

Service functions accept typed inputs and return typed results. They throw domain errors, not HTTP errors. They have no knowledge of Express, headers, cookies, or sessions.

### 3. DB queries do not live in route handlers

All database access goes through repository/storage functions. Route handlers never import `db`, `drizzle`, or execute queries directly.

### 4. Authorization is enforced before handlers run

Auth and authz middleware is applied at the router level — not checked inside individual handler functions. The middleware chain for any protected route is:

```
router.use(requireAuth)
router.use(requireProjectAccess())  // if project-scoped
router.get('/:id', validate(schema), handler)
```

An engineer must work hard to accidentally bypass access control.

### 5. Shared schemas are the source of truth for request/response shape

All request validation schemas and response types are defined in `shared/` or co-located schema files derived from the shared schema. No ad-hoc inline object shapes in route handlers.

---

## Domain Boundaries

Each domain owns its own router, service, and repository. Domains do not reach into each other's storage directly — they call each other's services when cross-domain coordination is needed.

| Domain | Router | Service | Key entities |
|---|---|---|---|
| Auth | `auth.router.ts` | `auth.service.ts` | users, sessions, passwords |
| Projects | `projects.router.ts` | `project.service.ts` | projects, members, work selections |
| Days | `days.router.ts` | `day.service.ts` | operational days, closeout |
| Log Events | `log-events.router.ts` | `log-event.service.ts` | log events, extraction |
| Dives | `dives.router.ts` | `dive.service.ts` | dives, confirmations, tables |
| Risks | `risks.router.ts` | `risk.service.ts` | risk items |
| Dive Plans | `dive-plans.router.ts` | `dive-plan.service.ts` | dive plans, stations, project plans |
| Certifications | `certifications.router.ts` | `certification.service.ts` | diver certs, equipment certs |
| Companies | `companies.router.ts` | `company.service.ts` | companies, members, roles |
| Safety | `safety.router.ts` | (existing safety modules) | checklists, JHA, meetings, near-miss |
| Exports | `exports.router.ts` | `export.service.ts` | master log, summary, documents |
| Admin | `admin.router.ts` | `admin.service.ts` | bootstrap, seed, feature flags |
| Library | `library.router.ts` | `library.service.ts` | work library, SOPs, templates, docs |
| Dashboard | `dashboard.router.ts` | — | layout, stats, recent activity |
| Facilities | `facilities.router.ts` | — | chambers, geocode |
| Weather | `weather.router.ts` | — | weather, lightning, radar |

---

## Request Processing Order

Every API request follows this sequence:

```
1. Rate limiting
2. Correlation ID assignment
3. Authentication (requireAuth)
4. Authorization (requireRole / requireProjectAccess / requireDayAccess)
5. Input validation (validate middleware)
6. Handler runs (calls service)
7. Audit event emitted (for state-changing operations)
8. Response sent
```

---

## Error Response Contract

All API errors use a consistent shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "correlationId": "req-abc123",
  "details": []
}
```

- `400` — Validation failure (details contains field-level errors)
- `401` — Not authenticated
- `403` — Not authorized
- `404` — Resource not found
- `409` — Conflict (optimistic concurrency, duplicate)
- `500` — Internal server error (correlation ID for debugging)

---

## File Size Discipline

- No single file above 500 lines without explicit justification
- Route files: pure HTTP glue, typically 50–200 lines
- Service files: domain logic, typically 100–400 lines
- Repository files: queries only, typically 50–300 lines

---

## What This Document Is Not

This document does not prescribe UI design, database schema changes, or feature priorities. It defines how code is organized so that changes in one layer do not cascade unpredictably into others.
