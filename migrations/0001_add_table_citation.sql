-- Migration: Add table_citation column to dives table
-- This column was added to the Drizzle schema but never pushed to the database.
-- It stores JSON-encoded dive table citation data (table reference, schedule, group).
ALTER TABLE "dives" ADD COLUMN IF NOT EXISTS "table_citation" text;
