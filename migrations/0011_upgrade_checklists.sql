-- Delete old checklist items that don't have regulatory references
-- This allows the auto-seed to recreate them with proper regulation citations
DELETE FROM "checklist_items" WHERE "regulatory_reference" IS NULL;
-- Delete checklists that now have no items (the old generic ones)
DELETE FROM "safety_checklists" WHERE "id" NOT IN (SELECT DISTINCT "checklist_id" FROM "checklist_items");
