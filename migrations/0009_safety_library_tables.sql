-- Migration 0009: Create safety topic and hazard library tables
CREATE TABLE IF NOT EXISTS "safety_topic_library" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "talking_points" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "applicable_dive_types" jsonb DEFAULT '[]'::jsonb,
  "regulatory_references" jsonb DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "safety_topic_library_category_idx" ON "safety_topic_library" ("category");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jha_hazard_library" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category" text NOT NULL,
  "hazard" text NOT NULL,
  "description" text NOT NULL,
  "default_risk_level" text NOT NULL DEFAULT 'medium',
  "standard_controls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "required_ppe" jsonb DEFAULT '[]'::jsonb,
  "applicable_operations" jsonb DEFAULT '[]'::jsonb,
  "regulatory_basis" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jha_hazard_library_category_idx" ON "jha_hazard_library" ("category");
