# DiveOps MVP — Operator Runbooks

Concise runbooks for common operational tasks. Each runbook is 5-10 steps max.

---

## 1. Deploy (Azure Container Apps)

**When:** Deploying a new release to production.

1. Ensure all tests pass locally: `npm test`
2. Build the Docker image:
   ```bash
   docker build -t diveops-mvp:$(git rev-parse --short HEAD) .
   ```
3. Tag and push to Azure Container Registry:
   ```bash
   az acr login --name <registry-name>
   docker tag diveops-mvp:$(git rev-parse --short HEAD) <registry-name>.azurecr.io/diveops-mvp:$(git rev-parse --short HEAD)
   docker push <registry-name>.azurecr.io/diveops-mvp:$(git rev-parse --short HEAD)
   ```
4. Update the Container App revision:
   ```bash
   az containerapp update \
     --name diveops-mvp \
     --resource-group <rg-name> \
     --image <registry-name>.azurecr.io/diveops-mvp:$(git rev-parse --short HEAD)
   ```
5. Verify the health check passes:
   ```bash
   curl -f https://<app-url>/api/health
   ```
6. Monitor logs for startup errors:
   ```bash
   az containerapp logs show --name diveops-mvp --resource-group <rg-name> --follow
   ```

---

## 2. Rollback

**When:** A deployment introduces a regression or crash.

1. Identify the last known good revision:
   ```bash
   az containerapp revision list --name diveops-mvp --resource-group <rg-name> -o table
   ```
2. Activate the previous revision:
   ```bash
   az containerapp revision activate \
     --name diveops-mvp \
     --resource-group <rg-name> \
     --revision <previous-revision-name>
   ```
3. Route 100% traffic to the stable revision:
   ```bash
   az containerapp ingress traffic set \
     --name diveops-mvp \
     --resource-group <rg-name> \
     --revision-weight <previous-revision-name>=100
   ```
4. Deactivate the broken revision:
   ```bash
   az containerapp revision deactivate \
     --name diveops-mvp \
     --resource-group <rg-name> \
     --revision <broken-revision-name>
   ```
5. Verify health: `curl -f https://<app-url>/api/health`
6. Investigate the root cause in the broken revision's logs before re-deploying.

---

## 3. Running Migrations

**When:** Schema changes need to be applied to the database.

DiveOps uses Drizzle Kit with `push` (not file-based migrations).

1. Ensure `DATABASE_URL` is set to the target database.
2. Review pending schema changes:
   ```bash
   npx drizzle-kit push --dry-run
   ```
3. **Take a database backup before pushing to production:**
   ```bash
   pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
   ```
4. Apply the schema changes:
   ```bash
   npm run db:push
   ```
5. Verify the schema was applied correctly:
   ```bash
   psql "$DATABASE_URL" -c "\dt"
   ```
6. If something went wrong, restore from backup:
   ```bash
   psql "$DATABASE_URL" < backup_<timestamp>.sql
   ```
7. Deploy the application code that matches the new schema.

**Important:** Always push schema changes _before_ deploying the application code that depends on them.

---

## 4. Login / Session Issues

**When:** Users report they cannot log in or are being logged out unexpectedly.

1. Check if the application is running:
   ```bash
   curl -f https://<app-url>/api/health
   ```
2. Verify the `SESSION_SECRET` environment variable is set and consistent across all replicas.
3. Check that the `session` table exists in PostgreSQL:
   ```bash
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM session;"
   ```
4. If the session table is missing, the app creates it from `connect-pg-simple/table.sql` (copied to `dist/table.sql` during build). Re-deploy if needed.
5. Check for expired or corrupt sessions:
   ```bash
   psql "$DATABASE_URL" -c "SELECT sid, expire FROM session ORDER BY expire DESC LIMIT 10;"
   ```
6. If a specific user cannot log in, verify their account exists and password is valid:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, username, role, must_change_password FROM users WHERE username = '<username>';"
   ```
7. Check audit events for failed login attempts:
   ```bash
   psql "$DATABASE_URL" -c "SELECT * FROM audit_events WHERE action = 'auth.login_failed' ORDER BY timestamp DESC LIMIT 10;"
   ```
8. If `mustChangePassword` is `true`, the user must change their password on next login — this is expected behavior, not a bug.

---

## 5. Permission Issues

**When:** Users report `403 Forbidden` errors on operations they believe they should have access to.

1. Identify the user's role:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, username, role, company_id FROM users WHERE username = '<username>';"
   ```
2. Check project membership:
   ```bash
   psql "$DATABASE_URL" -c "SELECT * FROM project_members WHERE user_id = '<user-id>';"
   ```
3. If multi-tenant mode is enabled, verify company membership:
   ```bash
   psql "$DATABASE_URL" -c "SELECT * FROM company_members WHERE user_id = '<user-id>';"
   ```
4. Verify the user's `companyId` matches the project's `companyId`:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, name, company_id FROM projects WHERE id = '<project-id>';"
   ```
5. Check if the target day is CLOSED (non-GOD users cannot edit closed days):
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, status, closed_by, closed_at FROM days WHERE id = '<day-id>';"
   ```
6. Review the role hierarchy: `GOD > ADMIN > SUPERVISOR > DIVER`. Most write operations require SUPERVISOR or above.
7. If appropriate, update the user's role:
   ```
   PATCH /api/users/<user-id> { "role": "SUPERVISOR" }
   ```

---

## 6. Export Failures

**When:** `POST /days/:id/close-and-export` returns 500 or exports are missing.

1. Check the application logs for `"Close-and-export failed"` messages:
   ```bash
   az containerapp logs show --name diveops-mvp --resource-group <rg-name> | grep "close-and-export"
   ```
2. Verify the `exportGeneration` feature flag is enabled. If disabled, the endpoint returns `503 FEATURE_DISABLED`.
3. Verify the `closeDay` feature flag is enabled. If disabled, both close endpoints return `503 FEATURE_DISABLED`.
4. Check if the day was already closed (the endpoint returns `200` with `alreadyClosed: true` in this case — not an error).
5. Check for compliance gaps that might block closing:
   ```
   GET /api/days/<day-id>/compliance
   ```
6. If the export transaction rolled back, the day should still be open. Verify:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, status FROM days WHERE id = '<day-id>';"
   ```
7. Check if library exports exist for the day:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, file_name, doc_category, exported_at FROM library_exports WHERE day_id = '<day-id>';"
   ```
8. Retry the close-and-export operation. The transaction is idempotent — duplicate file names are skipped via unique constraint.
9. If the issue persists, try closing without export (`POST /days/:id/close`) and then manually trigger export generation.

---

## 7. Data Repair

**When:** Data needs manual correction (wrong dive times, incorrect log entries, orphaned records).

**Before any repair:** Back up the affected records and note the correlation ID for audit.

1. Identify the records to fix. Use the audit trail to understand what happened:
   ```bash
   psql "$DATABASE_URL" -c "SELECT * FROM audit_events WHERE target_id = '<record-id>' ORDER BY timestamp DESC;"
   ```
2. If the day is CLOSED, only a GOD user can make edits. Either:
   - Reopen the day via API: `POST /api/days/<day-id>/reopen` (SUPERVISOR+)
   - Make direct DB edits as GOD (last resort)
3. For log event corrections, use the API so audit trail is maintained:
   ```
   PATCH /api/log-events/<id> { "rawText": "corrected text", "editReason": "Typo correction per supervisor request" }
   ```
4. For dive record corrections:
   ```
   PATCH /api/dives/<id> { "maxDepthFsw": 45, "lsTime": "2025-01-15T14:30:00Z" }
   ```
5. For orphaned records (e.g., dives referencing a deleted day), clean up via direct SQL:
   ```bash
   psql "$DATABASE_URL" -c "DELETE FROM dives WHERE day_id NOT IN (SELECT id FROM days);"
   ```
6. After repair, verify data integrity:
   ```bash
   psql "$DATABASE_URL" -c "SELECT d.id, COUNT(le.id) as log_count, COUNT(dv.id) as dive_count FROM days d LEFT JOIN log_events le ON le.day_id = d.id LEFT JOIN dives dv ON dv.day_id = d.id WHERE d.id = '<day-id>' GROUP BY d.id;"
   ```
7. Document the repair in the audit trail. If edits were made via SQL, create a manual audit note.

**Important:** Always prefer API endpoints over direct SQL. API calls create audit events automatically.

---

## 8. Incident Triage

**When:** Something is wrong and you need to figure out what.

1. **Check health:**
   ```bash
   curl -sf https://<app-url>/api/health | jq .
   ```
2. **Check application logs** (last 100 lines, errors only):
   ```bash
   az containerapp logs show --name diveops-mvp --resource-group <rg-name> --tail 100 | grep -i "error\|fatal\|ECONNREFUSED"
   ```
3. **Check database connectivity:**
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1;"
   ```
4. **Check active revision status:**
   ```bash
   az containerapp revision list --name diveops-mvp --resource-group <rg-name> -o table
   ```
5. **Check recent audit events for anomalies** (e.g., mass deletions, unauthorized access):
   ```bash
   psql "$DATABASE_URL" -c "SELECT action, user_id, user_role, timestamp FROM audit_events ORDER BY timestamp DESC LIMIT 20;"
   ```
6. **Classify the incident:**
   - **App crash / 502**: Check container logs and revision health. Consider rollback (Runbook 2).
   - **Database unreachable**: Check Azure Database for PostgreSQL status and connection limits.
   - **Auth broken**: See Runbook 4 (Login/Session Issues).
   - **Permission errors**: See Runbook 5.
   - **Export failures**: See Runbook 6.
   - **Data corruption**: See Runbook 7 (Data Repair).
7. **If rollback is needed**, follow Runbook 2 immediately — fix forward only after stabilizing.
8. **Record the incident**: Note the timestamp, affected users, correlation IDs from logs, and resolution steps taken.
