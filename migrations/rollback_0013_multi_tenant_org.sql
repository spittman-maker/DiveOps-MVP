-- Rollback script: 0013_multi_tenant_org_rollback.sql
-- Reverses all schema changes from the multi-tenant org migration.
-- Does NOT remove the three seed companies from the companies table (pre-existing).

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
