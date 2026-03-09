-- ============================================================================
-- Migration 0007: Clean up duplicate data
--
-- 1. Remove duplicate library_exports rows — keep only the OLDEST row per
--    (day_id, file_name) combination (i.e. the one with the smallest id /
--    earliest exported_at).
--
-- 2. Remove the 3 extra DRAFT days created for DD5 project on 2026-03-09.
--    Keep shift 1 (id = 2e35c383-2bb2-49b2-9cae-1d54f5aca6ee).
--    Delete shifts 2, 3, and 4 for that project+date combination.
-- ============================================================================

-- ─── 1. De-duplicate library_exports ────────────────────────────────────────
-- Strategy: for each (day_id, file_name) group, keep the row with the
-- minimum (oldest) id and delete all others.
DELETE FROM library_exports
WHERE id NOT IN (
    SELECT DISTINCT ON (day_id, file_name) id
    FROM library_exports
    ORDER BY day_id, file_name, exported_at ASC, id ASC
);

-- ─── 2. Remove extra DRAFT shifts for DD5 on 2026-03-09 ─────────────────────
-- Project: 086f903a-b3c9-4996-a7d3-b3c715b27f10 (DD5)
-- Keep:    2e35c383-2bb2-49b2-9cae-1d54f5aca6ee  (shift 1)
-- Delete:  all other DRAFT days for this project on 2026-03-09
DELETE FROM days
WHERE project_id = '086f903a-b3c9-4996-a7d3-b3c715b27f10'
  AND date = '2026-03-09'
  AND status = 'DRAFT'
  AND id != '2e35c383-2bb2-49b2-9cae-1d54f5aca6ee';
