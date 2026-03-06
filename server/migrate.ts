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

      try {
        // Split on statement breakpoints if present (drizzle-kit format)
        const statements = sql
          .split("--> statement-breakpoint")
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith("--"));

        for (const stmt of statements) {
          if (stmt.trim()) {
            await pool.query(stmt);
          }
        }

        // Record the migration
        await pool.query(
          `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES ($1) ON CONFLICT DO NOTHING`,
          [file]
        );

        migrationsRun++;
        console.log(`[MIGRATE] ✓ Applied: ${file}`);
      } catch (err: any) {
        // If the column already exists, that's fine — mark as applied
        if (err.code === "42701") { // duplicate_column
          console.log(`[MIGRATE] Column already exists, marking as applied: ${file}`);
          await pool.query(
            `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES ($1) ON CONFLICT DO NOTHING`,
            [file]
          );
          migrationsRun++;
        } else {
          console.error(`[MIGRATE] ✗ Failed to apply ${file}:`, err.message);
          throw err;
        }
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
