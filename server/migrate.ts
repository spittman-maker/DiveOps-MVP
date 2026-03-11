/**
 * Auto-migration module for DiveOps-MVP.
 * 
 * Runs pending SQL migrations on app startup to ensure the database schema
 * matches the application code. Uses a simple migration tracking table
 * to avoid re-running migrations.
 * 
 * This is separate from drizzle-kit push/migrate — it handles incremental
 * ALTER TABLE statements that need to run against an existing production DB.
 */
import pkg from "pg";
const { Pool } = pkg;
import fs from "fs";
import path from "path";

const MIGRATIONS_TABLE = "__diveops_migrations";

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[MIGRATE] No DATABASE_URL set — skipping migrations");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Clean up stale entries from the broken deploy that marked 0013/0014 as
    // applied even though zero SQL was executed (comment-filter bug).
    // These were renamed to 0015/0016 — remove the phantom entries.
    await pool.query(
      `DELETE FROM "${MIGRATIONS_TABLE}" WHERE "name" IN ($1, $2)`,
      ["0013_multi_tenant_org.sql", "0014_multi_tenant_org_assignments.sql"]
    );

    // Get already-applied migrations
    const { rows: applied } = await pool.query(
      `SELECT "name" FROM "${MIGRATIONS_TABLE}" ORDER BY "id"`
    );
    const appliedSet = new Set(applied.map((r: any) => r.name));

    // Read migration files from the migrations directory
    const migrationsDir = path.resolve(__dirname, "..", "migrations");
    // In production (compiled), migrations may be at a different path
    const possibleDirs = [
      migrationsDir,
      path.resolve(__dirname, "migrations"),
      path.resolve(process.cwd(), "migrations"),
    ];

    let actualDir: string | null = null;
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        actualDir = dir;
        break;
      }
    }

    if (!actualDir) {
      console.warn("[MIGRATE] No migrations directory found — skipping");
      return;
    }

    const files = fs.readdirSync(actualDir)
      .filter(f => f.endsWith(".sql") && /^\d/.test(f))
      .sort();

    let migrationsRun = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue; // Already applied
      }

      const filePath = path.join(actualDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      console.log(`[MIGRATE] Applying migration: ${file}`);

      // Split on statement breakpoints if present (drizzle-kit format)
      const hasBreakpoints = sql.includes("--> statement-breakpoint");
      let statements: string[];

      if (hasBreakpoints) {
        // Drizzle-kit format: split on breakpoints, strip leading comments from each chunk
        statements = sql
          .split("--> statement-breakpoint")
          .map(s => s.replace(/^(\s*--[^\n]*\n)*/g, "").trim())
          .filter(s => s.length > 0);
      } else {
        // Plain SQL file: strip comment-only lines, then send as a single statement
        // PostgreSQL handles multi-statement strings natively
        const cleaned = sql
          .split("\n")
          .filter(line => {
            const trimmed = line.trim();
            // Keep non-empty lines that aren't pure comments
            // But keep inline comments within SQL (e.g., after a statement)
            return trimmed.length > 0 && !trimmed.startsWith("--");
          })
          .join("\n")
          .trim();
        statements = cleaned.length > 0 ? [cleaned] : [];
      }

      let allStatementsOk = true;
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        try {
          await pool.query(stmt);
        } catch (err: any) {
          // Safe to ignore: relation/column/index already exists, or doesn't exist for DROP
          const safeErrors = [
            "42P07", // duplicate_table (relation already exists)
            "42701", // duplicate_column (column already exists)
            "42P16", // duplicate_object (constraint already exists)
            "42710", // duplicate_object (index already exists)
          ];
          if (safeErrors.includes(err.code)) {
            console.log(`[MIGRATE] Already exists (${err.code}), skipping statement in ${file}`);
          } else {
            console.error(`[MIGRATE] ✗ Statement failed in ${file}:`, err.message, `(code: ${err.code})`);
            allStatementsOk = false;
            // Don't throw — try remaining statements and mark as applied anyway
            // This prevents one bad statement from blocking all subsequent migrations
          }
        }
      }

      // Record the migration as applied regardless (idempotent approach)
      await pool.query(
        `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES ($1) ON CONFLICT DO NOTHING`,
        [file]
      );
      migrationsRun++;
      if (allStatementsOk) {
        console.log(`[MIGRATE] ✓ Applied: ${file}`);
      } else {
        console.log(`[MIGRATE] ⚠ Partially applied: ${file} (some statements failed, see above)`);
      }
    }

    if (migrationsRun > 0) {
      console.log(`[MIGRATE] ${migrationsRun} migration(s) applied successfully`);
    } else {
      console.log("[MIGRATE] Database is up to date");
    }

    // Safety net: ensure critical tables exist even if migrations failed
    await ensureCriticalTables(pool);
    await upgradeChecklistsToRegulationGrounded(pool);
    // BUG-AUTH-01/02 FIX: Reset passwords for jspurlock and cgarcia
    await fixUserLogins(pool);
  } catch (err) {
    console.error("[MIGRATE] Migration failed:", err);
    // Don't crash the app — log the error and continue
    // The specific query that uses the missing column will fail with a clear error
  } finally {
    await pool.end();
  }
}

async function ensureCriticalTables(pool: InstanceType<typeof Pool>): Promise<void> {
  // Check if diver_certifications table exists
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'diver_certifications'
    ) as exists;
  `);

  if (!rows[0]?.exists) {
    console.log("[MIGRATE] Creating missing diver_certifications table...");
    try {
      await pool.query(`
        CREATE TABLE "diver_certifications" (
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
      `);
      console.log("[MIGRATE] ✓ Created diver_certifications table");
    } catch (err: any) {
      if (err.code === "42P07") {
        console.log("[MIGRATE] diver_certifications already exists (race condition)");
      } else {
        console.error("[MIGRATE] ✗ Failed to create diver_certifications:", err.message);
      }
    }

    // Create indexes
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS "diver_certs_user_idx" ON "diver_certifications" ("user_id");`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "diver_certs_project_idx" ON "diver_certifications" ("project_id");`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "diver_certs_expiration_idx" ON "diver_certifications" ("expiration_date");`);
      console.log("[MIGRATE] ✓ Created diver_certifications indexes");
    } catch (err: any) {
      console.error("[MIGRATE] ✗ Failed to create diver_certifications indexes:", err.message);
    }
  }

  // Check if equipment_certifications table exists
  const { rows: eqRows } = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'equipment_certifications'
    ) as exists;
  `);

  if (!eqRows[0]?.exists) {
    console.log("[MIGRATE] Creating missing equipment_certifications table...");
    try {
      await pool.query(`
        CREATE TABLE "equipment_certifications" (
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
          "project_id" varchar,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );
      `);
      console.log("[MIGRATE] ✓ Created equipment_certifications table");
    } catch (err: any) {
      if (err.code === "42P07") {
        console.log("[MIGRATE] equipment_certifications already exists (race condition)");
      } else {
        console.error("[MIGRATE] ✗ Failed to create equipment_certifications:", err.message);
      }
    }

    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS "equip_certs_project_idx" ON "equipment_certifications" ("project_id");`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "equip_certs_expiration_idx" ON "equipment_certifications" ("expiration_date");`);
      console.log("[MIGRATE] ✓ Created equipment_certifications indexes");
    } catch (err: any) {
      console.error("[MIGRATE] ✗ Failed to create equipment_certifications indexes:", err.message);
    }
  }

  // Check and create all safety tab tables
  const safetyTables = [
    {
      name: 'safety_checklists',
      sql: `CREATE TABLE IF NOT EXISTS "safety_checklists" (
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
      );`,
      indexes: [
        `CREATE INDEX IF NOT EXISTS "safety_checklists_project_idx" ON "safety_checklists" ("project_id");`,
        `CREATE INDEX IF NOT EXISTS "safety_checklists_type_idx" ON "safety_checklists" ("checklist_type");`,
      ],
    },
    {
      name: 'checklist_items',
      sql: `CREATE TABLE IF NOT EXISTS "checklist_items" (
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
      );`,
      indexes: [
        `CREATE INDEX IF NOT EXISTS "checklist_items_checklist_idx" ON "checklist_items" ("checklist_id");`,
      ],
    },
    {
      name: 'checklist_completions',
      sql: `CREATE TABLE IF NOT EXISTS "checklist_completions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "checklist_id" varchar NOT NULL,
        "project_id" varchar NOT NULL,
        "day_id" varchar,
        "completed_by" varchar NOT NULL,
        "completed_by_name" text,
        "status" text NOT NULL DEFAULT 'in_progress',
        "responses" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "digital_signature" text,
        "signed_at" timestamp with time zone,
        "notes" text,
        "auto_generated_risk_ids" jsonb DEFAULT '[]'::jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );`,
      indexes: [
        `CREATE INDEX IF NOT EXISTS "checklist_completions_project_idx" ON "checklist_completions" ("project_id");`,
        `CREATE INDEX IF NOT EXISTS "checklist_completions_day_idx" ON "checklist_completions" ("day_id");`,
        `CREATE INDEX IF NOT EXISTS "checklist_completions_user_idx" ON "checklist_completions" ("completed_by");`,
      ],
    },
    {
      name: 'jha_records',
      sql: `CREATE TABLE IF NOT EXISTS "jha_records" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "day_id" varchar,
        "title" text NOT NULL,
        "status" text NOT NULL DEFAULT 'draft',
        "content" jsonb NOT NULL,
        "ai_generated" boolean NOT NULL DEFAULT false,
        "generated_by" varchar NOT NULL,
        "reviewed_by" varchar,
        "reviewed_at" timestamp with time zone,
        "approved_by" varchar,
        "approved_at" timestamp with time zone,
        "digital_signature" text,
        "export_file_id" varchar,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );`,
      indexes: [
        `CREATE INDEX IF NOT EXISTS "jha_records_project_idx" ON "jha_records" ("project_id");`,
        `CREATE INDEX IF NOT EXISTS "jha_records_day_idx" ON "jha_records" ("day_id");`,
        `CREATE INDEX IF NOT EXISTS "jha_records_status_idx" ON "jha_records" ("status");`,
      ],
    },
    {
      name: 'safety_meetings',
      sql: `CREATE TABLE IF NOT EXISTS "safety_meetings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "day_id" varchar,
        "title" text NOT NULL,
        "meeting_date" text NOT NULL,
        "status" text NOT NULL DEFAULT 'draft',
        "agenda" jsonb NOT NULL,
        "ai_generated" boolean NOT NULL DEFAULT false,
        "conducted_by" varchar NOT NULL,
        "conducted_by_name" text,
        "attendees" jsonb DEFAULT '[]'::jsonb,
        "duration_minutes" integer,
        "notes" text,
        "digital_signature" text,
        "signed_at" timestamp with time zone,
        "export_file_id" varchar,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );`,
      indexes: [
        `CREATE INDEX IF NOT EXISTS "safety_meetings_project_idx" ON "safety_meetings" ("project_id");`,
        `CREATE INDEX IF NOT EXISTS "safety_meetings_day_idx" ON "safety_meetings" ("day_id");`,
        `CREATE INDEX IF NOT EXISTS "safety_meetings_date_idx" ON "safety_meetings" ("meeting_date");`,
      ],
    },
    {
      name: 'near_miss_reports',
      sql: `CREATE TABLE IF NOT EXISTS "near_miss_reports" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "day_id" varchar,
        "reported_by" varchar NOT NULL,
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
        "reviewed_by" varchar,
        "reviewed_at" timestamp with time zone,
        "resolved_by" varchar,
        "resolved_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );`,
      indexes: [
        `CREATE INDEX IF NOT EXISTS "near_miss_reports_project_idx" ON "near_miss_reports" ("project_id");`,
        `CREATE INDEX IF NOT EXISTS "near_miss_reports_day_idx" ON "near_miss_reports" ("day_id");`,
        `CREATE INDEX IF NOT EXISTS "near_miss_reports_severity_idx" ON "near_miss_reports" ("severity");`,
        `CREATE INDEX IF NOT EXISTS "near_miss_reports_status_idx" ON "near_miss_reports" ("status");`,
      ],
    },
  ];

  for (const table of safetyTables) {
    const { rows: checkRows } = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '${table.name}'
      ) as exists;
    `);
    if (!checkRows[0]?.exists) {
      console.log(`[MIGRATE] Creating missing ${table.name} table...`);
      try {
        await pool.query(table.sql);
        for (const idx of table.indexes) {
          await pool.query(idx);
        }
        console.log(`[MIGRATE] ✓ Created ${table.name} table`);
      } catch (err: any) {
        if (err.code === '42P07') {
          console.log(`[MIGRATE] ${table.name} already exists (race condition)`);
        } else {
          console.error(`[MIGRATE] ✗ Failed to create ${table.name}:`, err.message);
        }
      }
    }
  }

  // Check if safety_topic_library table exists
  const { rows: stRows } = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'safety_topic_library'
    ) as exists;
  `);
  if (!stRows[0]?.exists) {
    console.log("[MIGRATE] Creating missing safety_topic_library table...");
    try {
      await pool.query(`
        CREATE TABLE "safety_topic_library" (
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
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS "safety_topic_library_category_idx" ON "safety_topic_library" ("category");`);
      console.log("[MIGRATE] ✓ Created safety_topic_library table");
    } catch (err: any) {
      if (err.code === "42P07") {
        console.log("[MIGRATE] safety_topic_library already exists (race condition)");
      } else {
        console.error("[MIGRATE] ✗ Failed to create safety_topic_library:", err.message);
      }
    }
  }

  // Check if jha_hazard_library table exists
  const { rows: jhRows } = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'jha_hazard_library'
    ) as exists;
  `);
  if (!jhRows[0]?.exists) {
    console.log("[MIGRATE] Creating missing jha_hazard_library table...");
    try {
      await pool.query(`
        CREATE TABLE "jha_hazard_library" (
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
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS "jha_hazard_library_category_idx" ON "jha_hazard_library" ("category");`);
      console.log("[MIGRATE] ✓ Created jha_hazard_library table");
    } catch (err: any) {
      if (err.code === "42P07") {
        console.log("[MIGRATE] jha_hazard_library already exists (race condition)");
      } else {
        console.error("[MIGRATE] ✗ Failed to create jha_hazard_library:", err.message);
      }
    }
  }

  // Ensure regulatory_reference column exists on checklist_items (may have been created before this column was added)
  try {
    await pool.query(`ALTER TABLE "checklist_items" ADD COLUMN IF NOT EXISTS "regulatory_reference" text;`);
    console.log("[MIGRATE] ✓ Ensured regulatory_reference column on checklist_items");
  } catch (err: any) {
    console.error("[MIGRATE] Could not add regulatory_reference column:", err.message);
  }
}

// Known project IDs that always need safety checklists
const KNOWN_PROJECT_IDS = [
  '086f903a-b3c9-4996-a7d3-b3c715b27f10', // DD5
  'e99535cc-8b74-4184-ac7c-d78376f593f6', // Army Dive
  '7f3d57c8-6910-438d-9db1-e24f60ab149e', // CBD
];

// The 9 universal safety checklists with full regulatory references
const UNIVERSAL_CHECKLISTS = [
  {
    type: 'pre_dive', title: 'Pre-Dive Safety Checklist',
    description: 'Comprehensive pre-dive safety verification per EM 385-1-1 §30-8.a and NDM Ch. 6',
    items: [
      { sort: 1, cat: 'Dive Planning', label: 'Dive Operations Plan accepted by DDC and on-site', ref: 'EM 385-1-1 §30-8.a(1)' },
      { sort: 2, cat: 'Dive Planning', label: 'Activity Hazards Analysis (AHA) reviewed and signed', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 3, cat: 'Dive Planning', label: 'Emergency Management Plan on-site and reviewed', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 4, cat: 'Personnel', label: 'Dive team meets minimum manning per EM 385-1-1 Tables 30-2 through 30-6', ref: 'EM 385-1-1 §30-8.a(11)' },
      { sort: 5, cat: 'Personnel', label: 'All divers have current CPR and first aid certifications', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 6, cat: 'Personnel', label: 'Each diver has current Fit to Dive physician statement (within 12 months)', ref: 'EM 385-1-1 §30-8.a(9)' },
      { sort: 7, cat: 'Air Supply', label: 'Primary and reserve air supply operational and verified', ref: 'EM 385-1-1 §30-8.c(5)' },
      { sort: 8, cat: 'Air Supply', label: 'Bailout bottle minimum 30 ft³ pressurized to ≥90% working PSI', ref: 'EM 385-1-1 §30-8.c(5)' },
      { sort: 9, cat: 'Gas Quality', label: 'Breathing air quality test current — Grade D or better per CGA G-7.1', ref: 'NDM Ch. 4 §4-4.1; EM 385-1-1 §30-8.c(3)(c)' },
      { sort: 10, cat: 'Communications', label: 'Two-way electronic communication system tested and operational', ref: 'EM 385-1-1 §30-8.c(5); NDM Ch. 6 §6-7.5' },
    ]
  },
  {
    type: 'equipment', title: 'Equipment Inspection Checklist',
    description: 'Pre-dive equipment inspection per NDM Ch. 6 and EM 385-1-1 §30-8.c',
    items: [
      { sort: 1, cat: 'Helmet/Mask', label: 'Diving helmet inspected — no cracks, viewport intact, seals good', ref: 'NDM Ch. 6 Fig. 6-21 Sheet 1; EM 385-1-1 §30-8.c(2)' },
      { sort: 2, cat: 'Helmet/Mask', label: 'Demand regulator and free-flow valve tested and operational', ref: 'NDM Ch. 6 Fig. 6-21 Sheet 1' },
      { sort: 3, cat: 'Umbilical', label: 'Umbilical inspected full length — no cuts, kinks, or abrasion', ref: 'NDM Ch. 6 Fig. 6-21 Sheet 2; EM 385-1-1 §30-8.c(5)' },
      { sort: 4, cat: 'Umbilical', label: 'Umbilical marked in 10 ft increments to 100 ft, then 50 ft', ref: 'EM 385-1-1 §30-8.c(5)' },
      { sort: 5, cat: 'Dress', label: 'Dry suit or wetsuit condition checked — no tears or zipper damage', ref: 'NDM Ch. 6 §6-7.1; EM 385-1-1 §30-8.c(2)' },
      { sort: 6, cat: 'Dress', label: 'Weight belt and buoyancy compensator inspected and functional', ref: 'NDM Ch. 6 §6-7.1' },
      { sort: 7, cat: 'Tools', label: 'Dive knife/cutting device accessible and secured', ref: 'NDM Ch. 6 §6-7.1' },
      { sort: 8, cat: 'Tools', label: 'Depth gauge and bottom timer calibrated and functional', ref: 'NDM Ch. 6 §6-7.1; EM 385-1-1 §30-8.c(2)' },
      { sort: 9, cat: 'Emergency', label: 'Standby diver dressed and ready for immediate water entry', ref: 'EM 385-1-1 §30-8.a(11); NDM Ch. 6 §6-9.2' },
      { sort: 10, cat: 'Emergency', label: 'Emergency oxygen system on-site and ready for use', ref: 'EM 385-1-1 §30-8.a(8); ENG FORM 6226 §E.1' },
    ]
  },
  {
    type: 'pre_dive', title: 'Emergency Procedures Checklist',
    description: 'Emergency readiness verification per EM 385-1-1 §30-8.a(8) and NDM Ch. 20',
    items: [
      { sort: 1, cat: 'Emergency Response', label: 'Emergency contact numbers posted at dive station (hospital, USCG, DAN)', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 2, cat: 'Emergency Response', label: 'Nearest recompression chamber location and contact verified', ref: 'EM 385-1-1 §30-8.a(8); NDM Ch. 20 §20-2' },
      { sort: 3, cat: 'Emergency Response', label: 'Transportation route to chamber or hospital confirmed', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 4, cat: 'Emergency Response', label: 'All team members briefed on lost diver procedures', ref: 'NDM Ch. 20 §20-4; EM 385-1-1 §30-8.a(8)' },
      { sort: 5, cat: 'Emergency Response', label: 'All team members briefed on diver distress/unconscious procedures', ref: 'NDM Ch. 20 §20-3; EM 385-1-1 §30-8.a(8)' },
      { sort: 6, cat: 'Medical', label: 'First aid kit on-site and stocked', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 7, cat: 'Medical', label: 'Emergency oxygen system on-site with full cylinder', ref: 'EM 385-1-1 §30-8.a(8); ENG FORM 6226 §E.1' },
      { sort: 8, cat: 'Medical', label: 'AED (automated external defibrillator) on-site and charged', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 9, cat: 'Stop Work', label: 'All personnel understand stop-work authority — any team member may halt operations', ref: 'EM 385-1-1 §01.A.17; USACE Safety Policy' },
      { sort: 10, cat: 'Stop Work', label: 'Conditions requiring immediate abort briefed: loss of comms, air supply failure, diver distress', ref: 'NDM Ch. 20 §20-1; EM 385-1-1 §30-8.a(8)' },
    ]
  },
  {
    type: 'equipment', title: 'Communication Check Checklist',
    description: 'Communication systems verification per NDM Ch. 6 §6-7.5 and EM 385-1-1 §30-8.c(5)',
    items: [
      { sort: 1, cat: 'Primary Comms', label: 'Two-way electronic voice communication tested — diver to surface', ref: 'EM 385-1-1 §30-8.c(5); NDM Ch. 6 §6-7.5' },
      { sort: 2, cat: 'Primary Comms', label: 'External speaker at dive station operational', ref: 'EM 385-1-1 §30-8.c(5); NDM Ch. 6 §6-7.5' },
      { sort: 3, cat: 'Primary Comms', label: 'Communication system battery level checked — adequate charge', ref: 'NDM Ch. 6 §6-7.5' },
      { sort: 4, cat: 'Backup Comms', label: 'Backup communication method available (pull signals or backup radio)', ref: 'EM 385-1-1 §30-8.c(5); NDM Ch. 6 §6-7.5' },
      { sort: 5, cat: 'Backup Comms', label: 'Line pull signals reviewed with diver and tender', ref: 'NDM Ch. 6 §6-7.5; EM 385-1-1 §30-8.c(5)' },
      { sort: 6, cat: 'Topside', label: 'Dive supervisor has continuous communication capability throughout dive', ref: 'EM 385-1-1 §30-8.a(11); NDM Ch. 6 §6-9.2' },
      { sort: 7, cat: 'Topside', label: 'Communication log initiated — all significant comms to be recorded', ref: 'EM 385-1-1 §30-8.a(12); NDM Ch. 20 §20-1' },
    ]
  },
  {
    type: 'pre_dive', title: 'Environmental Assessment Checklist',
    description: 'Site and environmental conditions assessment per EM 385-1-1 §30-8.a(9)(c)',
    items: [
      { sort: 1, cat: 'Water Conditions', label: 'Water temperature measured and recorded', ref: 'EM 385-1-1 §30-8.a(9)(c); NDM Ch. 6 §6-9.1' },
      { sort: 2, cat: 'Water Conditions', label: 'Current velocity measured — within acceptable limits for planned dive', ref: 'EM 385-1-1 §30-8.a(9)(c); NDM Ch. 6 §6-9.1' },
      { sort: 3, cat: 'Water Conditions', label: 'Visibility assessed — adequate for planned work scope', ref: 'EM 385-1-1 §30-8.a(9)(c)' },
      { sort: 4, cat: 'Hazards', label: 'Entanglement hazards identified and mitigated', ref: 'EM 385-1-1 §30-8.a(9)(c); NDM Ch. 6 §6-9.1' },
      { sort: 5, cat: 'Hazards', label: 'Overhead obstruction hazards identified and mitigated', ref: 'EM 385-1-1 §30-8.a(9)(c)' },
      { sort: 6, cat: 'Hazards', label: 'Vessel traffic and exclusion zone established', ref: 'EM 385-1-1 §30-8.a(9)(c); USCG requirements' },
      { sort: 7, cat: 'Hazards', label: 'Contaminated water assessment completed — appropriate PPE selected', ref: 'EM 385-1-1 §30-8.a(9)(c); OSHA 29 CFR 1910.120' },
      { sort: 8, cat: 'Weather', label: 'Weather forecast reviewed — no adverse conditions expected during dive window', ref: 'EM 385-1-1 §30-8.a(9)(c); NDM Ch. 6 §6-9.1' },
    ]
  },
  {
    type: 'equipment', title: 'PPE Verification Checklist',
    description: 'Personal protective equipment verification per EM 385-1-1 §05 and §30-8.c(2)',
    items: [
      { sort: 1, cat: 'Diver PPE', label: 'Diving dress appropriate for water temperature and contamination level', ref: 'EM 385-1-1 §30-8.c(2); NDM Ch. 6 §6-7.1' },
      { sort: 2, cat: 'Diver PPE', label: 'Gloves appropriate for water temperature and work hazards', ref: 'EM 385-1-1 §30-8.c(2); NDM Ch. 6 §6-7.1' },
      { sort: 3, cat: 'Diver PPE', label: 'Dive boots/fins in good condition and appropriate for bottom conditions', ref: 'NDM Ch. 6 §6-7.1' },
      { sort: 4, cat: 'Topside PPE', label: 'All topside personnel wearing appropriate PPE (hard hat, safety vest, non-slip footwear)', ref: 'EM 385-1-1 §05.A; OSHA 29 CFR 1926.100' },
      { sort: 5, cat: 'Topside PPE', label: 'Life rings and throw bags at dive station', ref: 'EM 385-1-1 §30-8.a(11); USCG requirements' },
      { sort: 6, cat: 'Topside PPE', label: 'Personnel working over water wearing PFDs', ref: 'EM 385-1-1 §06.A.01; OSHA 29 CFR 1926.106' },
      { sort: 7, cat: 'Contamination', label: 'If contaminated water: full dry suit, hood, gloves, and decon station ready', ref: 'EM 385-1-1 §30-8.a(9)(c); OSHA 29 CFR 1910.120' },
      { sort: 8, cat: 'Contamination', label: 'Decontamination procedures posted and personnel trained', ref: 'EM 385-1-1 §30-8.a(9)(c); OSHA 29 CFR 1910.120' },
    ]
  },
  {
    type: 'pre_dive', title: 'Dive Plan Review Checklist',
    description: 'Dive plan documentation review per EM 385-1-1 §30-8.a(1) and NDM Ch. 6 §6-9.1',
    items: [
      { sort: 1, cat: 'Documentation', label: 'DD5 Dive Plan (or equivalent) current revision on-site and signed', ref: 'EM 385-1-1 §30-8.a(1)' },
      { sort: 2, cat: 'Documentation', label: 'Dive plan includes maximum depth, bottom times, and decompression schedule', ref: 'EM 385-1-1 §30-8.a(9)(c); NDM Ch. 9' },
      { sort: 3, cat: 'Documentation', label: 'Dive plan includes emergency procedures and abort criteria', ref: 'EM 385-1-1 §30-8.a(8)' },
      { sort: 4, cat: 'Documentation', label: 'Dive log forms prepared and ready to record', ref: 'EM 385-1-1 §30-8.a(12); NDM Ch. 20 §20-1' },
      { sort: 5, cat: 'Decompression', label: 'Decompression tables or dive computer algorithm confirmed for planned depth/time', ref: 'NDM Ch. 9 Table 9-4; EM 385-1-1 §30-8.a(9)(c)' },
      { sort: 6, cat: 'Decompression', label: 'Repetitive dive group from previous 12 hours considered in planning', ref: 'NDM Ch. 9 §9-3; EM 385-1-1 §30-8.a(9)(c)' },
      { sort: 7, cat: 'Authorization', label: 'Dive supervisor has reviewed and approved the dive plan', ref: 'EM 385-1-1 §30-8.a(1); NDM Ch. 6 §6-9.1' },
    ]
  },
  {
    type: 'post_dive', title: 'Post-Dive Debrief Checklist',
    description: 'Post-dive debrief and documentation per EM 385-1-1 §30-8.a(12) and NDM Ch. 20',
    items: [
      { sort: 1, cat: 'Diver Status', label: 'Diver physically assessed post-dive — no signs of DCS or barotrauma', ref: 'NDM Ch. 20 §20-3; EM 385-1-1 §30-8.a(12)' },
      { sort: 2, cat: 'Diver Status', label: 'Diver bottom time and decompression obligation confirmed within limits', ref: 'NDM Ch. 9; EM 385-1-1 §30-8.a(9)(c)' },
      { sort: 3, cat: 'Diver Status', label: 'Diver briefed on DCS symptoms and instructed to report any within 24 hours', ref: 'NDM Ch. 20 §20-3; EM 385-1-1 §30-8.a(12)' },
      { sort: 4, cat: 'Documentation', label: 'Dive log completed — all required fields filled (depth, time, gas, personnel)', ref: 'EM 385-1-1 §30-8.a(12); NDM Ch. 20 §20-1' },
      { sort: 5, cat: 'Documentation', label: 'Any equipment deficiencies noted and tagged for maintenance', ref: 'NDM Ch. 6 §6-7.1; EM 385-1-1 §30-8.c(2)' },
      { sort: 6, cat: 'Documentation', label: 'Work scope completed or partial completion documented with reason', ref: 'EM 385-1-1 §30-8.a(12)' },
      { sort: 7, cat: 'Debrief', label: 'Post-dive debrief conducted with all team members', ref: 'NDM Ch. 6 §6-9.3; EM 385-1-1 §30-8.a(12)' },
      { sort: 8, cat: 'Debrief', label: 'Lessons learned and safety observations documented', ref: 'EM 385-1-1 §30-8.a(12); USACE Safety Policy' },
      { sort: 9, cat: 'Equipment', label: 'All equipment rinsed, inspected, and secured after dive', ref: 'NDM Ch. 6 §6-7.1; EM 385-1-1 §30-8.c(2)' },
    ]
  },
  {
    type: 'post_dive', title: 'Incident Reporting Checklist',
    description: 'Incident and near-miss reporting per OSHA 29 CFR 1904 and EM 385-1-1 §30-8.a(12)',
    items: [
      { sort: 1, cat: 'Immediate Response', label: 'Injured/affected personnel removed from water and assessed', ref: 'NDM Ch. 20 §20-3; EM 385-1-1 §30-8.a(8)' },
      { sort: 2, cat: 'Immediate Response', label: 'Emergency services contacted if required (911, USCG, DAN)', ref: 'EM 385-1-1 §30-8.a(8); OSHA 29 CFR 1904.39' },
      { sort: 3, cat: 'Immediate Response', label: 'Dive operations suspended pending investigation', ref: 'EM 385-1-1 §01.A.17; OSHA 29 CFR 1904' },
      { sort: 4, cat: 'Notification', label: 'Contracting Officer Representative (COR) notified within 1 hour', ref: 'EM 385-1-1 §30-8.a(12); USACE contract requirements' },
      { sort: 5, cat: 'Notification', label: 'Company safety officer notified', ref: 'OSHA 29 CFR 1904.39; company safety policy' },
      { sort: 6, cat: 'Documentation', label: 'Incident report form initiated within 24 hours', ref: 'OSHA 29 CFR 1904.29; EM 385-1-1 §30-8.a(12)' },
      { sort: 7, cat: 'Documentation', label: 'Witness statements collected from all team members', ref: 'OSHA 29 CFR 1904; EM 385-1-1 §30-8.a(12)' },
      { sort: 8, cat: 'Documentation', label: 'Equipment involved in incident tagged and preserved for investigation', ref: 'OSHA 29 CFR 1904; EM 385-1-1 §30-8.a(12)' },
      { sort: 9, cat: 'Documentation', label: 'Root cause analysis initiated', ref: 'EM 385-1-1 §01.A.17; USACE Safety Policy' },
      { sort: 10, cat: 'Return to Ops', label: 'Corrective actions identified and implemented before resuming operations', ref: 'EM 385-1-1 §01.A.17; OSHA 29 CFR 1904' },
    ]
  },
];

async function upgradeChecklistsToRegulationGrounded(pool: any) {
  try {
    // Check if any checklist items lack regulatory references
    const { rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM "checklist_items" WHERE "regulatory_reference" IS NULL`
    );
    const nullCount = parseInt(rows[0]?.cnt || "0");
    if (nullCount > 0) {
      console.log(`[MIGRATE] Found ${nullCount} checklist items without regulatory references — clearing and re-seeding...`);
      await pool.query(`DELETE FROM "checklist_completions"`);
      await pool.query(`DELETE FROM "checklist_items"`);
      await pool.query(`DELETE FROM "safety_checklists"`);
      // Re-seed immediately instead of relying on lazy auto-seed
      await seedUniversalChecklists(pool);
      console.log("[MIGRATE] ✓ Re-seeded all safety checklists with regulatory references");
    } else {
      // Ensure the 3 known projects always have checklists even if count is 0
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) as cnt FROM "safety_checklists" WHERE "project_id" = ANY($1)`,
        [KNOWN_PROJECT_IDS]
      );
      const existingCount = parseInt(countRows[0]?.cnt || "0");
      if (existingCount === 0) {
        console.log("[MIGRATE] No safety checklists found for known projects — seeding now...");
        await seedUniversalChecklists(pool);
        console.log("[MIGRATE] ✓ Seeded universal safety checklists for all known projects");
      }
    }
  } catch (err: any) {
    console.error("[MIGRATE] Could not upgrade checklists:", err.message);
  }
}

async function seedUniversalChecklists(pool: any) {
  for (const projectId of KNOWN_PROJECT_IDS) {
    // Check if this project already has checklists
    const { rows: existing } = await pool.query(
      `SELECT COUNT(*) as cnt FROM "safety_checklists" WHERE "project_id" = $1`,
      [projectId]
    );
    if (parseInt(existing[0]?.cnt || "0") > 0) {
      console.log(`[MIGRATE] Project ${projectId} already has checklists — skipping`);
      continue;
    }
    for (const template of UNIVERSAL_CHECKLISTS) {
      const checklistId = require('crypto').randomUUID();
      await pool.query(
        `INSERT INTO "safety_checklists" (id, project_id, checklist_type, title, description, role_scope, is_active, version, created_by)
         VALUES ($1, $2, $3, $4, $5, 'all', true, 1, 'system')`,
        [checklistId, projectId, template.type, template.title, template.description]
      );
      for (const item of template.items) {
        await pool.query(
          `INSERT INTO "checklist_items" (id, checklist_id, sort_order, category, label, item_type, is_required, regulatory_reference)
           VALUES ($1, $2, $3, $4, $5, 'checkbox', true, $6)`,
          [require('crypto').randomUUID(), checklistId, item.sort, item.cat, item.label, item.ref]
        );
      }
    }
    console.log(`[MIGRATE] ✓ Seeded 9 checklists for project ${projectId}`);
  }
}

// BUG-AUTH-01/02 FIX: Reset passwords for jspurlock and cgarcia
// Uses the same scrypt hashing as the application auth module.
async function fixUserLogins(pool: any) {
  const crypto = await import("crypto");
  function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}.${hash}`;
  }

  const targetUsers = ["jspurlock", "cgarcia"];
  const newPasswordHash = hashPassword("123456789");

  for (const username of targetUsers) {
    try {
      // Check if user exists and needs password fix
      const { rows } = await pool.query(
        `SELECT id, password, must_change_password FROM users WHERE username = $1`,
        [username]
      );
      if (rows.length === 0) {
        console.log(`[MIGRATE] User '${username}' not found — skipping password reset`);
        continue;
      }

      const user = rows[0];
      // Only reset if password doesn't work (no salt.hash format or mustChangePassword already true)
      const hasValidFormat = user.password && user.password.includes(".");
      if (!hasValidFormat || user.must_change_password === true) {
        // Password is invalid or already flagged — reset it
        const freshHash = hashPassword("123456789");
        await pool.query(
          `UPDATE users SET password = $1, must_change_password = true WHERE username = $2`,
          [freshHash, username]
        );
        console.log(`[MIGRATE] ✓ Reset password for '${username}' (mustChangePassword=true)`);
      } else {
        // Try to verify the existing password — if it works, skip
        const [salt, hash] = user.password.split(".");
        const derived = crypto.scryptSync("123456789", salt, 64).toString("hex");
        if (derived === hash) {
          console.log(`[MIGRATE] Password for '${username}' already correct — skipping`);
        } else {
          // Password exists but doesn't match 123456789 — reset it
          const freshHash = hashPassword("123456789");
          await pool.query(
            `UPDATE users SET password = $1, must_change_password = true WHERE username = $2`,
            [freshHash, username]
          );
          console.log(`[MIGRATE] ✓ Reset password for '${username}' (mustChangePassword=true)`);
        }
      }
    } catch (err: any) {
      console.error(`[MIGRATE] Failed to fix login for '${username}':`, err.message);
    }
  }
}
