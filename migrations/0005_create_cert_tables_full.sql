-- Migration: Ensure certification tables exist with all required columns
-- This is a safety net migration that creates the full tables if they don't exist

CREATE TABLE IF NOT EXISTS "diver_certifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar REFERENCES "projects"("id") ON DELETE SET NULL,
  "cert_name" text,
  "cert_type" text NOT NULL,
  "cert_number" text,
  "issuing_authority" text,
  "issued_date" timestamp,
  "expiration_date" timestamp,
  "file_url" text,
  "file_name" text,
  "file_size" integer,
  "status" text NOT NULL DEFAULT 'active',
  "document_url" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_certifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "equipment_name" text NOT NULL,
  "equipment_category" text NOT NULL,
  "equipment_type" text,
  "serial_number" text,
  "cert_name" text,
  "cert_type" text NOT NULL,
  "cert_number" text,
  "issuing_authority" text,
  "issued_date" timestamp,
  "expiration_date" timestamp,
  "file_url" text,
  "file_name" text,
  "file_size" integer,
  "status" text NOT NULL DEFAULT 'active',
  "document_url" text,
  "notes" text,
  "project_id" varchar REFERENCES "projects"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diver_certs_user_idx" ON "diver_certifications" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diver_certs_project_idx" ON "diver_certifications" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diver_certs_expiration_idx" ON "diver_certifications" ("expiration_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equip_certs_project_idx" ON "equipment_certifications" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equip_certs_expiration_idx" ON "equipment_certifications" ("expiration_date");
