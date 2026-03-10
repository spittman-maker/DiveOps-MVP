-- 0008_safety_tab.sql
-- Safety Tab: Checklists, JHA Records, Safety Meetings, Near-Miss Reports
-- All tables are project-scoped with projectId

-- ────────────────────────────────────────────────────────────────────────────
-- SAFETY CHECKLISTS (Template definitions)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_checklists (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checklist_type TEXT NOT NULL CHECK (checklist_type IN ('pre_dive', 'post_dive', 'equipment')),
  title TEXT NOT NULL,
  description TEXT,
  role_scope TEXT NOT NULL DEFAULT 'all' CHECK (role_scope IN ('all', 'diver', 'tender', 'supervisor')),
  client_type TEXT DEFAULT 'commercial' CHECK (client_type IN ('navy', 'usace', 'commercial', 'all')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_safety_checklists_project ON safety_checklists(project_id);
CREATE INDEX idx_safety_checklists_type ON safety_checklists(checklist_type);

-- ────────────────────────────────────────────────────────────────────────────
-- CHECKLIST ITEMS (Individual items within a checklist template)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id VARCHAR NOT NULL REFERENCES safety_checklists(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  category TEXT,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  requires_note BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklist_items_checklist ON checklist_items(checklist_id);

-- ────────────────────────────────────────────────────────────────────────────
-- CHECKLIST COMPLETIONS (Filled-out checklist instances)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_completions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id VARCHAR NOT NULL REFERENCES safety_checklists(id) ON DELETE CASCADE,
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day_id VARCHAR REFERENCES days(id) ON DELETE SET NULL,
  completed_by VARCHAR NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'signed_off')),
  responses JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  supervisor_signature VARCHAR REFERENCES users(id),
  supervisor_signed_at TIMESTAMPTZ,
  digital_signature_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklist_completions_project ON checklist_completions(project_id);
CREATE INDEX idx_checklist_completions_day ON checklist_completions(day_id);
CREATE INDEX idx_checklist_completions_checklist ON checklist_completions(checklist_id);

-- ────────────────────────────────────────────────────────────────────────────
-- JHA RECORDS (Job Hazard Analysis — AI-generated + supervisor-edited)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jha_records (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day_id VARCHAR REFERENCES days(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'superseded')),
  generated_by_ai BOOLEAN NOT NULL DEFAULT false,
  ai_model TEXT,
  ai_prompt_context JSONB,
  hazard_entries JSONB NOT NULL DEFAULT '[]',
  weather_conditions TEXT,
  dive_depth_range TEXT,
  equipment_in_use JSONB DEFAULT '[]',
  planned_operations TEXT,
  historical_context TEXT,
  supervisor_notes TEXT,
  approved_by VARCHAR REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  digital_signature_data TEXT,
  created_by VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_jha_records_project ON jha_records(project_id);
CREATE INDEX idx_jha_records_day ON jha_records(day_id);
CREATE INDEX idx_jha_records_status ON jha_records(status);

-- ────────────────────────────────────────────────────────────────────────────
-- SAFETY MEETINGS (Morning safety meeting records)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_meetings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day_id VARCHAR REFERENCES days(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'archived')),
  meeting_date TEXT NOT NULL,
  generated_by_ai BOOLEAN NOT NULL DEFAULT false,
  ai_model TEXT,
  supervisor_questions JSONB DEFAULT '[]',
  supervisor_answers JSONB DEFAULT '[]',
  safety_topic TEXT,
  previous_shift_summary TEXT,
  planned_operations TEXT,
  associated_hazards TEXT,
  mitigation_plan TEXT,
  open_discussion_points TEXT,
  agenda_json JSONB NOT NULL DEFAULT '{}',
  attendees JSONB DEFAULT '[]',
  notes TEXT,
  finalized_by VARCHAR REFERENCES users(id),
  finalized_at TIMESTAMPTZ,
  digital_signature_data TEXT,
  created_by VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_safety_meetings_project ON safety_meetings(project_id);
CREATE INDEX idx_safety_meetings_day ON safety_meetings(day_id);
CREATE INDEX idx_safety_meetings_date ON safety_meetings(meeting_date);

-- ────────────────────────────────────────────────────────────────────────────
-- NEAR-MISS REPORTS (Incident / near-miss capture)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS near_miss_reports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day_id VARCHAR REFERENCES days(id) ON DELETE SET NULL,
  reported_by VARCHAR NOT NULL REFERENCES users(id),
  report_type TEXT NOT NULL DEFAULT 'near_miss' CHECK (report_type IN ('near_miss', 'incident', 'observation', 'unsafe_condition')),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  location TEXT,
  personnel_involved JSONB DEFAULT '[]',
  immediate_actions TEXT,
  root_cause TEXT,
  corrective_actions TEXT,
  voice_transcript TEXT,
  linked_risk_id VARCHAR,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  reviewed_by VARCHAR REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_near_miss_reports_project ON near_miss_reports(project_id);
CREATE INDEX idx_near_miss_reports_day ON near_miss_reports(day_id);
CREATE INDEX idx_near_miss_reports_status ON near_miss_reports(status);
CREATE INDEX idx_near_miss_reports_severity ON near_miss_reports(severity);
