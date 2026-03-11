-- Migration 0020: Delete stale Shift 2 day on DD5 project
-- Day ID: e30725e2-698a-49e4-a41e-2519cd1a10d1
-- Project: 086f903a-b3c9-4996-a7d3-b3c715b27f10 (DD5)
-- Reason: Bad Zack Meador dive on a stale Shift 2 day that should not exist.
-- Cascade: delete log events → dives → day

-- Step 1: Nullify audit events on this day
UPDATE "audit_events"
SET "day_id" = NULL
WHERE "day_id" = 'e30725e2-698a-49e4-a41e-2519cd1a10d1';

-- Step 2: Delete all log events on this day
DELETE FROM "log_events"
WHERE "day_id" = 'e30725e2-698a-49e4-a41e-2519cd1a10d1';

-- Step 3: Delete all dives on this day
DELETE FROM "dives"
WHERE "day_id" = 'e30725e2-698a-49e4-a41e-2519cd1a10d1';

-- Step 4: Delete the day itself
DELETE FROM "days"
WHERE "id" = 'e30725e2-698a-49e4-a41e-2519cd1a10d1'
  AND "project_id" = '086f903a-b3c9-4996-a7d3-b3c715b27f10';
