# DiveOps MVP — Hardening Checklist

Before adding major features, every critical path must satisfy all items below.

## Per-Domain Checklist

| Domain | Access Control | Input Validated | Output Typed | State Enforced | Audited | Observable | UI Predictable | Tested |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Auth | [ ] | [ ] | [ ] | N/A | [ ] | [ ] | [ ] | [ ] |
| Projects | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Days | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Log Events | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Dives | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Risks | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Dive Plans | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Certifications | [ ] | [ ] | [ ] | N/A | [ ] | [ ] | [ ] | [ ] |
| Companies | [ ] | [ ] | [ ] | N/A | [ ] | [ ] | [ ] | [ ] |
| Safety | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Exports | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Admin | [ ] | [ ] | [ ] | N/A | [ ] | [ ] | [ ] | [ ] |

## Definitions

- **Access Control Centralized**: Auth/authz enforced at router boundary via middleware, not inside handlers.
- **Input Validated**: All params, query, and body go through `validate()` middleware with Zod schemas.
- **Output Typed**: Response shapes are defined by shared types. No ad-hoc object literals.
- **State Enforced**: Entity lifecycle transitions validated by state machine before execution.
- **Audited**: All state-changing operations emit an audit event with correlation ID.
- **Observable**: Errors include correlation IDs. Failures are logged with structured context.
- **UI Predictable**: Loading, empty, and error states are defined and rendered consistently.
- **Tested**: Happy path and at least one failure path have automated tests.

## Critical Path Review

### Authentication
- [ ] Login/logout emits audit events
- [ ] Failed login attempts are rate-limited and logged
- [ ] Password change requires current password
- [ ] Session expiry is enforced
- [ ] `mustChangePassword` flag is enforced on login

### Day Lifecycle
- [ ] Only SUPERVISOR+ can create/close/reopen days
- [ ] Closed days prevent log event and dive modifications
- [ ] Close-and-export atomically closes + generates export
- [ ] Reopen requires SUPERVISOR+ and emits audit event
- [ ] Exported days cannot be reopened without GOD

### Dive Operations
- [ ] Dive confirmation requires proper role
- [ ] Table computation validates depth and time inputs
- [ ] Dive edits on closed days are blocked
- [ ] Version conflicts are detected (optimistic concurrency)

### Risk Management
- [ ] Risk ID generation handles collisions (retry logic)
- [ ] Risk status transitions are validated
- [ ] Risk updates include edit reason (audit trail)

### Export/Document Generation
- [ ] Export only succeeds when day is in correct state
- [ ] Export failures are logged with correlation ID
- [ ] Generated documents reference source data version

### Admin Operations
- [ ] Bootstrap endpoint is localhost-only and single-use
- [ ] Seed endpoint is blocked in production
- [ ] Migration endpoint is GOD-only
- [ ] User creation by ADMIN cannot escalate to GOD role

### Multi-Tenant Isolation
- [ ] Company boundary enforced on all project-scoped endpoints
- [ ] ADMIN users only see their company's data
- [ ] GOD users can switch company context
- [ ] Feature flag gate correctly enables/disables multi-tenant checks
