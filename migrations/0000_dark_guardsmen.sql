CREATE TABLE "audit_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" text NOT NULL,
	"action" text NOT NULL,
	"user_id" varchar,
	"user_role" text,
	"project_id" varchar,
	"day_id" varchar,
	"target_id" text,
	"target_type" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_comms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"source" text NOT NULL,
	"verbatim_text" text,
	"attachment_pointer" text,
	"summary_text" text,
	"referenced_event_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"company_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"logo_asset_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_contacts_defaults" (
	"company_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"default_name" text DEFAULT 'TBD' NOT NULL,
	"default_phone" text DEFAULT 'TBD' NOT NULL,
	"default_email" text DEFAULT 'TBD' NOT NULL,
	CONSTRAINT "company_contacts_defaults_company_id_role_id_pk" PRIMARY KEY("company_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "company_roles" (
	"role_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role_name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"work_executed" jsonb DEFAULT '[]'::jsonb,
	"dive_plan_refs" jsonb DEFAULT '[]'::jsonb,
	"dive_log_refs" jsonb DEFAULT '[]'::jsonb,
	"weather" text,
	"personnel_count" integer,
	"hours_worked" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_summaries_day_id_unique" UNIQUE("day_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard_layouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"layout_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "days" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"date" text NOT NULL,
	"shift" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_by" varchar,
	"closed_at" timestamp,
	"closeout_data" jsonb,
	"default_breathing_gas" text,
	"default_fo2_percent" integer,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_facilities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_type" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"lat" text NOT NULL,
	"lng" text NOT NULL,
	"phone" text,
	"hours" text,
	"notes" text,
	"last_verified_at" timestamp,
	"verified_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dive_confirmations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dive_id" varchar NOT NULL,
	"diver_id" varchar NOT NULL,
	"status" text NOT NULL,
	"confirmed_at" timestamp DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "dive_log_details" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dive_id" varchar NOT NULL,
	"station_id" varchar,
	"task_performed" text,
	"issues" jsonb DEFAULT '[]'::jsonb,
	"qa_notes" text,
	"equipment_used" jsonb,
	"visibility" text,
	"water_temp" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dive_plan_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_type" text DEFAULT 'DD5' NOT NULL,
	"template_data" text NOT NULL,
	"placeholders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_locked" boolean DEFAULT true NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dive_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"day_id" varchar,
	"status" text DEFAULT 'Draft' NOT NULL,
	"plan_version" integer DEFAULT 1 NOT NULL,
	"plan_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cached_renders" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_by" varchar,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "diver_roster" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"initials" text NOT NULL,
	"full_name" text NOT NULL,
	"badge_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"diver_id" varchar,
	"diver_display_name" text,
	"diver_badge_id" text,
	"dive_number" integer NOT NULL,
	"station" text,
	"work_location" text,
	"ls_time" timestamp,
	"rb_time" timestamp,
	"lb_time" timestamp,
	"rs_time" timestamp,
	"max_depth_fsw" integer,
	"task_summary" text,
	"tools_equipment" text,
	"install_material_ids" text,
	"qc_disposition" text,
	"verifier" text,
	"breathing_gas" text,
	"fo2_percent" integer,
	"breathing_gas_override" boolean DEFAULT false,
	"ead_fsw" integer,
	"table_used" text,
	"schedule_used" text,
	"repetitive_group" text,
	"decomp_required" text,
	"decomp_method" text,
	"decomp_stops" text,
	"post_dive_status" text,
	"photo_video_refs" text,
	"supervisor_initials" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" varchar PRIMARY KEY NOT NULL,
	"route" text NOT NULL,
	"response_status" integer DEFAULT 0 NOT NULL,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"doc_type" text NOT NULL,
	"project_id" varchar,
	"content" text,
	"metadata" jsonb,
	"locked" boolean DEFAULT false,
	"uploaded_by" varchar,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_exports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"day_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_type" text NOT NULL,
	"doc_category" text NOT NULL,
	"file_data" text NOT NULL,
	"exported_by" varchar NOT NULL,
	"exported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"station" text,
	"capture_time" timestamp DEFAULT now() NOT NULL,
	"event_time" timestamp NOT NULL,
	"raw_text" text NOT NULL,
	"category" text,
	"extracted_json" jsonb,
	"structured_payload" jsonb,
	"ai_annotations" jsonb,
	"validation_passed" boolean,
	"edit_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_renders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_event_id" varchar NOT NULL,
	"render_type" text NOT NULL,
	"render_text" text NOT NULL,
	"section" text,
	"model" text,
	"prompt_version" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_export_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"export_type" text NOT NULL,
	"exported_by" varchar NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"exported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"role_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_directory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"chamber_id" varchar,
	"emergency_room_id" varchar,
	"urgent_care_id" varchar,
	"status" text DEFAULT 'NEEDS_VERIFICATION' NOT NULL,
	"verified_at" timestamp,
	"verified_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_dive_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"template_id" varchar,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"plan_data" jsonb NOT NULL,
	"rendered_docx" text,
	"submitted_by" varchar,
	"submitted_at" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"superseded_by" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_sops" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_work_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"work_item_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_name" text,
	"jobsite_name" text,
	"jobsite_address" text,
	"jobsite_lat" text,
	"jobsite_lng" text,
	"timezone" text DEFAULT 'America/New_York',
	"emergency_contacts" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"risk_id" text NOT NULL,
	"trigger_event_id" varchar,
	"category" text,
	"source" text,
	"description" text NOT NULL,
	"affected_task" text,
	"initial_risk_level" text,
	"residual_risk" text,
	"status" text DEFAULT 'open' NOT NULL,
	"owner" text,
	"mitigation" text,
	"closure_authority" text,
	"linked_directive_id" text,
	"edit_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_items_risk_id_unique" UNIQUE("risk_id")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dive_plan_id" varchar NOT NULL,
	"station_id" text NOT NULL,
	"planned_dives" integer DEFAULT 1 NOT NULL,
	"planned_tasks" jsonb DEFAULT '[]'::jsonb,
	"target_depth_fsw" integer,
	"planned_bottom_time_min" integer,
	"crew" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"active_project_id" varchar
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text NOT NULL,
	"full_name" text,
	"initials" text,
	"email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "work_library_items" (
	"work_item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_comms" ADD CONSTRAINT "client_comms_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_comms" ADD CONSTRAINT "client_comms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts_defaults" ADD CONSTRAINT "company_contacts_defaults_company_id_companies_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts_defaults" ADD CONSTRAINT "company_contacts_defaults_role_id_company_roles_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."company_roles"("role_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_roles" ADD CONSTRAINT "company_roles_company_id_companies_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_facilities" ADD CONSTRAINT "directory_facilities_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_confirmations" ADD CONSTRAINT "dive_confirmations_dive_id_dives_id_fk" FOREIGN KEY ("dive_id") REFERENCES "public"."dives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_confirmations" ADD CONSTRAINT "dive_confirmations_diver_id_users_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_log_details" ADD CONSTRAINT "dive_log_details_dive_id_dives_id_fk" FOREIGN KEY ("dive_id") REFERENCES "public"."dives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_log_details" ADD CONSTRAINT "dive_log_details_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_plan_templates" ADD CONSTRAINT "dive_plan_templates_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_plans" ADD CONSTRAINT "dive_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_plans" ADD CONSTRAINT "dive_plans_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_plans" ADD CONSTRAINT "dive_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dive_plans" ADD CONSTRAINT "dive_plans_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diver_roster" ADD CONSTRAINT "diver_roster_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dives" ADD CONSTRAINT "dives_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dives" ADD CONSTRAINT "dives_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dives" ADD CONSTRAINT "dives_diver_id_users_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_exports" ADD CONSTRAINT "library_exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_exports" ADD CONSTRAINT "library_exports_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_exports" ADD CONSTRAINT "library_exports_exported_by_users_id_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_events" ADD CONSTRAINT "log_events_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_events" ADD CONSTRAINT "log_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_events" ADD CONSTRAINT "log_events_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_renders" ADD CONSTRAINT "log_renders_log_event_id_log_events_id_fk" FOREIGN KEY ("log_event_id") REFERENCES "public"."log_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_export_log" ADD CONSTRAINT "ml_export_log_exported_by_users_id_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contacts" ADD CONSTRAINT "project_contacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contacts" ADD CONSTRAINT "project_contacts_role_id_company_roles_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."company_roles"("role_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_directory" ADD CONSTRAINT "project_directory_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_directory" ADD CONSTRAINT "project_directory_chamber_id_directory_facilities_id_fk" FOREIGN KEY ("chamber_id") REFERENCES "public"."directory_facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_directory" ADD CONSTRAINT "project_directory_emergency_room_id_directory_facilities_id_fk" FOREIGN KEY ("emergency_room_id") REFERENCES "public"."directory_facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_directory" ADD CONSTRAINT "project_directory_urgent_care_id_directory_facilities_id_fk" FOREIGN KEY ("urgent_care_id") REFERENCES "public"."directory_facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_directory" ADD CONSTRAINT "project_directory_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dive_plans" ADD CONSTRAINT "project_dive_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dive_plans" ADD CONSTRAINT "project_dive_plans_template_id_dive_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."dive_plan_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dive_plans" ADD CONSTRAINT "project_dive_plans_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dive_plans" ADD CONSTRAINT "project_dive_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dive_plans" ADD CONSTRAINT "project_dive_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sops" ADD CONSTRAINT "project_sops_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sops" ADD CONSTRAINT "project_sops_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_work_selections" ADD CONSTRAINT "project_work_selections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_work_selections" ADD CONSTRAINT "project_work_selections_work_item_id_work_library_items_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_library_items"("work_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_trigger_event_id_log_events_id_fk" FOREIGN KEY ("trigger_event_id") REFERENCES "public"."log_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_dive_plan_id_dive_plans_id_fk" FOREIGN KEY ("dive_plan_id") REFERENCES "public"."dive_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_active_project_id_projects_id_fk" FOREIGN KEY ("active_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_user_idx" ON "audit_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_companies_name" ON "companies" USING btree ("company_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_company_roles_company_role" ON "company_roles" USING btree ("company_id","role_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dashboard_layouts_user" ON "dashboard_layouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "days_project_date_idx" ON "days" USING btree ("project_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_diver_roster_project_initials" ON "diver_roster" USING btree ("project_id","initials");--> statement-breakpoint
CREATE INDEX "dives_day_diver_idx" ON "dives" USING btree ("day_id","diver_id");--> statement-breakpoint
CREATE INDEX "library_exports_project_day_idx" ON "library_exports" USING btree ("project_id","day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_library_exports_day_file" ON "library_exports" USING btree ("day_id","file_name");--> statement-breakpoint
CREATE INDEX "log_events_day_id_idx" ON "log_events" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "log_events_event_time_idx" ON "log_events" USING btree ("event_time");--> statement-breakpoint
CREATE INDEX "log_renders_log_event_id_idx" ON "log_renders" USING btree ("log_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_contact_role" ON "project_contacts" USING btree ("project_id","role_id");--> statement-breakpoint
CREATE INDEX "project_dive_plans_project_revision_idx" ON "project_dive_plans" USING btree ("project_id","revision");--> statement-breakpoint
CREATE INDEX "project_sops_project_idx" ON "project_sops" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_work_selection" ON "project_work_selections" USING btree ("project_id","work_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_work_library_category_label" ON "work_library_items" USING btree ("category","label");