-- Migration: Enhance certification tables with additional fields for the Certifications tab
-- Adds: certName, issuingAuthority, fileUrl, fileName, fileSize, projectId (to diver_certifications)
-- Adds: certName, issuingAuthority, fileUrl, fileName, fileSize, equipmentType (to equipment_certifications)

-- Enhance diver_certifications table
ALTER TABLE "diver_certifications" ADD COLUMN IF NOT EXISTS "project_id" varchar REFERENCES "projects"("id") ON DELETE SET NULL;

--> statement-breakpoint

ALTER TABLE "diver_certifications" ADD COLUMN IF NOT EXISTS "cert_name" text;

--> statement-breakpoint

ALTER TABLE "diver_certifications" ADD COLUMN IF NOT EXISTS "issuing_authority" text;

--> statement-breakpoint

ALTER TABLE "diver_certifications" ADD COLUMN IF NOT EXISTS "file_url" text;

--> statement-breakpoint

ALTER TABLE "diver_certifications" ADD COLUMN IF NOT EXISTS "file_name" text;

--> statement-breakpoint

ALTER TABLE "diver_certifications" ADD COLUMN IF NOT EXISTS "file_size" integer;

--> statement-breakpoint

-- Enhance equipment_certifications table
ALTER TABLE "equipment_certifications" ADD COLUMN IF NOT EXISTS "equipment_type" text;

--> statement-breakpoint

ALTER TABLE "equipment_certifications" ADD COLUMN IF NOT EXISTS "cert_name" text;

--> statement-breakpoint

ALTER TABLE "equipment_certifications" ADD COLUMN IF NOT EXISTS "issuing_authority" text;

--> statement-breakpoint

ALTER TABLE "equipment_certifications" ADD COLUMN IF NOT EXISTS "file_url" text;

--> statement-breakpoint

ALTER TABLE "equipment_certifications" ADD COLUMN IF NOT EXISTS "file_name" text;

--> statement-breakpoint

ALTER TABLE "equipment_certifications" ADD COLUMN IF NOT EXISTS "file_size" integer;

--> statement-breakpoint

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "diver_certs_user_idx" ON "diver_certifications" ("user_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "diver_certs_project_idx" ON "diver_certifications" ("project_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "diver_certs_expiration_idx" ON "diver_certifications" ("expiration_date");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "equip_certs_project_idx" ON "equipment_certifications" ("project_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "equip_certs_expiration_idx" ON "equipment_certifications" ("expiration_date");
