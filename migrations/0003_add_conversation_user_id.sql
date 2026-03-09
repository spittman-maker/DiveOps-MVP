-- Migration: Add user_id column to conversations table
-- Fixes HIGH-05: Conversations are now associated with users to prevent cross-user data access
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_id" varchar;
