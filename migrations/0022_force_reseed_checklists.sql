-- Migration 0022: Force re-seed 9 universal safety checklists for all 3 projects
-- This migration runs after 0021 to ensure checklists are present even if the
-- upgradeChecklistsToRegulationGrounded() startup function wiped them.
-- Idempotent: DELETE + re-INSERT pattern.

-- Ensure the safety_checklists table exists (idempotent)
CREATE TABLE IF NOT EXISTS "safety_checklists" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL,
  "checklist_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "role_scope" text NOT NULL DEFAULT 'all',
  "is_active" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "created_by" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "checklist_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checklist_id" varchar NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "category" text,
  "label" text NOT NULL,
  "description" text,
  "item_type" text NOT NULL DEFAULT 'checkbox',
  "is_required" boolean NOT NULL DEFAULT true,
  "equipment_category" text,
  "regulatory_reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- The 3 project IDs
-- DD5:       086f903a-b3c9-4996-a7d3-b3c715b27f10
-- Army Dive: e99535cc-8b74-4184-ac7c-d78376f593f6
-- CBD:       7f3d57c8-6910-438d-9db1-e24f60ab149e

-- System user for seeded data
-- Using the GOD user ID from the seed data

-- Delete any existing checklists for these projects to avoid duplicates, then re-seed
DELETE FROM "checklist_items" WHERE "checklist_id" IN (
  SELECT "id" FROM "safety_checklists" WHERE "project_id" IN (
    '086f903a-b3c9-4996-a7d3-b3c715b27f10',
    'e99535cc-8b74-4184-ac7c-d78376f593f6',
    '7f3d57c8-6910-438d-9db1-e24f60ab149e'
  )
);
DELETE FROM "safety_checklists" WHERE "project_id" IN (
  '086f903a-b3c9-4996-a7d3-b3c715b27f10',
  'e99535cc-8b74-4184-ac7c-d78376f593f6',
  '7f3d57c8-6910-438d-9db1-e24f60ab149e'
);

-- ============================================================================
-- FUNCTION: seed checklists for a single project
-- ============================================================================
DO $$
DECLARE
  proj_ids text[] := ARRAY[
    '086f903a-b3c9-4996-a7d3-b3c715b27f10',
    'e99535cc-8b74-4184-ac7c-d78376f593f6',
    '7f3d57c8-6910-438d-9db1-e24f60ab149e'
  ];
  pid text;
  cl_id text;
  sys_user text := '00000000-0000-0000-0000-000000000000';
BEGIN
  FOREACH pid IN ARRAY proj_ids LOOP

    -- 1. Pre-Dive Safety Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'pre_dive', 'Pre-Dive Safety Checklist',
      'Comprehensive pre-dive safety verification per USACE EM 385-1-1 Section 30 and Navy Dive Manual. Covers dive planning, personnel qualifications, equipment readiness, and environmental conditions.',
      'all', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Dive Planning', 'Dive Operations Plan accepted by DDC and available on-site', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(1)'),
      (gen_random_uuid()::text, cl_id, 2, 'Dive Planning', 'Activity Hazards Analysis (AHA) reviewed and signed by all team members', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 3, 'Dive Planning', 'Emergency Management Plan on-site and reviewed', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 4, 'Dive Planning', 'Maximum working depth and estimated bottom times confirmed', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(c)'),
      (gen_random_uuid()::text, cl_id, 5, 'Pre-Dive Conference', 'Pre-dive conference conducted with all dive team members present', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)-(9)'),
      (gen_random_uuid()::text, cl_id, 6, 'Pre-Dive Conference', 'Mission scope, location, and drawings reviewed', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(a)-(b)'),
      (gen_random_uuid()::text, cl_id, 7, 'Pre-Dive Conference', 'Emergency procedures reviewed — all personnel know roles', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(f)'),
      (gen_random_uuid()::text, cl_id, 8, 'Personnel', 'All dive team members have current CPR and first aid certification', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 9, 'Personnel', 'Each diver has current Fit to Dive physician statement (within 12 months)', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)'),
      (gen_random_uuid()::text, cl_id, 10, 'Personnel', 'Dive team meets minimum manning levels per EM 385-1-1', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(11)');

    -- 2. Equipment Inspection Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'equipment', 'Equipment Inspection Checklist',
      'Systematic inspection of all diving equipment including air supply, helmets, umbilicals, communications, and emergency gear per Navy Dive Manual and EM 385-1-1.',
      'all', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Air Supply', 'Primary air supply operational — compressor or HP cylinder bank', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 2, 'Air Supply', 'Reserve breathing air supply integral or in-line with primary air', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 3, 'Air Supply', 'Bailout bottle minimum 30 ft³ — pressurized to ≥90% working PSI', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 4, 'Air Supply', 'Breathing air quality test current — Grade D or better per CGA G-7.1', NULL, 'pass_fail_flag', true, 'NDM Ch. 4 §4-4.1'),
      (gen_random_uuid()::text, cl_id, 5, 'Helmet/Mask', 'Diving helmet inspected — no cracks, viewport intact, seals good', NULL, 'pass_fail_flag', true, 'NDM Ch. 6; EM 385-1-1 §30-8.c(2)'),
      (gen_random_uuid()::text, cl_id, 6, 'Helmet/Mask', 'Demand regulator and free-flow valve tested and operational', NULL, 'pass_fail_flag', true, 'NDM Ch. 6'),
      (gen_random_uuid()::text, cl_id, 7, 'Umbilical', 'Umbilical inspected full length — no cuts, kinks, or abrasion', NULL, 'pass_fail_flag', true, 'NDM Ch. 6; EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 8, 'Umbilical', 'Pneumofathometer line clear and calibrated', NULL, 'pass_fail_flag', true, 'NDM Ch. 6 §6-7.4'),
      (gen_random_uuid()::text, cl_id, 9, 'Harness/Dress', 'Diver harness, weight system, and dress inspected', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(2)'),
      (gen_random_uuid()::text, cl_id, 10, 'Emergency', 'Standby diver equipment dressed and ready for immediate deployment', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)');

    -- 3. Emergency Procedures Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'pre_dive', 'Emergency Procedures Checklist',
      'Verification that all emergency procedures, equipment, and contacts are in place per USACE EM 385-1-1 and Navy Dive Manual requirements.',
      'supervisor', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Emergency Contacts', 'Nearest recompression chamber location and phone number posted', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 2, 'Emergency Contacts', 'Nearest hospital with hyperbaric capability identified', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 3, 'Emergency Contacts', 'USCG and local emergency services numbers posted', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 4, 'Emergency Contacts', 'Divers Alert Network (DAN) emergency number posted: 919-684-9111', NULL, 'checkbox', true, 'Industry standard'),
      (gen_random_uuid()::text, cl_id, 5, 'Emergency Equipment', 'Emergency oxygen system on-site and operational (min 2-hour supply)', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 6, 'Emergency Equipment', 'First aid kit stocked and accessible at dive station', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 7, 'Emergency Equipment', 'AED on-site and battery charged', NULL, 'pass_fail_flag', true, 'Industry standard'),
      (gen_random_uuid()::text, cl_id, 8, 'Emergency Procedures', 'Lost diver procedure reviewed with team', NULL, 'checkbox', true, 'NDM Ch. 6'),
      (gen_random_uuid()::text, cl_id, 9, 'Emergency Procedures', 'Fouled diver procedure reviewed with team', NULL, 'checkbox', true, 'NDM Ch. 6'),
      (gen_random_uuid()::text, cl_id, 10, 'Emergency Procedures', 'Emergency evacuation route identified and communicated', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)');

    -- 4. Communication Check Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'equipment', 'Communication Check Checklist',
      'Pre-dive verification of all communication systems between diver, topside, and standby diver per EM 385-1-1 and Navy Dive Manual.',
      'all', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Primary Comms', 'Two-way electronic voice communication operational between diver and topside', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 2, 'Primary Comms', 'External speaker at dive station audible to all team members', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 3, 'Primary Comms', 'Communication clarity test — diver and topside confirm clear audio', NULL, 'pass_fail_flag', true, 'NDM Ch. 6 §6-7.5'),
      (gen_random_uuid()::text, cl_id, 4, 'Backup Comms', 'Backup communication method available (line-pull signals reviewed)', NULL, 'checkbox', true, 'NDM Ch. 6'),
      (gen_random_uuid()::text, cl_id, 5, 'Backup Comms', 'Standby diver communication system tested', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(5)'),
      (gen_random_uuid()::text, cl_id, 6, 'Recording', 'Communication recording system operational (if required)', NULL, 'checkbox', false, 'Project-specific'),
      (gen_random_uuid()::text, cl_id, 7, 'Signals', 'Standard line-pull signals reviewed with all team members', NULL, 'checkbox', true, 'NDM Ch. 6 §6-9.1');

    -- 5. Environmental Assessment Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'pre_dive', 'Environmental Assessment Checklist',
      'Assessment of environmental conditions at the dive site including weather, water conditions, and hazards per EM 385-1-1 and Navy Dive Manual.',
      'supervisor', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Weather', 'Current weather conditions assessed and acceptable for diving', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(c)'),
      (gen_random_uuid()::text, cl_id, 2, 'Weather', 'Wind speed and sea state within operational limits', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(c)'),
      (gen_random_uuid()::text, cl_id, 3, 'Water Conditions', 'Water temperature recorded', NULL, 'numeric_input', true, 'EM 385-1-1 §30-8.a(9)(c)'),
      (gen_random_uuid()::text, cl_id, 4, 'Water Conditions', 'Current velocity measured and within safe limits', NULL, 'numeric_input', true, 'EM 385-1-1 §30-8.a(9)(c)'),
      (gen_random_uuid()::text, cl_id, 5, 'Water Conditions', 'Underwater visibility assessed', NULL, 'text_input', true, 'EM 385-1-1 §30-8.a(9)(c)'),
      (gen_random_uuid()::text, cl_id, 6, 'Hazards', 'Marine traffic in area assessed — vessel exclusion zone established if needed', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)'),
      (gen_random_uuid()::text, cl_id, 7, 'Hazards', 'Underwater hazards identified and briefed (debris, structures, intakes)', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)'),
      (gen_random_uuid()::text, cl_id, 8, 'Hazards', 'Tide and current schedule reviewed for dive window', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(c)');

    -- 6. PPE Verification Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'equipment', 'PPE Verification Checklist',
      'Verification of all personal protective equipment for dive team members per USACE EM 385-1-1 and Navy Dive Manual requirements.',
      'all', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Diver PPE', 'Diving dress/suit appropriate for water temperature and conditions', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(2)'),
      (gen_random_uuid()::text, cl_id, 2, 'Diver PPE', 'Dive knife/cutting device secured and accessible', NULL, 'pass_fail_flag', true, 'NDM Ch. 6'),
      (gen_random_uuid()::text, cl_id, 3, 'Diver PPE', 'Weight belt/harness properly fitted with quick-release', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(2)'),
      (gen_random_uuid()::text, cl_id, 4, 'Diver PPE', 'Dive boots and gloves in good condition', NULL, 'pass_fail_flag', true, 'EM 385-1-1 §30-8.c(2)'),
      (gen_random_uuid()::text, cl_id, 5, 'Topside PPE', 'Hard hats worn by all topside personnel', NULL, 'checkbox', true, 'EM 385-1-1 §05'),
      (gen_random_uuid()::text, cl_id, 6, 'Topside PPE', 'Safety-toed boots worn by all personnel', NULL, 'checkbox', true, 'EM 385-1-1 §05'),
      (gen_random_uuid()::text, cl_id, 7, 'Topside PPE', 'PFDs worn by all personnel within 6 feet of water', NULL, 'checkbox', true, 'EM 385-1-1 §05'),
      (gen_random_uuid()::text, cl_id, 8, 'Topside PPE', 'High-visibility vests worn where required', NULL, 'checkbox', false, 'EM 385-1-1 §05');

    -- 7. Dive Plan Review Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'pre_dive', 'Dive Plan Review Checklist',
      'Systematic review of the dive plan before operations commence. Ensures all required elements are addressed per EM 385-1-1 and the Navy Dive Manual.',
      'supervisor', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Plan Review', 'Dive plan current revision on-site and approved', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(1)'),
      (gen_random_uuid()::text, cl_id, 2, 'Plan Review', 'Scope of work matches today''s planned operations', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(a)'),
      (gen_random_uuid()::text, cl_id, 3, 'Plan Review', 'Decompression tables/schedules available and applicable to planned depths', NULL, 'checkbox', true, 'NDM Ch. 9'),
      (gen_random_uuid()::text, cl_id, 4, 'Plan Review', 'Dive team assignments match plan requirements', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(d)'),
      (gen_random_uuid()::text, cl_id, 5, 'Plan Review', 'Equipment list matches plan specifications', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(9)(b)'),
      (gen_random_uuid()::text, cl_id, 6, 'Plan Review', 'Site-specific hazards from AHA addressed in today''s briefing', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 7, 'Plan Review', 'Contingency plans reviewed for abort criteria', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)');

    -- 8. Post-Dive Debrief Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'post_dive', 'Post-Dive Debrief Checklist',
      'Post-dive debrief and diver condition assessment per Navy Dive Manual and EM 385-1-1. Covers diver health, equipment status, and lessons learned.',
      'supervisor', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Diver Assessment', 'Diver reports no pain, numbness, tingling, or unusual symptoms', NULL, 'checkbox', true, 'NDM Ch. 20'),
      (gen_random_uuid()::text, cl_id, 2, 'Diver Assessment', 'Diver neurological check completed (if required by depth/time)', NULL, 'checkbox', true, 'NDM Ch. 20'),
      (gen_random_uuid()::text, cl_id, 3, 'Diver Assessment', 'Diver surface interval and no-fly time communicated', NULL, 'checkbox', true, 'NDM Ch. 9'),
      (gen_random_uuid()::text, cl_id, 4, 'Dive Log', 'Dive log completed with actual depth, bottom time, and decompression', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)'),
      (gen_random_uuid()::text, cl_id, 5, 'Dive Log', 'Any deviations from plan documented', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)'),
      (gen_random_uuid()::text, cl_id, 6, 'Equipment', 'All equipment secured and accounted for', NULL, 'checkbox', true, 'NDM Ch. 6'),
      (gen_random_uuid()::text, cl_id, 7, 'Equipment', 'Equipment deficiencies noted and tagged for repair', NULL, 'checkbox', true, 'NDM Ch. 6'),
      (gen_random_uuid()::text, cl_id, 8, 'Debrief', 'Lessons learned discussed with team', NULL, 'checkbox', false, 'Best practice'),
      (gen_random_uuid()::text, cl_id, 9, 'Debrief', 'Near-miss or safety concerns reported', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)');

    -- 9. Incident Reporting Checklist
    cl_id := gen_random_uuid()::text;
    INSERT INTO "safety_checklists" ("id", "project_id", "checklist_type", "title", "description", "role_scope", "is_active", "version", "created_by")
    VALUES (cl_id, pid, 'post_dive', 'Incident Reporting Checklist',
      'Checklist for documenting and reporting dive incidents, near-misses, and safety events per USACE EM 385-1-1 and OSHA requirements.',
      'supervisor', true, 1, sys_user);
    INSERT INTO "checklist_items" ("id", "checklist_id", "sort_order", "category", "label", "description", "item_type", "is_required", "regulatory_reference") VALUES
      (gen_random_uuid()::text, cl_id, 1, 'Initial Response', 'Immediate medical attention provided if needed', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 2, 'Initial Response', 'Dive operations secured following incident', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(8)'),
      (gen_random_uuid()::text, cl_id, 3, 'Documentation', 'Date, time, and location of incident recorded', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)'),
      (gen_random_uuid()::text, cl_id, 4, 'Documentation', 'Names of all personnel involved and witnesses recorded', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)'),
      (gen_random_uuid()::text, cl_id, 5, 'Documentation', 'Description of incident — what happened, sequence of events', NULL, 'text_input', true, 'EM 385-1-1 §30-8.a(12)'),
      (gen_random_uuid()::text, cl_id, 6, 'Documentation', 'Root cause analysis initiated', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)'),
      (gen_random_uuid()::text, cl_id, 7, 'Notification', 'Client/COR notified within required timeframe', NULL, 'checkbox', true, 'Contract-specific'),
      (gen_random_uuid()::text, cl_id, 8, 'Notification', 'OSHA notification completed if required (fatality or hospitalization)', NULL, 'checkbox', true, 'OSHA 29 CFR 1904'),
      (gen_random_uuid()::text, cl_id, 9, 'Corrective Action', 'Corrective actions identified and assigned', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)'),
      (gen_random_uuid()::text, cl_id, 10, 'Corrective Action', 'Follow-up date set for corrective action verification', NULL, 'checkbox', true, 'EM 385-1-1 §30-8.a(12)');

  END LOOP;
END $$;
