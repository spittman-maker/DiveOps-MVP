-- Force clear all old checklist data to allow regulation-grounded auto-seed
DELETE FROM "checklist_completions";
DELETE FROM "checklist_items";
DELETE FROM "safety_checklists";
