-- BUG-16: Deactivate orphaned users with NULL companyId (except GOD user spittman)
-- These users exist outside the tenant model and could cause unexpected behavior.
-- We deactivate rather than delete to preserve audit trail.
UPDATE "users" SET "is_active" = false
WHERE "company_id" IS NULL
  AND "username" NOT IN ('spittman');

-- BUG-20: Clean up audit test data
-- Delete the "Audit Test Co" company and its associated test user
DELETE FROM "users" WHERE "username" = 'auditprobe';
DELETE FROM "companies" WHERE "company_name" = 'Audit Test Co';

-- Clean up other test users that were created during audit probing
DELETE FROM "users" WHERE "username" IN (
  'testuser', 'testuser2', 'testval7',
  'valtest_1772814221', 'valtest_1772823491', 'val_test_1772830888',
  'goduser', 'supervisor', 'diver2', 'bmartin'
);
