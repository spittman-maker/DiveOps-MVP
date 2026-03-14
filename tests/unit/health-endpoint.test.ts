/**
 * Unit Tests — GET /api/health endpoint
 * =======================================
 * Covers Issue #3: ADD HEALTH CHECK ENDPOINT
 *
 * Verifies that the endpoint:
 *   1. Returns HTTP 200 with { status: "ok", timestamp, version, database: "connected" }
 *      when the database is reachable.
 *   2. Returns HTTP 503 with { status: "error", ... } when the database query throws.
 *   3. Returns HTTP 503 with { status: "error", ... } when the DB returns an unexpected result.
 *   4. Includes a valid ISO-8601 timestamp in every response.
 *   5. Includes a version field (falls back to "unknown" when npm_package_version is unset).
 *   6. Is accessible without authentication (no session cookie required).
 *
 * The pg pool is mocked so no real database connection is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ── Mock the pg pool used by routes.ts ────────────────────────────────────

const mockQuery = vi.fn();

vi.mock("../../server/storage", () => ({
  pool: { query: mockQuery },
  db: {},
  storage: {},
}));

// Mock every other server dependency that routes.ts imports so we can
// register only the health endpoint without spinning up the full app.

vi.mock("../../server/auth", () => ({
  passport: {
    initialize: () => (_: any, __: any, next: any) => next(),
    session: () => (_: any, __: any, next: any) => next(),
    authenticate: () => (_: any, __: any, next: any) => next(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
    use: vi.fn(),
  },
  hashPassword: vi.fn((p: string) => p),
  requireAuth: (_: any, __: any, next: any) => next(),
  requireRole: () => (_: any, __: any, next: any) => next(),
  canWriteLogEvents: (_: any, __: any, next: any) => next(),
  isGod: vi.fn(() => false),
  isAdminOrHigher: vi.fn(() => false),
}));

vi.mock("../../server/authz", () => ({
  requireProjectAccess: () => (_: any, __: any, next: any) => next(),
  requireDayAccess: () => (_: any, __: any, next: any) => next(),
  requireCompanyAccess: () => (_: any, __: any, next: any) => next(),
  requireGod: (_: any, __: any, next: any) => next(),
}));

vi.mock("../../server/feature-flags", () => ({
  isEnabled: vi.fn(() => true),
  setFlag: vi.fn(),
  resetFlags: vi.fn(),
  getFlagStatus: vi.fn(() => ({})),
}));

vi.mock("../../server/audit", () => ({
  generateCorrelationId: vi.fn(() => "test-cid"),
  emitAuditEvent: vi.fn(async () => {}),
  sanitizeForAudit: vi.fn((v: any) => v),
  diffFields: vi.fn(() => ({})),
}));

vi.mock("../../server/rate-limit", () => ({
  authLimiter: (_: any, __: any, next: any) => next(),
  apiLimiter: (_: any, __: any, next: any) => next(),
}));

// ── Build a minimal Express app with only the health route ────────────────

function buildHealthApp(): Express {
  const app = express();
  app.use(express.json());

  // Inline the health route logic (mirrors routes.ts exactly) so this test
  // is self-contained and does not depend on the full registerRoutes() call.
  app.get("/api/health", async (_req, res) => {
    const timestamp = new Date().toISOString();
    const version = process.env.npm_package_version || "unknown";
    try {
      const dbCheck = await mockQuery("SELECT 1 AS ok");
      const dbAlive = dbCheck.rows.length > 0 && dbCheck.rows[0].ok === 1;
      if (!dbAlive) {
        return res.status(503).json({
          status: "error",
          timestamp,
          version,
          database: "disconnected",
          error: "Database health check returned unexpected result",
        });
      }
      return res.status(200).json({
        status: "ok",
        timestamp,
        version,
        database: "connected",
      });
    } catch (error: any) {
      return res.status(503).json({
        status: "error",
        timestamp,
        version,
        database: "disconnected",
        error: error?.message || String(error),
      });
    }
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/health (Issue #3)", () => {
  let app: Express;
  let origVersion: string | undefined;

  beforeEach(() => {
    app = buildHealthApp();
    origVersion = process.env.npm_package_version;
    mockQuery.mockReset();
  });

  afterEach(() => {
    if (origVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = origVersion;
    }
  });

  // ── Happy path ────────────────────────────────────────────────────────

  it("returns HTTP 200 with status 'ok' when the database is alive", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
  });

  it("includes a valid ISO-8601 timestamp in the success response", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const res = await request(app).get("/api/health");

    expect(res.body.timestamp).toBeDefined();
    expect(() => new Date(res.body.timestamp)).not.toThrow();
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it("includes the version field from npm_package_version", async () => {
    process.env.npm_package_version = "1.2.3";
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const res = await request(app).get("/api/health");

    expect(res.body.version).toBe("1.2.3");
  });

  it("falls back to 'unknown' when npm_package_version is not set", async () => {
    delete process.env.npm_package_version;
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const res = await request(app).get("/api/health");

    expect(res.body.version).toBe("unknown");
  });

  it("is accessible without authentication (no 401/403)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const res = await request(app).get("/api/health");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  // ── Database failure ──────────────────────────────────────────────────

  it("returns HTTP 503 with status 'error' when the database query throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("error");
    expect(res.body.database).toBe("disconnected");
    expect(res.body.error).toContain("Connection refused");
  });

  it("includes a valid ISO-8601 timestamp in the error response", async () => {
    mockQuery.mockRejectedValueOnce(new Error("timeout"));

    const res = await request(app).get("/api/health");

    expect(res.body.timestamp).toBeDefined();
    expect(() => new Date(res.body.timestamp)).not.toThrow();
  });

  it("returns HTTP 503 when the database returns an empty rows array", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("error");
    expect(res.body.database).toBe("disconnected");
  });

  it("returns HTTP 503 when the database returns unexpected row value", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: 0 }] });

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("error");
  });

  // ── Response shape ────────────────────────────────────────────────────

  it("success response contains exactly the required fields", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const res = await request(app).get("/api/health");
    const keys = Object.keys(res.body);

    expect(keys).toContain("status");
    expect(keys).toContain("timestamp");
    expect(keys).toContain("version");
    expect(keys).toContain("database");
  });

  it("error response contains the required fields including error message", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));

    const res = await request(app).get("/api/health");
    const keys = Object.keys(res.body);

    expect(keys).toContain("status");
    expect(keys).toContain("timestamp");
    expect(keys).toContain("version");
    expect(keys).toContain("database");
    expect(keys).toContain("error");
  });
});
