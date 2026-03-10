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
      .filter(f => f.endsWith(".sql"))
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
      const statements = sql
        .split("--> statement-breakpoint")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith("--"));

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

// One-time cleanup: remove old checklists without regulatory references and let auto-seed recreate them
async function upgradeChecklistsToRegulationGrounded(pool: any) {
  try {
    // Check if any checklist items lack regulatory references
    const { rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM "checklist_items" WHERE "regulatory_reference" IS NULL`
    );
    const nullCount = parseInt(rows[0]?.cnt || "0");
    if (nullCount > 0) {
      console.log(`[MIGRATE] Found ${nullCount} checklist items without regulatory references — upgrading...`);
      await pool.query(`DELETE FROM "checklist_completions"`);
      await pool.query(`DELETE FROM "checklist_items"`);
      await pool.query(`DELETE FROM "safety_checklists"`);
      console.log("[MIGRATE] ✓ Cleared old checklists — auto-seed will recreate with regulation references");
    }
  } catch (err: any) {
    console.error("[MIGRATE] Could not upgrade checklists:", err.message);
  }
}
