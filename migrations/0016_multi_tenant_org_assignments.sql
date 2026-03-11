-- Migration: 0014_multi_tenant_org_assignments.sql
-- Company assignments — APPROVED by Skyler Pittman.
-- Runs automatically on startup via the migration runner.
-- All statements are idempotent (safe to re-run).

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Assign users to companies by username
-- ═══════════════════════════════════════════════════════════════════
-- Skyler (GOD) is assigned to SEI but retains GOD cross-company access.

-- SEA Engineering (SEI): Dennis Johnston, John Spurlock, Corey Garcia, Skyler Pittman
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE username IN ('djohnston', 'jspurlock', 'cgarcia', 'spittman')
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000001');

-- Army Dive Locker (ADL): Jake Feyers
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000002'
WHERE username IN ('jfeyers')
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000002');

-- Chesapeake Bay Diving (CBD): Baker, Martin Dorn, Aaron Addison, Jamie Morris
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000003'
WHERE username IN ('baker', 'mdorn', 'aaddison', 'jmorris')
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000003');

-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Populate company_members from users
-- ═══════════════════════════════════════════════════════════════════
-- All users with a company_id get a company_members row.
-- GOD users are included so they appear in the company member list.
INSERT INTO company_members (company_id, user_id, company_role)
SELECT company_id, id,
  CASE WHEN role = 'GOD' THEN 'ADMIN' ELSE role END
FROM users
WHERE company_id IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: Assign projects to companies by name
-- ═══════════════════════════════════════════════════════════════════

-- DD5 Working test project → SEA Engineering
UPDATE projects SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE name ILIKE '%DD5%Working%'
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000001');

-- Army Dive TEST TEST project → Army Dive Locker
UPDATE projects SET company_id = '00000000-0000-0000-0000-000000000002'
WHERE name ILIKE '%Army%Dive%TEST%'
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000002');

-- CBD TEST TEST project → Chesapeake Bay Diving
UPDATE projects SET company_id = '00000000-0000-0000-0000-000000000003'
WHERE name ILIKE '%CBD%TEST%'
  AND (company_id IS NULL OR company_id != '00000000-0000-0000-0000-000000000003');

-- Catch-all: any remaining unassigned projects default to SEA Engineering
UPDATE projects SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Backfill audit_events.company_id from projects
-- ═══════════════════════════════════════════════════════════════════
UPDATE audit_events ae
SET company_id = p.company_id
FROM projects p
WHERE ae.project_id = p.id
  AND ae.company_id IS NULL
  AND p.company_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 5: Backfill diver_certifications.company_id from users
-- ═══════════════════════════════════════════════════════════════════
UPDATE diver_certifications dc
SET company_id = u.company_id
FROM users u
WHERE dc.user_id = u.id
  AND dc.company_id IS NULL
  AND u.company_id IS NOT NULL;
