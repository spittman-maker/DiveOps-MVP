-- Migration: Create diver_certifications table without FK constraints first
-- Then add constraints separately to avoid dependency issues

CREATE TABLE IF NOT EXISTS "diver_certifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "project_id" varchar,
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
CREATE INDEX IF NOT EXISTS "diver_certs_user_idx" ON "diver_certifications" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diver_certs_project_idx" ON "diver_certifications" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diver_certs_expiration_idx" ON "diver_certifications" ("expiration_date");
