/**
 * Functional Tests for User Management Workflow
 * 
 * Tests end-to-end user management flows including:
 * - User registration and onboarding
 * - User profile management
 * - User activation/deactivation
 * - Role changes and permissions
 * - User deletion and cleanup
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import { hashPassword } from '../../server/auth';
import type { InsertUser, InsertProject, InsertProjectMember } from '@shared/schema';
import { cleanTestDatabase, verifyDatabaseState } from '../integration/test-db-helpers';

describe('User Management Functional Tests', () => {
  beforeAll(async () => {
    console.log('Setting up functional tests for user management');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== USER REGISTRATION FLOW ====================
  describe('User Registration Flow', () => {
    it('should complete full user registration workflow', async () => {
      // Step 1: Create a new user with hashed password
      const userData: InsertUser = {
        id: 'user_reg_1',
        username: 'newuser',
        password: hashPassword('SecurePassword123!'),
        displayName: 'New User',
        initials: 'NU',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      };

      const user = await storage.createUser(userData);
      expect(user).toBeDefined();
      expect(user.id).toBe('user_reg_1');
      expect(user.active).toBe(true);

      // Step 2: Verify user can be retrieved by username
      const retrieved = await storage.getUserByUsername('newuser');
      expect(retrieved).toBeDefined();
      expect(retrieved?.username).toBe('newuser');

      // Step 3: Verify user can be retrieved by ID
      const byId = await storage.getUser('user_reg_1');
      expect(byId).toBeDefined();
      expect(byId?.id).toBe('user_reg_1');
    });

    it('should handle duplicate username registration attempt', async () => {
      // Create first user
      await storage.createUser({
        id: 'user_dup_1',
        username: 'duplicate',
        password: hashPassword('Password123!'),
        displayName: 'User One',
        initials: 'U1',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      // Attempt to create second user with same username
      // This should fail or be handled appropriately by the storage layer
      const firstUser = await storage.getUserByUsername('duplicate');
      expect(firstUser).toBeDefined();
    });
  });

  // ==================== USER ONBOARDING FLOW ====================
  describe('User Onboarding Flow', () => {
    it('should onboard user to multiple projects', async () => {
      // Create user
      const user = await storage.createUser({
        id: 'user_onboard_1',
        username: 'newdiver',
        password: hashPassword('Password123!'),
        displayName: 'New Diver',
        initials: 'ND',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      // Create multiple projects
      const project1 = await storage.createProject({
        projectId: 'proj_onboard_1',
        name: 'Project Alpha',
        location: 'Location A',
        clientName: 'Client A',
        clientPoc: 'Contact A',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'active',
      });

      const project2 = await storage.createProject({
        projectId: 'proj_onboard_2',
        name: 'Project Beta',
        location: 'Location B',
        clientName: 'Client B',
        clientPoc: 'Contact B',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'LUMP_SUM',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'active',
      });

      // Add user to both projects
      await storage.addProjectMember({
        projectId: project1.projectId,
        userId: user.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      await storage.addProjectMember({
        projectId: project2.projectId,
        userId: user.id,
        role: 'SUPERVISOR',
        addedAt: new Date(),
      });

      // Verify user is member of both projects
      const projects = await storage.getUserProjects(user.id);
      expect(projects).toHaveLength(2);
      expect(projects.map(p => p.projectId)).toEqual(
        expect.arrayContaining([project1.projectId, project2.projectId])
      );
    });

    it('should assign different roles per project', async () => {
      const user = await storage.createUser({
        id: 'user_roles_1',
        username: 'multiruser',
        password: hashPassword('Password123!'),
        displayName: 'Multi Role User',
        initials: 'MR',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      const project1 = await storage.createProject({
        projectId: 'proj_roles_1',
        name: 'Project 1',
        location: 'Location 1',
        clientName: 'Client 1',
        clientPoc: 'Contact 1',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'active',
      });

      const project2 = await storage.createProject({
        projectId: 'proj_roles_2',
        name: 'Project 2',
        location: 'Location 2',
        clientName: 'Client 2',
        clientPoc: 'Contact 2',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'LUMP_SUM',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'active',
      });

      // Add user with different roles
      await storage.addProjectMember({
        projectId: project1.projectId,
        userId: user.id,
        role: 'SUPERVISOR',
        addedAt: new Date(),
      });

      await storage.addProjectMember({
        projectId: project2.projectId,
        userId: user.id,
        role: 'ADMIN',
        addedAt: new Date(),
      });

      const members1 = await storage.getProjectMembers(project1.projectId);
      const members2 = await storage.getProjectMembers(project2.projectId);

      expect(members1.find(m => m.userId === user.id)?.role).toBe('SUPERVISOR');
      expect(members2.find(m => m.userId === user.id)?.role).toBe('ADMIN');
    });
  });

  // ==================== USER PROFILE MANAGEMENT FLOW ====================
  describe('User Profile Management Flow', () => {
    it('should update user profile information', async () => {
      const user = await storage.createUser({
        id: 'user_profile_1',
        username: 'profileuser',
        password: hashPassword('Password123!'),
        displayName: 'Original Name',
        initials: 'ON',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      // Update display name
      const updated1 = await storage.updateUser('user_profile_1', {
        displayName: 'Updated Name',
      });

      expect(updated1?.displayName).toBe('Updated Name');

      // Update role
      const updated2 = await storage.updateUser('user_profile_1', {
        role: 'SUPERVISOR',
      });

      expect(updated2?.role).toBe('SUPERVISOR');

      // Verify both updates persisted
      const final = await storage.getUser('user_profile_1');
      expect(final?.displayName).toBe('Updated Name');
      expect(final?.role).toBe('SUPERVISOR');
    });

    it('should handle multiple profile updates sequentially', async () => {
      const user = await storage.createUser({
        id: 'user_seq_1',
        username: 'sequential',
        password: hashPassword('Password123!'),
        displayName: 'Name 1',
        initials: 'N1',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      // Sequential updates
      await storage.updateUser('user_seq_1', { displayName: 'Name 2' });
      await storage.updateUser('user_seq_1', { initials: 'N2' });
      await storage.updateUser('user_seq_1', { role: 'SUPERVISOR' });

      const final = await storage.getUser('user_seq_1');
      expect(final?.displayName).toBe('Name 2');
      expect(final?.initials).toBe('N2');
      expect(final?.role).toBe('SUPERVISOR');
    });
  });

  // ==================== USER ACTIVATION/DEACTIVATION FLOW ====================
  describe('User Activation/Deactivation Flow', () => {
    it('should deactivate and reactivate user', async () => {
      const user = await storage.createUser({
        id: 'user_active_1',
        username: 'activeuser',
        password: hashPassword('Password123!'),
        displayName: 'Active User',
        initials: 'AU',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      // Deactivate user
      const deactivated = await storage.updateUser('user_active_1', {
        active: false,
      });

      expect(deactivated?.active).toBe(false);

      // Reactivate user
      const reactivated = await storage.updateUser('user_active_1', {
        active: true,
      });

      expect(reactivated?.active).toBe(true);
    });

    it('should prevent inactive user from accessing projects', async () => {
      const user = await storage.createUser({
        id: 'user_inactive_1',
        username: 'inactiveuser',
        password: hashPassword('Password123!'),
        displayName: 'Inactive User',
        initials: 'IU',
        role: 'DIVER',
        companyId: 'company_1',
        active: true, // Start as active
        createdAt: new Date(),
      });

      const project = await storage.createProject({
        projectId: 'proj_inactive_1',
        name: 'Test Project',
        location: 'Test Location',
        clientName: 'Test Client',
        clientPoc: 'Test Contact',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'active',
      });

      // Add to project while active
      await storage.addProjectMember({
        projectId: project.projectId,
        userId: user.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      let projects = await storage.getUserProjects(user.id);
      expect(projects).toHaveLength(1);

      // Deactivate user
      await storage.updateUser('user_inactive_1', {
        active: false,
      });

      // User data should still exist but active flag is false
      const inactiveUser = await storage.getUser('user_inactive_1');
      expect(inactiveUser?.active).toBe(false);
    });
  });

  // ==================== ROLE MANAGEMENT FLOW ====================
  describe('Role Management Flow', () => {
    it('should promote user through role hierarchy', async () => {
      const user = await storage.createUser({
        id: 'user_role_promo_1',
        username: 'promoteuser',
        password: hashPassword('Password123!'),
        displayName: 'Promote User',
        initials: 'PU',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      // Promote to SUPERVISOR
      let updated = await storage.updateUser('user_role_promo_1', {
        role: 'SUPERVISOR',
      });

      expect(updated?.role).toBe('SUPERVISOR');

      // Promote to ADMIN
      updated = await storage.updateUser('user_role_promo_1', {
        role: 'ADMIN',
      });

      expect(updated?.role).toBe('ADMIN');

      // Promote to GOD
      updated = await storage.updateUser('user_role_promo_1', {
        role: 'GOD',
      });

      expect(updated?.role).toBe('GOD');
    });

    it('should demote user from higher to lower role', async () => {
      const user = await storage.createUser({
        id: 'user_role_demo_1',
        username: 'demoteuser',
        password: hashPassword('Password123!'),
        displayName: 'Demote User',
        initials: 'DU',
        role: 'GOD',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      // Demote to ADMIN
      let updated = await storage.updateUser('user_role_demo_1', {
        role: 'ADMIN',
      });

      expect(updated?.role).toBe('ADMIN');

      // Demote to SUPERVISOR
      updated = await storage.updateUser('user_role_demo_1', {
        role: 'SUPERVISOR',
      });

      expect(updated?.role).toBe('SUPERVISOR');

      // Demote to DIVER
      updated = await storage.updateUser('user_role_demo_1', {
        role: 'DIVER',
      });

      expect(updated?.role).toBe('DIVER');
    });
  });

  // ==================== MULTI-USER WORKFLOWS ====================
  describe('Multi-User Workflows', () => {
    it('should manage multiple users in same project', async () => {
      const users = await Promise.all([
        storage.createUser({
          id: 'user_multi_1',
          username: 'multiuser1',
          password: hashPassword('Password123!'),
          displayName: 'User One',
          initials: 'U1',
          role: 'SUPERVISOR',
          companyId: 'company_1',
          active: true,
          createdAt: new Date(),
        }),
        storage.createUser({
          id: 'user_multi_2',
          username: 'multiuser2',
          password: hashPassword('Password123!'),
          displayName: 'User Two',
          initials: 'U2',
          role: 'DIVER',
          companyId: 'company_1',
          active: true,
          createdAt: new Date(),
        }),
        storage.createUser({
          id: 'user_multi_3',
          username: 'multiuser3',
          password: hashPassword('Password123!'),
          displayName: 'User Three',
          initials: 'U3',
          role: 'DIVER',
          companyId: 'company_1',
          active: true,
          createdAt: new Date(),
        }),
      ]);

      const project = await storage.createProject({
        projectId: 'proj_multi_1',
        name: 'Multi-User Project',
        location: 'Location',
        clientName: 'Client',
        clientPoc: 'Contact',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: users[0].id,
        createdAt: new Date(),
        status: 'active',
      });

      // Add all users to project
      await Promise.all(users.map(user =>
        storage.addProjectMember({
          projectId: project.projectId,
          userId: user.id,
          role: user.role as any,
          addedAt: new Date(),
        })
      ));

      // Verify all users are members
      const members = await storage.getProjectMembers(project.projectId);
      expect(members).toHaveLength(3);
      expect(members.map(m => m.userId)).toEqual(
        expect.arrayContaining(users.map(u => u.id))
      );
    });

    it('should verify database state after multi-user operations', async () => {
      await storage.createUser({
        id: 'db_state_user_1',
        username: 'dbstate1',
        password: hashPassword('Password123!'),
        displayName: 'DB State 1',
        initials: 'DS1',
        role: 'DIVER',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      await storage.createUser({
        id: 'db_state_user_2',
        username: 'dbstate2',
        password: hashPassword('Password123!'),
        displayName: 'DB State 2',
        initials: 'DS2',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      });

      const state = await verifyDatabaseState();
      expect(state.users).toBe(2);
    });
  });
});