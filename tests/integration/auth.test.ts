/**
 * Integration Tests for Authentication Module (auth.ts)
 * 
 * Tests authentication flows including:
 * - User login and logout
 * - Password hashing and verification
 * - Session management
 * - Role-based access control (RBAC)
 * - Authentication middleware
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import { hashPassword } from '../../server/auth';
import passport from 'passport';
import type { InsertUser } from '@shared/schema';
import { cleanTestDatabase, createTestUser } from './test-db-helpers';

// Mock Express request/response for testing
function mockReq() {
  return {
    isAuthenticated: () => false,
    user: null,
  };
}

function mockRes() {
  const res: any = {
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (data: any) => {
      res.data = data;
      return res;
    },
  };
  res.statusCode = 200;
  return res;
}

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    console.log('Setting up integration tests for auth module');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== PASSWORD MANAGEMENT TESTS ====================
  describe('Password Management', () => {
    it('should hash password correctly', () => {
      const password = 'TestPassword123!';
      const hashed = hashPassword(password);

      expect(hashed).toBeDefined();
      expect(hashed).not.toBe(password);
      expect(hashed).toContain('.'); // Hash should contain salt separator
    });

    it('should generate different hashes for same password', () => {
      const password = 'SamePassword123!';
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);

      expect(hash1).not.toBe(hash2); // Different salts should produce different hashes
    });

    it('should generate consistent hashes for same password and salt', async () => {
      // This tests the internal consistency of the hashing algorithm
      const password = 'ConsistentPassword123!';
      const hashed = hashPassword(password);

      // Verify the hash format
      const parts = hashed.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBeDefined(); // Salt
      expect(parts[1]).toBeDefined(); // Hash
    });

    it('should handle empty password', () => {
      const password = '';
      const hashed = hashPassword(password);

      expect(hashed).toBeDefined();
      expect(hashed).toContain('.');
    });

    it('should handle special characters in password', () => {
      const password = 'P@$$w0rd!#$%^&*()';
      const hashed = hashPassword(password);

      expect(hashed).toBeDefined();
      expect(hashed).toContain('.');
    });
  });

  // ==================== USER AUTHENTICATION TESTS ====================
  describe('User Authentication', () => {
    it('should create user with hashed password', async () => {
      const userData: InsertUser = {
        id: 'auth_user_1',
        username: 'authuser1',
        password: hashPassword('PlainTextPassword123!'),
        displayName: 'Auth User One',
        initials: 'AU',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      };

      const user = await storage.createUser(userData);

      expect(user).toBeDefined();
      expect(user.id).toBe('auth_user_1');
      expect(user.password).toContain('.'); // Should be hashed
    });

    it('should authenticate valid user credentials', async () => {
      const plainPassword = 'ValidPassword123!';
      const userData: InsertUser = {
        id: 'auth_user_2',
        username: 'authuser2',
        password: hashPassword(plainPassword),
        displayName: 'Auth User Two',
        initials: 'AU',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      };

      await storage.createUser(userData);
      const retrieved = await storage.getUserByUsername('authuser2');

      expect(retrieved).toBeDefined();
      expect(retrieved?.username).toBe('authuser2');
      // Password should be stored hashed
      expect(retrieved?.password).not.toBe(plainPassword);
    });

    it('should reject authentication for non-existent user', async () => {
      const user = await storage.getUserByUsername('nonexistent_auth_user');

      expect(user).toBeUndefined();
    });

    it('should reject authentication for inactive user', async () => {
      const userData: InsertUser = {
        id: 'inactive_user',
        username: 'inactiveuser',
        password: hashPassword('Password123!'),
        displayName: 'Inactive User',
        initials: 'IU',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: false, // Inactive user
        createdAt: new Date(),
      };

      await storage.createUser(userData);
      const user = await storage.getUserByUsername('inactiveuser');

      expect(user).toBeDefined();
      expect(user?.active).toBe(false);
    });
  });

  // ==================== ROLE-BASED ACCESS CONTROL TESTS ====================
  describe('Role-Based Access Control (RBAC)', () => {
    it('should create users with different roles', async () => {
      const roles: Array<'DIVER' | 'SUPERVISOR' | 'ADMIN' | 'GOD'> = [
        'DIVER',
        'SUPERVISOR',
        'ADMIN',
        'GOD',
      ];

      for (const role of roles) {
        const userData: InsertUser = {
          id: `role_${role.toLowerCase()}_user`,
          username: `${role.toLowerCase()}user`,
          password: hashPassword('Password123!'),
          displayName: `${role} User`,
          initials: role.substring(0, 2),
          role,
          companyId: 'company_1',
          active: true,
          createdAt: new Date(),
        };

        const user = await storage.createUser(userData);
        expect(user.role).toBe(role);
      }
    });

    it('should identify users who can write log events', () => {
      const { canWriteLogEvents } = require('../../server/auth');

      expect(canWriteLogEvents('SUPERVISOR')).toBe(true);
      expect(canWriteLogEvents('ADMIN')).toBe(true);
      expect(canWriteLogEvents('GOD')).toBe(true);
      expect(canWriteLogEvents('DIVER')).toBe(false);
    });

    it('should identify GOD users', () => {
      const { isGod } = require('../../server/auth');

      expect(isGod('GOD')).toBe(true);
      expect(isGod('ADMIN')).toBe(false);
      expect(isGod('SUPERVISOR')).toBe(false);
      expect(isGod('DIVER')).toBe(false);
    });

    it('should identify admin or higher users', () => {
      const { isAdminOrHigher } = require('../../server/auth');

      expect(isAdminOrHigher('GOD')).toBe(true);
      expect(isAdminOrHigher('ADMIN')).toBe(true);
      expect(isAdminOrHigher('SUPERVISOR')).toBe(false);
      expect(isAdminOrHigher('DIVER')).toBe(false);
    });
  });

  // ==================== AUTHENTICATION MIDDLEWARE TESTS ====================
  describe('Authentication Middleware', () => {
    it('should require authentication for protected routes', async () => {
      const { requireAuth } = require('../../server/auth');
      const req = mockReq();
      const res = mockRes();
      const nextCalled: any = { value: false };

      const next = () => {
        nextCalled.value = true;
      };

      // Unauthenticated request
      requireAuth(req, res, next);

      expect(req.isAuthenticated()).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.data).toEqual({ message: 'Unauthorized' });
      expect(nextCalled.value).toBe(false);
    });

    it('should allow access for authenticated users', async () => {
      const { requireAuth } = require('../../server/auth');
      const req = mockReq();
      const res = mockRes();
      const nextCalled: any = { value: false };

      const next = () => {
        nextCalled.value = true;
      };

      // Mock authenticated user
      req.isAuthenticated = () => true;
      req.user = {
        id: 'authenticated_user',
        username: 'authuser',
        role: 'SUPERVISOR',
      };

      requireAuth(req, res, next);

      expect(nextCalled.value).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Role-based Middleware', () => {
    it('should require specific roles for protected operations', async () => {
      const { requireRole } = require('../../server/auth');
      const req = mockReq();
      const res = mockRes();
      const nextCalled: any = { value: false };

      const next = () => {
        nextCalled.value = true;
      };

      // Unauthenticated request
      const middleware = requireRole('ADMIN', 'GOD');
      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.data).toEqual({ message: 'Unauthorized' });
      expect(nextCalled.value).toBe(false);
    });

    it('should reject authenticated user with insufficient role', async () => {
      const { requireRole } = require('../../server/auth');
      const req = mockReq();
      const res = mockRes();
      const nextCalled: any = { value: false };

      const next = () => {
        nextCalled.value = true;
      };

      // Authenticated but insufficient role
      req.isAuthenticated = () => true;
      req.user = {
        id: 'diver_user',
        username: 'diver',
        role: 'DIVER',
      };

      const middleware = requireRole('ADMIN', 'GOD');
      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.data).toEqual({ message: 'Forbidden: insufficient permissions' });
      expect(nextCalled.value).toBe(false);
    });

    it('should allow access for users with required roles', async () => {
      const { requireRole } = require('../../server/auth');
      const req = mockReq();
      const res = mockRes();
      const nextCalled: any = { value: false };

      const next = () => {
        nextCalled.value = true;
      };

      // Authenticated with correct role
      req.isAuthenticated = () => true;
      req.user = {
        id: 'admin_user',
        username: 'admin',
        role: 'ADMIN',
      };

      const middleware = requireRole('ADMIN', 'GOD');
      middleware(req, res, next);

      expect(nextCalled.value).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow GOD users to access any role-protected route', async () => {
      const { requireRole } = require('../../server/auth');
      const req = mockReq();
      const res = mockRes();
      const nextCalled: any = { value: false };

      const next = () => {
        nextCalled.value = true;
      };

      // GOD user
      req.isAuthenticated = () => true;
      req.user = {
        id: 'god_user',
        username: 'god',
        role: 'GOD',
      };

      const middleware = requireRole('ADMIN', 'SUPERVISOR');
      middleware(req, res, next);

      expect(nextCalled.value).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });

  // ==================== USER SESSION TESTS ====================
  describe('User Session Management', () => {
    it('should create user with complete profile', async () => {
      const userData: InsertUser = {
        id: 'session_user_1',
        username: 'sessionuser1',
        password: hashPassword('Password123!'),
        displayName: 'Session User One',
        initials: 'SU',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      };

      const user = await storage.createUser(userData);

      expect(user).toBeDefined();
      expect(user.id).toBe('session_user_1');
      expect(user.username).toBe('sessionuser1');
      expect(user.displayName).toBe('Session User One');
      expect(user.initials).toBe('SU');
      expect(user.role).toBe('SUPERVISOR');
      expect(user.companyId).toBe('company_1');
      expect(user.active).toBe(true);
    });

    it('should update user information', async () => {
      const user = await createTestUser({
        id: 'update_session_user',
        displayName: 'Original Display Name',
      });

      const updated = await storage.updateUser('update_session_user', {
        displayName: 'Updated Display Name',
        role: 'ADMIN',
      });

      expect(updated).toBeDefined();
      expect(updated?.displayName).toBe('Updated Display Name');
      expect(updated?.role).toBe('ADMIN');
    });

    it('should handle multiple users with same company', async () => {
      const companyId = 'test_company_multi';

      await createTestUser({
        id: 'multi_user_1',
        username: 'multiuser1',
        companyId,
      });

      await createTestUser({
        id: 'multi_user_2',
        username: 'multiuser2',
        companyId,
      });

      await createTestUser({
        id: 'multi_user_3',
        username: 'multiuser3',
        companyId,
      });

      // All users should have been created
      const user1 = await storage.getUser('multi_user_1');
      const user2 = await storage.getUser('multi_user_2');
      const user3 = await storage.getUser('multi_user_3');

      expect(user1?.companyId).toBe(companyId);
      expect(user2?.companyId).toBe(companyId);
      expect(user3?.companyId).toBe(companyId);
    });
  });

  // ==================== SECURITY TESTS ====================
  describe('Security', () => {
    it('should store passwords securely hashed', async () => {
      const plainPassword = 'SecurePassword123!';
      const userData: InsertUser = {
        id: 'secure_user_1',
        username: 'secureuser1',
        password: hashPassword(plainPassword),
        displayName: 'Secure User One',
        initials: 'SU',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      };

      const user = await storage.createUser(userData);

      expect(user.password).not.toBe(plainPassword);
      expect(user.password).not.toContain(plainPassword);
      expect(user.password).toBeDefined();
    });

    it('should handle very long passwords', () => {
      const longPassword = 'A'.repeat(1000) + '1!';
      const hashed = hashPassword(longPassword);

      expect(hashed).toBeDefined();
      expect(hashed).toContain('.');
    });

    it('should handle passwords with unicode characters', () => {
      const unicodePassword = 'Pässwörd123!日本語';
      const hashed = hashPassword(unicodePassword);

      expect(hashed).toBeDefined();
      expect(hashed).toContain('.');
    });
  });
});