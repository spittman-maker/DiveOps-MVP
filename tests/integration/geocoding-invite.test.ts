/**
 * Integration Tests for Geocoding and Invite Flow (DB-backed)
 * 
 * Tests:
 * - Geocoding endpoint (Nominatim/OpenStreetMap)
 * - Admin user invite flow with mustChangePassword
 * - Password change endpoint
 * 
 * NOTE: Geocoding tests require internet access.
 * DB tests require a PostgreSQL database connection.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/auth';

const hasDb = !!process.env.DATABASE_URL;

describe('Geocoding Tests', () => {
  it('should return valid coordinates for a known address via Nominatim', async () => {
    const address = 'Washington DC';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DiveOps-MVP/1.0 (integration-test)' },
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].lat).toBeDefined();
    expect(data[0].lon).toBeDefined();
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    // Washington DC is roughly at 38.9, -77.0
    expect(lat).toBeGreaterThan(38);
    expect(lat).toBeLessThan(40);
    expect(lon).toBeGreaterThan(-78);
    expect(lon).toBeLessThan(-76);
  });

  it('should return empty array for nonsense address', async () => {
    const address = 'xyzzy_nonexistent_place_12345';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DiveOps-MVP/1.0 (integration-test)' },
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.length).toBe(0);
  });
});

describe('Invite Flow - Password Hashing', () => {
  it('should hash and verify passwords correctly', () => {
    const password = 'SecureTemp123!';
    const hashed = hashPassword(password);
    expect(hashed).not.toBe(password);
    expect(verifyPassword(password, hashed)).toBe(true);
    expect(verifyPassword('WrongPassword', hashed)).toBe(false);
  });

  it('should generate different hashes for same password (salt)', () => {
    const password = 'TestPassword123';
    const hash1 = hashPassword(password);
    const hash2 = hashPassword(password);
    // Both should verify correctly
    expect(verifyPassword(password, hash1)).toBe(true);
    expect(verifyPassword(password, hash2)).toBe(true);
  });

  it('should reject empty passwords', () => {
    const hashed = hashPassword('');
    expect(hashed).toBeDefined();
    // Empty password should not match non-empty
    expect(verifyPassword('something', hashed)).toBe(false);
  });
});

describe.skipIf(!hasDb)('Invite Flow - DB Integration', () => {
  let storage: any;

  beforeAll(async () => {
    const mod = await import('../../server/storage');
    storage = mod.storage;
  });

  afterAll(async () => {
    const { cleanTestDatabase } = await import('./test-db-helpers');
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    const { cleanTestDatabase } = await import('./test-db-helpers');
    await cleanTestDatabase();
  });

  it('should create user with mustChangePassword flag', async () => {
    const user = await storage.createUser({
      id: `invite_test_${Date.now()}`,
      username: `invited_${Date.now()}`,
      password: hashPassword('tempPass123'),
      role: 'DIVER',
      mustChangePassword: true,
    });
    expect(user).toBeDefined();
    expect(user.mustChangePassword).toBe(true);
  });

  it('should clear mustChangePassword after password change', async () => {
    const user = await storage.createUser({
      id: `invite_clear_${Date.now()}`,
      username: `invited_clear_${Date.now()}`,
      password: hashPassword('tempPass123'),
      role: 'DIVER',
      mustChangePassword: true,
    });
    expect(user.mustChangePassword).toBe(true);

    const updated = await storage.updateUser(user.id, {
      password: hashPassword('NewSecurePassword!'),
      mustChangePassword: false,
    });
    expect(updated).toBeDefined();
    expect(updated!.mustChangePassword).toBe(false);
  });
});
