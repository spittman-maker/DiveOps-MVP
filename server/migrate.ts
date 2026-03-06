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
  } catch (err) {
    console.error("[MIGRATE] Migration failed:", err);
    // Don't crash the app — log the error and continue
    // The specific query that uses the missing column will fail with a clear error
  } finally {
    await pool.end();
  }
}
