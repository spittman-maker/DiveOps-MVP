-- Migration: 0018_ensure_chat_tables.sql
-- BUG-12 FIX: Ensure conversations and messages tables exist for the AI chat feature.
-- These were defined in 0000_dark_guardsmen.sql but may not have been created
-- if the initial migration was applied partially.

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add user_id column if it doesn't exist (from migration 0003)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN user_id varchar;
  END IF;
END $$;

-- Add foreign key constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'messages_conversation_id_conversations_id_fk'
  ) THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade;
  END IF;
END $$;
