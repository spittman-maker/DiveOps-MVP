-- Migration: 0013_multi_tenant_org.sql
-- Multi-Tenant Organization Support
-- This migration adds company_id columns to key tables and creates the company_members table.
-- It does NOT auto-assign users/projects to companies — that requires manual sign-off.

BEGIN;

-- Step 1: Create the three initial companies (idempotent upsert)
INSERT INTO companies (company_id, company_name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'SEA Engineering'),
  ('00000000-0000-0000-0000-000000000002', 'Army Dive Locker'),
  ('00000000-0000-0000-0000-000000000003', 'Chesapeake Bay Diving')
ON CONFLICT (company_name) DO NOTHING;

-- Step 2: Add company_id to users (nullable — GOD stays NULL)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

-- Step 3: Add company_id to projects (nullable first — will be set NOT NULL after migration helper runs)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE RESTRICT;

-- Step 4: Add company_id to audit_events
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

-- Step 5: Add company_id to diver_certifications
ALTER TABLE diver_certifications
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

-- Step 6: Add active_company_id to user_preferences (for GOD company context switching)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS active_company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

-- Step 7: Create company_members table
CREATE TABLE IF NOT EXISTS company_members (
  company_id   UUID    NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_role TEXT    NOT NULL CHECK (company_role IN ('ADMIN', 'SUPERVISOR', 'DIVER')),
  added_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  added_by     VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT pk_company_members PRIMARY KEY (company_id, user_id)
);

-- Step 8: Create indexes
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_company_id ON audit_events(company_id);
CREATE INDEX IF NOT EXISTS idx_diver_certs_company_id ON diver_certifications(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);

COMMIT;
