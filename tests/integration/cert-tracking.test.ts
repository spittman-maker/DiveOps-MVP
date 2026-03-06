/**
 * Integration Tests for Certification Tracking (DB-backed)
 * 
 * Tests the diver_certifications and equipment_certifications
 * tables and their CRUD operations via the storage layer.
 * 
 * NOTE: These tests require a PostgreSQL database connection.
 * They will be skipped if DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import { cleanTestDatabase, createTestUser } from './test-db-helpers';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Certification Tracking Integration Tests', () => {
  let testUserId: string;

  beforeAll(async () => {
    console.log('Setting up cert tracking integration tests');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    const user = await createTestUser({
      id: `cert_test_user_${Date.now()}`,
      username: `certuser_${Date.now()}`,
      role: 'DIVER',
    });
    testUserId = user.id;
  });

  // ==================== DIVER CERTIFICATION TESTS ====================
  describe('Diver Certifications', () => {
    it('should create a diver certification', async () => {
      const cert = await storage.createDiverCertification({
        userId: testUserId,
        certType: 'Medical Clearance',
        certNumber: 'MED-2024-001',
        issuedDate: '2024-01-15',
        expirationDate: '2025-01-15',
        status: 'active',
      });
      expect(cert).toBeDefined();
      expect(cert.id).toBeDefined();
      expect(cert.userId).toBe(testUserId);
      expect(cert.certType).toBe('Medical Clearance');
      expect(cert.certNumber).toBe('MED-2024-001');
      expect(cert.status).toBe('active');
    });

    it('should retrieve all diver certifications', async () => {
      await storage.createDiverCertification({
        userId: testUserId,
        certType: 'Medical Clearance',
        issuedDate: '2024-01-15',
        expirationDate: '2025-01-15',
        status: 'active',
      });
      await storage.createDiverCertification({
        userId: testUserId,
        certType: 'Dive Certification',
        issuedDate: '2024-02-01',
        expirationDate: '2026-02-01',
        status: 'active',
      });

      const certs = await storage.getDiverCertifications();
      expect(certs.length).toBeGreaterThanOrEqual(2);
    });

    it('should retrieve diver certifications by user ID', async () => {
      await storage.createDiverCertification({
        userId: testUserId,
        certType: 'Medical Clearance',
        issuedDate: '2024-01-15',
        expirationDate: '2025-01-15',
        status: 'active',
      });

      const certs = await storage.getDiverCertificationsByUser(testUserId);
      expect(certs.length).toBe(1);
      expect(certs[0].userId).toBe(testUserId);
    });

    it('should update a diver certification', async () => {
      const cert = await storage.createDiverCertification({
        userId: testUserId,
        certType: 'Medical Clearance',
        issuedDate: '2024-01-15',
        expirationDate: '2025-01-15',
        status: 'active',
      });

      const updated = await storage.updateDiverCertification(cert.id, {
        status: 'expired',
        expirationDate: '2024-06-15',
      });
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('expired');
    });

    it('should delete a diver certification', async () => {
      const cert = await storage.createDiverCertification({
        userId: testUserId,
        certType: 'Medical Clearance',
        issuedDate: '2024-01-15',
        expirationDate: '2025-01-15',
        status: 'active',
      });

      const deleted = await storage.deleteDiverCertification(cert.id);
      expect(deleted).toBe(true);

      const certs = await storage.getDiverCertificationsByUser(testUserId);
      expect(certs.length).toBe(0);
    });
  });

  // ==================== EQUIPMENT CERTIFICATION TESTS ====================
  describe('Equipment Certifications', () => {
    it('should create an equipment certification', async () => {
      const cert = await storage.createEquipmentCertification({
        equipmentName: 'Dive Helmet KM-37',
        equipmentCategory: 'Dive Equipment',
        serialNumber: 'KM37-001',
        certType: 'Annual Inspection',
        issuedDate: '2024-03-01',
        expirationDate: '2025-03-01',
        status: 'active',
      });
      expect(cert).toBeDefined();
      expect(cert.id).toBeDefined();
      expect(cert.equipmentName).toBe('Dive Helmet KM-37');
      expect(cert.serialNumber).toBe('KM37-001');
    });

    it('should retrieve all equipment certifications', async () => {
      await storage.createEquipmentCertification({
        equipmentName: 'Dive Helmet KM-37',
        equipmentCategory: 'Dive Equipment',
        serialNumber: 'KM37-001',
        certType: 'Annual Inspection',
        issuedDate: '2024-03-01',
        expirationDate: '2025-03-01',
        status: 'active',
      });
      await storage.createEquipmentCertification({
        equipmentName: 'Air Compressor',
        equipmentCategory: 'Life Support',
        serialNumber: 'AC-003',
        certType: 'Air Quality Test',
        issuedDate: '2024-06-01',
        expirationDate: '2025-06-01',
        status: 'active',
      });

      const certs = await storage.getEquipmentCertifications();
      expect(certs.length).toBeGreaterThanOrEqual(2);
    });

    it('should update an equipment certification', async () => {
      const cert = await storage.createEquipmentCertification({
        equipmentName: 'Umbilicals',
        equipmentCategory: 'Dive Equipment',
        serialNumber: 'UMB-012',
        certType: 'Pressure Test',
        issuedDate: '2024-01-01',
        expirationDate: '2025-01-01',
        status: 'active',
      });

      const updated = await storage.updateEquipmentCertification(cert.id, {
        status: 'expired',
      });
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('expired');
    });

    it('should delete an equipment certification', async () => {
      const cert = await storage.createEquipmentCertification({
        equipmentName: 'Comm System',
        equipmentCategory: 'Communications',
        serialNumber: 'COM-007',
        certType: 'Function Test',
        issuedDate: '2024-01-01',
        expirationDate: '2025-01-01',
        status: 'active',
      });

      const deleted = await storage.deleteEquipmentCertification(cert.id);
      expect(deleted).toBe(true);

      const certs = await storage.getEquipmentCertifications();
      const found = certs.find(c => c.id === cert.id);
      expect(found).toBeUndefined();
    });
  });
});
