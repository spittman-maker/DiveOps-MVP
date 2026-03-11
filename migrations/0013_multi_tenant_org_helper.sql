-- Migration Helper: 0013_multi_tenant_org_helper.sql
-- Run this AFTER confirming user-to-company and project-to-company mappings.
-- DO NOT run this automatically — requires human sign-off on the mappings below.
--
-- Usage:
--   1. Review and adjust the username-to-company mappings below
--   2. Review and adjust the project-to-company mappings below
--   3. Run in staging first, verify row counts
--   4. Run in production inside a transaction

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Assign users to companies by username
-- ═══════════════════════════════════════════════════════════════════
-- NOTE: Verify these usernames against the live users table before running.
-- Skyler (GOD) intentionally stays NULL — company-agnostic.

-- SEA Engineering (SEI)
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE username IN ('jspurlock', 'djohnston', 'cgarcia')
  AND company_id IS NULL;

-- Army Dive Locker (ADL)
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000002'
WHERE username IN ('jfeyers')
  AND company_id IS NULL;

-- Chesapeake Bay Diving (CBD)
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000003'
WHERE username IN ('baker', 'mdorn', 'aaddison', 'jmorris')
  AND company_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Populate company_members from users
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO company_members (company_id, user_id, company_role)
SELECT company_id, id, role
FROM users
WHERE company_id IS NOT NULL
  AND role IN ('ADMIN', 'SUPERVISOR', 'DIVER')
ON CONFLICT (company_id, user_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: Assign projects to companies
-- ═══════════════════════════════════════════════════════════════════
-- IMPORTANT: Review this mapping carefully. This example assigns all
-- unassigned projects to SEA Engineering as a default.
-- Adjust per actual project ownership before running.

-- UPDATE projects
-- SET company_id = '00000000-0000-0000-0000-000000000001'
-- WHERE company_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Verify no NULL company_id remains on projects
-- ═══════════════════════════════════════════════════════════════════
-- Uncomment the block below ONLY after all projects have been assigned.

-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM projects WHERE company_id IS NULL) THEN
--     RAISE EXCEPTION 'Migration aborted: projects with NULL company_id exist';
--   END IF;
-- END $$;
-- ALTER TABLE projects ALTER COLUMN company_id SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 5: Backfill audit_events.company_id from projects
-- ═══════════════════════════════════════════════════════════════════
UPDATE audit_events ae
SET company_id = p.company_id
FROM projects p
WHERE ae.project_id = p.id
  AND ae.company_id IS NULL
  AND p.company_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 6: Backfill diver_certifications.company_id from users
-- ═══════════════════════════════════════════════════════════════════
UPDATE diver_certifications dc
SET company_id = u.company_id
FROM users u
WHERE dc.user_id = u.id
  AND dc.company_id IS NULL
  AND u.company_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after migration to confirm counts)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT company_id, COUNT(*) FROM users GROUP BY company_id;
-- SELECT company_id, COUNT(*) FROM projects GROUP BY company_id;
-- SELECT company_id, COUNT(*) FROM company_members GROUP BY company_id;
-- SELECT COUNT(*) FROM users WHERE company_id IS NULL AND role != 'GOD';
-- SELECT COUNT(*) FROM projects WHERE company_id IS NULL;

COMMIT;
