/**
 * Functional Tests for Project Management Workflow
 * 
 * Tests end-to-end project management flows including:
 * - Project creation and setup
 * - Project member management
 * - Project updates and modifications
 * - Project status changes
 * - Multi-project workflows
 * - Project deletion and cleanup
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import { hashPassword } from '../../server/auth';
import type { InsertUser, InsertProject, InsertProjectMember } from '@shared/schema';
import { cleanTestDatabase, verifyDatabaseState, createTestUser } from '../integration/test-db-helpers';

describe('Project Management Functional Tests', () => {
  beforeAll(async () => {
    console.log('Setting up functional tests for project management');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== PROJECT CREATION FLOW ====================
  describe('Project Creation Flow', () => {
    it('should complete full project creation workflow', async () => {
      // Step 1: Create a user who will be the project creator
      const user = await createTestUser({
        id: 'user_proj_1',
        username: 'projectcreator',
        role: 'SUPERVISOR',
      });

      // Step 2: Create a new project
      const projectData: InsertProject = {
        projectId: 'proj_create_1',
        name: 'New Construction Project',
        location: 'Offshore Platform Alpha',
        clientName: 'Oceanic Industries',
        clientPoc: 'John Smith',
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        contractType: 'TIME_MATERIALS',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'active',
      };

      const project = await storage.createProject(projectData);
      expect(project).toBeDefined();
      expect(project.projectId).toBe('proj_create_1');
      expect(project.name).toBe('New Construction Project');
      expect(project.createdBy).toBe(user.id);

      // Step 3: Verify project can be retrieved
      const retrieved = await storage.getProject(project.projectId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.projectId).toBe(project.projectId);

      // Step 4: Verify project appears in all projects list
      const allProjects = await storage.getAllProjects();
      expect(allProjects).toHaveLength(1);
      expect(allProjects[0].projectId).toBe(project.projectId);
    });

    it('should create projects with different contract types', async () => {
      const user = await createTestUser({
        id: 'user_contract_1',
        username: 'contractuser',
      });

      const contractTypes = ['TIME_MATERIALS', 'LUMP_SUM', 'UNIT_PRICE'] as const;
      const projects = await Promise.all(
        contractTypes.map((type, index) =>
          storage.createProject({
            projectId: `proj_contract_${index}`,
            name: `Project ${type}`,
            location: `Location ${index}`,
            clientName: `Client ${index}`,
            clientPoc: `Contact ${index}`,
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            contractType: type,
            createdBy: user.id,
            createdAt: new Date(),
            status: 'active',
          })
        )
      );

      expect(projects).toHaveLength(3);
      projects.forEach((project, index) => {
        expect(project.contractType).toBe(contractTypes[index]);
      });
    });
  });

  // ==================== PROJECT MEMBER MANAGEMENT FLOW ====================
  describe('Project Member Management Flow', () => {
    it('should add and manage project members', async () => {
      // Create supervisor
      const supervisor = await createTestUser({
        id: 'user_sup_1',
        username: 'supervisor',
        role: 'SUPERVISOR',
      });

      // Create project
      const project = await storage.createProject({
        projectId: 'proj_members_1',
        name: 'Member Test Project',
        location: 'Test Location',
        clientName: 'Test Client',
        clientPoc: 'Test Contact',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: supervisor.id,
        createdAt: new Date(),
        status: 'active',
      });

      // Create divers
      const diver1 = await createTestUser({
        id: 'user_div_1',
        username: 'diver1',
        role: 'DIVER',
      });

      const diver2 = await createTestUser({
        id: 'user_div_2',
        username: 'diver2',
        role: 'DIVER',
      });

      // Add supervisor as project member
      await storage.addProjectMember({
        projectId: project.projectId,
        userId: supervisor.id,
        role: 'SUPERVISOR',
        addedAt: new Date(),
      });

      // Add divers to project
      await storage.addProjectMember({
        projectId: project.projectId,
        userId: diver1.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      await storage.addProjectMember({
        projectId: project.projectId,
        userId: diver2.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      // Verify all members are in project
      const members = await storage.getProjectMembers(project.projectId);
      expect(members).toHaveLength(3);

      // Verify each user has correct role
      const supervisorMember = members.find(m => m.userId === supervisor.id);
      expect(supervisorMember?.role).toBe('SUPERVISOR');

      const diver1Member = members.find(m => m.userId === diver1.id);
      expect(diver1Member?.role).toBe('DIVER');

      const diver2Member = members.find(m => m.userId === diver2.id);
      expect(diver2Member?.role).toBe('DIVER');
    });

    it('should allow user to be member of multiple projects', async () => {
      const user = await createTestUser({
        id: 'user_multi_1',
        username: 'multiuser',
        role: 'SUPERVISOR',
      });

      // Create multiple projects
      const projects = await Promise.all([
        storage.createProject({
          projectId: 'proj_multi_1',
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
        }),
        storage.createProject({
          projectId: 'proj_multi_2',
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
        }),
        storage.createProject({
          projectId: 'proj_multi_3',
          name: 'Project 3',
          location: 'Location 3',
          clientName: 'Client 3',
          clientPoc: 'Contact 3',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          contractType: 'UNIT_PRICE',
          createdBy: user.id,
          createdAt: new Date(),
          status: 'active',
        }),
      ]);

      // Add user to all projects with different roles
      await Promise.all([
        storage.addProjectMember({
          projectId: projects[0].projectId,
          userId: user.id,
          role: 'SUPERVISOR',
          addedAt: new Date(),
        }),
        storage.addProjectMember({
          projectId: projects[1].projectId,
          userId: user.id,
          role: 'ADMIN',
          addedAt: new Date(),
        }),
        storage.addProjectMember({
          projectId: projects[2].projectId,
          userId: user.id,
          role: 'DIVER',
          addedAt: new Date(),
        }),
      ]);

      // Verify user is member of all projects
      const userProjects = await storage.getUserProjects(user.id);
      expect(userProjects).toHaveLength(3);
      expect(userProjects.map(p => p.projectId)).toEqual(
        expect.arrayContaining(projects.map(p => p.projectId))
      );
    });
  });

  // ==================== PROJECT UPDATE FLOW ====================
  describe('Project Update Flow', () => {
    it('should update project information', async () => {
      const user = await createTestUser({
        id: 'user_update_1',
        username: 'updateuser',
      });

      const project = await storage.createProject({
        projectId: 'proj_update_1',
        name: 'Original Name',
        location: 'Original Location',
        clientName: 'Original Client',
        clientPoc: 'Original Contact',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'active',
      });

      // Update name
      const updated1 = await storage.updateProject(project.projectId, {
        name: 'Updated Name',
      });

      expect(updated1?.name).toBe('Updated Name');

      // Update location and client
      const updated2 = await storage.updateProject(project.projectId, {
        location: 'Updated Location',
        clientName: 'Updated Client',
      });

      expect(updated2?.location).toBe('Updated Location');
      expect(updated2?.clientName).toBe('Updated Client');

      // Verify all updates persisted
      const final = await storage.getProject(project.projectId);
      expect(final?.name).toBe('Updated Name');
      expect(final?.location).toBe('Updated Location');
      expect(final?.clientName).toBe('Updated Client');
    });

    it('should handle multiple project updates sequentially', async () => {
      const user = await createTestUser({
        id: 'user_seq_1',
        username: 'sequentialuser',
      });

      const project = await storage.createProject({
        projectId: 'proj_seq_1',
        name: 'Name 1',
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

      // Sequential updates
      await storage.updateProject(project.projectId, { name: 'Name 2' });
      await storage.updateProject(project.projectId, { location: 'Location 2' });
      await storage.updateProject(project.projectId, { clientName: 'Client 2' });
      await storage.updateProject(project.projectId, { clientPoc: 'Contact 2' });

      const final = await storage.getProject(project.projectId);
      expect(final?.name).toBe('Name 2');
      expect(final?.location).toBe('Location 2');
      expect(final?.clientName).toBe('Client 2');
      expect(final?.clientPoc).toBe('Contact 2');
    });
  });

  // ==================== PROJECT STATUS FLOW ====================
  describe('Project Status Flow', () => {
    it('should change project status through lifecycle', async () => {
      const user = await createTestUser({
        id: 'user_status_1',
        username: 'statususer',
      });

      const project = await storage.createProject({
        projectId: 'proj_status_1',
        name: 'Status Test Project',
        location: 'Test Location',
        clientName: 'Test Client',
        clientPoc: 'Test Contact',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: user.id,
        createdAt: new Date(),
        status: 'draft',
      });

      expect(project.status).toBe('draft');

      // Activate project
      const activated = await storage.updateProject(project.projectId, {
        status: 'active',
      });

      expect(activated?.status).toBe('active');

      // Put on hold
      const onHold = await storage.updateProject(project.projectId, {
        status: 'on_hold',
      });

      expect(onHold?.status).toBe('on_hold');

      // Reactivate
      const reactivated = await storage.updateProject(project.projectId, {
        status: 'active',
      });

      expect(reactivated?.status).toBe('active');

      // Complete project
      const completed = await storage.updateProject(project.projectId, {
        status: 'completed',
      });

      expect(completed?.status).toBe('completed');
    });
  });

  // ==================== MULTI-PROJECT WORKFLOWS ====================
  describe('Multi-Project Workflows', () => {
    it('should manage multiple projects with shared users', async () => {
      // Create users with different roles
      const admin = await createTestUser({
        id: 'user_admin_1',
        username: 'adminuser',
        role: 'ADMIN',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_2',
        username: 'supuser',
        role: 'SUPERVISOR',
      });

      const diver = await createTestUser({
        id: 'user_div_3',
        username: 'diveruser',
        role: 'DIVER',
      });

      // Create multiple projects
      const projects = await Promise.all([
        storage.createProject({
          projectId: 'proj_shared_1',
          name: 'Project Alpha',
          location: 'Location A',
          clientName: 'Client A',
          clientPoc: 'Contact A',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          contractType: 'TIME_MATERIALS',
          createdBy: admin.id,
          createdAt: new Date(),
          status: 'active',
        }),
        storage.createProject({
          projectId: 'proj_shared_2',
          name: 'Project Beta',
          location: 'Location B',
          clientName: 'Client B',
          clientPoc: 'Contact B',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          contractType: 'LUMP_SUM',
          createdBy: admin.id,
          createdAt: new Date(),
          status: 'active',
        }),
      ]);

      // Add users to projects with appropriate roles
      // Admin is admin on both
      await storage.addProjectMember({
        projectId: projects[0].projectId,
        userId: admin.id,
        role: 'ADMIN',
        addedAt: new Date(),
      });

      await storage.addProjectMember({
        projectId: projects[1].projectId,
        userId: admin.id,
        role: 'ADMIN',
        addedAt: new Date(),
      });

      // Supervisor is supervisor on first, diver on second
      await storage.addProjectMember({
        projectId: projects[0].projectId,
        userId: supervisor.id,
        role: 'SUPERVISOR',
        addedAt: new Date(),
      });

      await storage.addProjectMember({
        projectId: projects[1].projectId,
        userId: supervisor.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      // Diver is only on second project
      await storage.addProjectMember({
        projectId: projects[1].projectId,
        userId: diver.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      // Verify admin has access to both projects
      const adminProjects = await storage.getUserProjects(admin.id);
      expect(adminProjects).toHaveLength(2);

      // Verify supervisor has access to both projects
      const supervisorProjects = await storage.getUserProjects(supervisor.id);
      expect(supervisorProjects).toHaveLength(2);

      // Verify diver only has access to one project
      const diverProjects = await storage.getUserProjects(diver.id);
      expect(diverProjects).toHaveLength(1);
      expect(diverProjects[0].projectId).toBe(projects[1].projectId);
    });

    it('should verify database state after multi-project operations', async () => {
      const user = await createTestUser({
        id: 'user_verify_1',
        username: 'verifyuser',
      });

      // Create multiple projects
      await Promise.all([
        storage.createProject({
          projectId: 'proj_verify_1',
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
        }),
        storage.createProject({
          projectId: 'proj_verify_2',
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
        }),
        storage.createProject({
          projectId: 'proj_verify_3',
          name: 'Project 3',
          location: 'Location 3',
          clientName: 'Client 3',
          clientPoc: 'Contact 3',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          contractType: 'UNIT_PRICE',
          createdBy: user.id,
          createdAt: new Date(),
          status: 'active',
        }),
      ]);

      const state = await verifyDatabaseState();
      expect(state.users).toBe(1);
      expect(state.projects).toBe(3);
    });
  });
});