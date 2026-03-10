-- Safety Tab Migration: Checklists, JHA, Safety Meetings, Near-Miss Reports
-- Feature-flagged behind "safetyTab" flag (default: disabled)

CREATE TABLE "safety_checklists" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "checklist_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "role_scope" text NOT NULL DEFAULT 'all',
  "is_active" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "safety_checklists_project_idx" ON "safety_checklists" ("project_id");
--> statement-breakpoint
CREATE INDEX "safety_checklists_type_idx" ON "safety_checklists" ("checklist_type");
--> statement-breakpoint

CREATE TABLE "checklist_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checklist_id" varchar NOT NULL REFERENCES "safety_checklists"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  "category" text,
  "label" text NOT NULL,
  "description" text,
  "item_type" text NOT NULL DEFAULT 'checkbox',
  "is_required" boolean NOT NULL DEFAULT true,
  "equipment_category" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "checklist_items_checklist_idx" ON "checklist_items" ("checklist_id");
--> statement-breakpoint

CREATE TABLE "checklist_completions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checklist_id" varchar NOT NULL REFERENCES "safety_checklists"("id") ON DELETE CASCADE,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "day_id" varchar REFERENCES "days"("id") ON DELETE SET NULL,
  "completed_by" varchar NOT NULL REFERENCES "users"("id"),
  "completed_by_name" text,
  "status" text NOT NULL DEFAULT 'in_progress',
  "responses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "digital_signature" text,
  "signed_at" timestamp with time zone,
  "notes" text,
  "auto_generated_risk_ids" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "checklist_completions_project_idx" ON "checklist_completions" ("project_id");
--> statement-breakpoint
CREATE INDEX "checklist_completions_day_idx" ON "checklist_completions" ("day_id");
--> statement-breakpoint
CREATE INDEX "checklist_completions_user_idx" ON "checklist_completions" ("completed_by");
--> statement-breakpoint

CREATE TABLE "jha_records" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "day_id" varchar REFERENCES "days"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "content" jsonb NOT NULL,
  "ai_generated" boolean NOT NULL DEFAULT false,
  "generated_by" varchar NOT NULL REFERENCES "users"("id"),
  "reviewed_by" varchar REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "approved_by" varchar REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "digital_signature" text,
  "export_file_id" varchar,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "jha_records_project_idx" ON "jha_records" ("project_id");
--> statement-breakpoint
CREATE INDEX "jha_records_day_idx" ON "jha_records" ("day_id");
--> statement-breakpoint
CREATE INDEX "jha_records_status_idx" ON "jha_records" ("status");
--> statement-breakpoint

CREATE TABLE "safety_meetings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "day_id" varchar REFERENCES "days"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "meeting_date" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "agenda" jsonb NOT NULL,
  "ai_generated" boolean NOT NULL DEFAULT false,
  "conducted_by" varchar NOT NULL REFERENCES "users"("id"),
  "conducted_by_name" text,
  "attendees" jsonb DEFAULT '[]'::jsonb,
  "duration_minutes" integer,
  "notes" text,
  "digital_signature" text,
  "signed_at" timestamp with time zone,
  "export_file_id" varchar,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "safety_meetings_project_idx" ON "safety_meetings" ("project_id");
--> statement-breakpoint
CREATE INDEX "safety_meetings_day_idx" ON "safety_meetings" ("day_id");
--> statement-breakpoint
CREATE INDEX "safety_meetings_date_idx" ON "safety_meetings" ("meeting_date");
--> statement-breakpoint

CREATE TABLE "near_miss_reports" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "day_id" varchar REFERENCES "days"("id") ON DELETE SET NULL,
  "reported_by" varchar NOT NULL REFERENCES "users"("id"),
  "reported_by_name" text,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "location" text,
  "severity" text NOT NULL DEFAULT 'low',
  "status" text NOT NULL DEFAULT 'reported',
  "category" text,
  "involved_personnel" jsonb DEFAULT '[]'::jsonb,
  "immediate_actions" text,
  "root_cause" text,
  "corrective_actions" text,
  "linked_risk_id" varchar,
  "voice_transcript" text,
  "reviewed_by" varchar REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "resolved_by" varchar REFERENCES "users"("id"),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "near_miss_reports_project_idx" ON "near_miss_reports" ("project_id");
--> statement-breakpoint
CREATE INDEX "near_miss_reports_day_idx" ON "near_miss_reports" ("day_id");
--> statement-breakpoint
CREATE INDEX "near_miss_reports_severity_idx" ON "near_miss_reports" ("severity");
--> statement-breakpoint
CREATE INDEX "near_miss_reports_status_idx" ON "near_miss_reports" ("status");
