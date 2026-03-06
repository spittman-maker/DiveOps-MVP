-- Migration: Add certification tracking tables and mustChangePassword field
-- Items: #2 (Dashboard Cert Tracking) and #3 (Admin User Onboarding invite flow)

-- Add mustChangePassword column to users table for invite flow
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;

--> statement-breakpoint

-- Diver certifications table
CREATE TABLE IF NOT EXISTS "diver_certifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "cert_type" text NOT NULL,
  "cert_number" text,
  "issued_date" timestamp,
  "expiration_date" timestamp,
  "status" text NOT NULL DEFAULT 'active',
  "document_url" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint

-- Equipment certifications table
CREATE TABLE IF NOT EXISTS "equipment_certifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "equipment_name" text NOT NULL,
  "equipment_category" text NOT NULL,
  "serial_number" text,
  "cert_type" text NOT NULL,
  "cert_number" text,
  "issued_date" timestamp,
  "expiration_date" timestamp,
  "status" text NOT NULL DEFAULT 'active',
  "document_url" text,
  "notes" text,
  "project_id" varchar REFERENCES "projects"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
