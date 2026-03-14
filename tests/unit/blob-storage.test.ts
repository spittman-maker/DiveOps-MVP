/**
 * Unit Tests — blob-storage.ts env-var resolution
 * =================================================
 * Covers Issue #1: BLOB STORAGE ENV VAR MISMATCH
 *
 * Verifies that resolveAccountName() and resolveAccountKey() correctly
 * check both naming conventions:
 *   Long form  : AZURE_STORAGE_ACCOUNT_NAME / AZURE_STORAGE_ACCOUNT_KEY
 *   Short form : AZURE_STORAGE_ACCOUNT      / AZURE_STORAGE_KEY
 *
 * These tests do NOT make any network calls; they only exercise the
 * environment-variable resolution helpers exported from blob-storage.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Helpers to snapshot and restore env vars ──────────────────────────────

const ENV_KEYS = [
  "AZURE_STORAGE_CONNECTION_STRING",
  "AZURE_STORAGE_ACCOUNT_NAME",
  "AZURE_STORAGE_ACCOUNT_KEY",
  "AZURE_STORAGE_ACCOUNT",
  "AZURE_STORAGE_KEY",
] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: EnvSnapshot) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = snap[k];
    }
  }
}

function clearBlobEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

// ── Import helpers under test ─────────────────────────────────────────────

// We import the named helpers directly; the module is re-evaluated each time
// because Vitest isolates modules per test file.
import { resolveAccountName, resolveAccountKey } from "../../server/services/blob-storage";

// ── Test Suite ────────────────────────────────────────────────────────────

describe("blob-storage — env-var resolution (Issue #1)", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    clearBlobEnv();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  // ── resolveAccountName ───────────────────────────────────────────────────

  describe("resolveAccountName()", () => {
    it("returns undefined when neither env var is set", () => {
      expect(resolveAccountName()).toBeUndefined();
    });

    it("returns AZURE_STORAGE_ACCOUNT_NAME when only the long form is set", () => {
      process.env.AZURE_STORAGE_ACCOUNT_NAME = "longformaccount";
      expect(resolveAccountName()).toBe("longformaccount");
    });

    it("returns AZURE_STORAGE_ACCOUNT when only the short form is set", () => {
      process.env.AZURE_STORAGE_ACCOUNT = "shortformaccount";
      expect(resolveAccountName()).toBe("shortformaccount");
    });

    it("prefers AZURE_STORAGE_ACCOUNT_NAME over AZURE_STORAGE_ACCOUNT when both are set", () => {
      process.env.AZURE_STORAGE_ACCOUNT_NAME = "longformaccount";
      process.env.AZURE_STORAGE_ACCOUNT = "shortformaccount";
      expect(resolveAccountName()).toBe("longformaccount");
    });

    it("falls back to AZURE_STORAGE_ACCOUNT when AZURE_STORAGE_ACCOUNT_NAME is empty string", () => {
      process.env.AZURE_STORAGE_ACCOUNT_NAME = "";
      process.env.AZURE_STORAGE_ACCOUNT = "shortformaccount";
      // Empty string is falsy — fallback should activate
      expect(resolveAccountName()).toBe("shortformaccount");
    });
  });

  // ── resolveAccountKey ────────────────────────────────────────────────────

  describe("resolveAccountKey()", () => {
    it("returns undefined when neither env var is set", () => {
      expect(resolveAccountKey()).toBeUndefined();
    });

    it("returns AZURE_STORAGE_ACCOUNT_KEY when only the long form is set", () => {
      process.env.AZURE_STORAGE_ACCOUNT_KEY = "longformkey==";
      expect(resolveAccountKey()).toBe("longformkey==");
    });

    it("returns AZURE_STORAGE_KEY when only the short form is set", () => {
      process.env.AZURE_STORAGE_KEY = "shortformkey==";
      expect(resolveAccountKey()).toBe("shortformkey==");
    });

    it("prefers AZURE_STORAGE_ACCOUNT_KEY over AZURE_STORAGE_KEY when both are set", () => {
      process.env.AZURE_STORAGE_ACCOUNT_KEY = "longformkey==";
      process.env.AZURE_STORAGE_KEY = "shortformkey==";
      expect(resolveAccountKey()).toBe("longformkey==");
    });

    it("falls back to AZURE_STORAGE_KEY when AZURE_STORAGE_ACCOUNT_KEY is empty string", () => {
      process.env.AZURE_STORAGE_ACCOUNT_KEY = "";
      process.env.AZURE_STORAGE_KEY = "shortformkey==";
      expect(resolveAccountKey()).toBe("shortformkey==");
    });
  });

  // ── Combined resolution ──────────────────────────────────────────────────

  describe("combined resolution (Azure Container App naming convention)", () => {
    it("resolves both name and key using the short-form Azure Container App names", () => {
      process.env.AZURE_STORAGE_ACCOUNT = "myaccount";
      process.env.AZURE_STORAGE_KEY = "mykey==";
      expect(resolveAccountName()).toBe("myaccount");
      expect(resolveAccountKey()).toBe("mykey==");
    });

    it("resolves both name and key using the long-form SDK names", () => {
      process.env.AZURE_STORAGE_ACCOUNT_NAME = "myaccount";
      process.env.AZURE_STORAGE_ACCOUNT_KEY = "mykey==";
      expect(resolveAccountName()).toBe("myaccount");
      expect(resolveAccountKey()).toBe("mykey==");
    });
  });
});
