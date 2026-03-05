/**
 * Integration Tests for Storage Module (storage.ts)
 * 
 * Tests all database operations including:
 * - User management (CRUD)
 * - Project management (CRUD)
 * - Day management (CRUD)
 * - Log event management (CRUD)
 * - Dive management (CRUD)
 * - Risk item management (CRUD)
 * - Complex queries and relationships
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import type { InsertUser, InsertProject, InsertDay, InsertLogEvent, InsertDive, InsertRiskItem, InsertDivePlan, InsertProjectMember } from '@shared/schema';
import {
  cleanTestDatabase,
  createTestUser,
  createTestProject,
  createTestDay,
  createTestLogEvent,
  createTestDive,
  createTestScenario,
  verifyDatabaseState,
} from './test-db-helpers';

describe('Storage Integration Tests', () => {
  // Setup and teardown
  beforeAll(async () => {
    // Clean database before all tests
    // Note: In a real setup, you might want to ensure test DB exists
    console.log('Setting up integration tests for storage module');
  });

  afterAll(async () => {
    // Clean up after all tests
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    // Clean before each test for isolation
    await cleanTestDatabase();
  });

  // ==================== USER MANAGEMENT TESTS ====================
  describe('User Management', () => {
    it('should create a new user', async () => {
      const userData: InsertUser = {
        id: 'test_user_1',
        username: 'testuser1',
        password: 'hashed_password',
        displayName: 'Test User One',
        initials: 'TU',
        role: 'SUPERVISOR',
        companyId: 'company_1',
        active: true,
        createdAt: new Date(),
      };

      const user = await storage.createUser(userData);

      expect(user).toBeDefined();
      expect(user.id).toBe('test_user_1');
      expect(user.username).toBe('testuser1');
      expect(user.displayName).toBe('Test User One');
    });

    it('should get user by ID', async () => {
      const created = await createTestUser({ id: 'user_get_test', username: 'get_test' });
      const retrieved = await storage.getUser('user_get_test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('user_get_test');
      expect(retrieved?.username).toBe('get_test');
    });

    it('should get user by username', async () => {
      await createTestUser({ id: 'user_uname_test', username: 'uname_test' });
      const retrieved = await storage.getUserByUsername('uname_test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('user_uname_test');
      expect(retrieved?.username).toBe('uname_test');
    });

    it('should get user by initials within project', async () => {
      const project = await createTestProject();
      const user = await createTestUser({
        id: 'user_init_test',
        initials: 'XX',
      });

      const retrieved = await storage.getUserByInitials('XX', project.projectId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('user_init_test');
      expect(retrieved?.initials).toBe('XX');
    });

    it('should update user', async () => {
      const user = await createTestUser({ id: 'user_update_test', displayName: 'Original Name' });

      const updated = await storage.updateUser('user_update_test', {
        displayName: 'Updated Name',
      });

      expect(updated).toBeDefined();
      expect(updated?.displayName).toBe('Updated Name');
    });

    it('should return undefined when getting non-existent user', async () => {
      const user = await storage.getUser('non_existent_user');
      expect(user).toBeUndefined();
    });
  });

  // ==================== PROJECT MANAGEMENT TESTS ====================
  describe('Project Management', () => {
    it('should create a new project', async () => {
      const projectData: InsertProject = {
        name: 'Test Integration Project',
        projectId: 'proj_int_test',
        location: 'Test Location',
        clientName: 'Test Client',
        clientPoc: 'Test POC',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractType: 'TIME_MATERIALS',
        createdBy: 'test_user',
        createdAt: new Date(),
        status: 'active',
      };

      const project = await storage.createProject(projectData);

      expect(project).toBeDefined();
      expect(project.projectId).toBe('proj_int_test');
      expect(project.name).toBe('Test Integration Project');
    });

    it('should get project by ID', async () => {
      const created = await createTestProject({ projectId: 'proj_get_test', name: 'Get Test Project' });
      const retrieved = await storage.getProject('proj_get_test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.projectId).toBe('proj_get_test');
      expect(retrieved?.name).toBe('Get Test Project');
    });

    it('should get all projects', async () => {
      await createTestProject({ projectId: 'proj_all_1', name: 'Project 1' });
      await createTestProject({ projectId: 'proj_all_2', name: 'Project 2' });
      await createTestProject({ projectId: 'proj_all_3', name: 'Project 3' });

      const projects = await storage.getAllProjects();

      expect(projects).toHaveLength(3);
      expect(projects.map(p => p.projectId)).toEqual(
        expect.arrayContaining(['proj_all_1', 'proj_all_2', 'proj_all_3'])
      );
    });

    it('should update project', async () => {
      const project = await createTestProject({
        projectId: 'proj_update_test',
        name: 'Original Name',
      });

      const updated = await storage.updateProject('proj_update_test', {
        name: 'Updated Project Name',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Project Name');
    });

    it('should add project member', async () => {
      const project = await createTestProject();
      const user = await createTestUser();

      const memberData: InsertProjectMember = {
        projectId: project.projectId,
        userId: user.id,
        role: 'SUPERVISOR',
        addedAt: new Date(),
      };

      const member = await storage.addProjectMember(memberData);

      expect(member).toBeDefined();
      expect(member.projectId).toBe(project.projectId);
      expect(member.userId).toBe(user.id);
    });

    it('should get project members', async () => {
      const project = await createTestProject();
      const user1 = await createTestUser({ id: 'member_1', username: 'member1' });
      const user2 = await createTestUser({ id: 'member_2', username: 'member2' });

      await storage.addProjectMember({
        projectId: project.projectId,
        userId: user1.id,
        role: 'SUPERVISOR',
        addedAt: new Date(),
      });

      await storage.addProjectMember({
        projectId: project.projectId,
        userId: user2.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      const members = await storage.getProjectMembers(project.projectId);

      expect(members).toHaveLength(2);
      expect(members.map(m => m.userId)).toEqual(expect.arrayContaining([user1.id, user2.id]));
    });

    it('should get user projects', async () => {
      const user = await createTestUser({ id: 'user_projects_test' });
      const project1 = await createTestProject({ projectId: 'proj_user_1' });
      const project2 = await createTestProject({ projectId: 'proj_user_2' });

      await storage.addProjectMember({
        projectId: project1.projectId,
        userId: user.id,
        role: 'SUPERVISOR',
        addedAt: new Date(),
      });

      await storage.addProjectMember({
        projectId: project2.projectId,
        userId: user.id,
        role: 'DIVER',
        addedAt: new Date(),
      });

      const projects = await storage.getUserProjects(user.id);

      expect(projects).toHaveLength(2);
      expect(projects.map(p => p.projectId)).toEqual(
        expect.arrayContaining([project1.projectId, project2.projectId])
      );
    });
  });

  // ==================== DAY MANAGEMENT TESTS ====================
  describe('Day Management', () => {
    it('should create a new day', async () => {
      const project = await createTestProject();
      const user = await createTestUser();

      const dayData: InsertDay = {
        projectId: project.projectId,
        date: '2024-01-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'OPEN',
        createdAt: new Date(),
      };

      const day = await storage.createDay(dayData);

      expect(day).toBeDefined();
      expect(day.projectId).toBe(project.projectId);
      expect(day.date).toBe('2024-01-15');
      expect(day.shift).toBe('DAY');
    });

    it('should get day by ID', async () => {
      const project = await createTestProject();
      const day = await createTestDay(project.projectId, { date: '2024-01-20' });
      const retrieved = await storage.getDay(day.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(day.id);
      expect(retrieved?.date).toBe('2024-01-20');
    });

    it('should get day by project and date', async () => {
      const project = await createTestProject();
      await createTestDay(project.projectId, { date: '2024-02-01', shift: 'DAY' });

      const retrieved = await storage.getDayByProjectAndDate(project.projectId, '2024-02-01');

      expect(retrieved).toBeDefined();
      expect(retrieved?.date).toBe('2024-02-01');
      expect(retrieved?.shift).toBe('DAY');
    });

    it('should get days by project', async () => {
      const project = await createTestProject();
      await createTestDay(project.projectId, { date: '2024-03-01' });
      await createTestDay(project.projectId, { date: '2024-03-02' });
      await createTestDay(project.projectId, { date: '2024-03-03' });

      const days = await storage.getDaysByProject(project.projectId);

      expect(days).toHaveLength(3);
      expect(days.map(d => d.date)).toEqual(
        expect.arrayContaining(['2024-03-01', '2024-03-02', '2024-03-03'])
      );
    });

    it('should get most recent day by project', async () => {
      const project = await createTestProject();
      const day1 = await createTestDay(project.projectId, { date: '2024-04-01' });
      const day2 = await createTestDay(project.projectId, { date: '2024-04-05' });
      const day3 = await createTestDay(project.projectId, { date: '2024-04-03' });

      const recent = await storage.getMostRecentDayByProject(project.projectId);

      expect(recent).toBeDefined();
      expect(recent?.date).toBe('2024-04-05');
    });

    it('should get shift count for date', async () => {
      const project = await createTestProject();
      await createTestDay(project.projectId, { date: '2024-05-01', shift: 'DAY' });
      await createTestDay(project.projectId, { date: '2024-05-01', shift: 'NIGHT' });

      const count = await storage.getShiftCountForDate(project.projectId, '2024-05-01');

      expect(count).toBe(2);
    });

    it('should update day', async () => {
      const project = await createTestProject();
      const day = await createTestDay(project.projectId, { status: 'OPEN' });

      const updated = await storage.updateDay(day.id, {
        status: 'CLOSED',
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('CLOSED');
    });

    it('should close day', async () => {
      const project = await createTestProject();
      const user = await createTestUser();
      const day = await createTestDay(project.projectId, { status: 'OPEN', supervisorId: user.id });

      const closed = await storage.closeDay(day.id, user.id, {
        qcReviewComplete: true,
        qcReviewerId: user.id,
        qcReviewedAt: new Date(),
      });

      expect(closed).toBeDefined();
      expect(closed?.status).toBe('CLOSED');
      expect(closed?.closedBy).toBe(user.id);
    });

    it('should reopen day', async () => {
      const project = await createTestProject();
      const user = await createTestUser();
      const day = await createTestDay(project.projectId, { status: 'CLOSED', supervisorId: user.id });

      const reopened = await storage.reopenDay(day.id);

      expect(reopened).toBeDefined();
      expect(reopened?.status).toBe('OPEN');
    });
  });

  // ==================== LOG EVENT MANAGEMENT TESTS ====================
  describe('Log Event Management', () => {
    it('should create a new log event', async () => {
      const { day, user } = await createTestScenario();

      const eventData: InsertLogEvent = {
        dayId: day.id,
        eventTime: '14:30',
        rawText: 'Test log event for integration',
        category: 'routine',
        extractedData: {},
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      };

      const event = await storage.createLogEvent(eventData);

      expect(event).toBeDefined();
      expect(event.dayId).toBe(day.id);
      expect(event.rawText).toBe('Test log event for integration');
    });

    it('should get log event by ID', async () => {
      const { day, user } = await createTestScenario();
      const created = await createTestLogEvent(day.id, {
        rawText: 'Get by ID test',
        createdById: user.id,
      });
      const retrieved = await storage.getLogEvent(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.rawText).toBe('Get by ID test');
    });

    it('should get log events by day', async () => {
      const { day, user } = await createTestScenario();

      await createTestLogEvent(day.id, {
        rawText: 'Event 1',
        eventTime: '08:00',
        createdById: user.id,
      });

      await createTestLogEvent(day.id, {
        rawText: 'Event 2',
        eventTime: '10:00',
        createdById: user.id,
      });

      await createTestLogEvent(day.id, {
        rawText: 'Event 3',
        eventTime: '14:00',
        createdById: user.id,
      });

      const events = await storage.getLogEventsByDay(day.id);

      expect(events).toHaveLength(3);
      expect(events.map(e => e.rawText)).toEqual(
        expect.arrayContaining(['Event 1', 'Event 2', 'Event 3'])
      );
    });

    it('should update log event', async () => {
      const { day, user } = await createTestScenario();
      const event = await createTestLogEvent(day.id, {
        rawText: 'Original text',
        createdById: user.id,
        version: 1,
      });

      const updated = await storage.updateLogEvent(event.id, {
        rawText: 'Updated text',
      });

      expect(updated).toBeDefined();
      expect(updated?.rawText).toBe('Updated text');
      expect(updated?.version).toBe(2);
    });

    it('should handle concurrent updates with version check', async () => {
      const { day, user } = await createTestScenario();
      const event = await createTestLogEvent(day.id, {
        rawText: 'Concurrent test',
        createdById: user.id,
        version: 1,
      });

      // First update should succeed
      const update1 = await storage.updateLogEvent(event.id, {
        rawText: 'First update',
        expectedVersion: 1,
      });

      expect(update1).toBeDefined();
      expect(update1?.rawText).toBe('First update');
    });
  });

  // ==================== DIVE MANAGEMENT TESTS ====================
  describe('Dive Management', () => {
    it('should create a new dive', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({ id: 'diver_1' });

      const diveData: InsertDive = {
        dayId: day.id,
        diverId: user.id,
        diveNumber: 1,
        station: 'A',
        status: 'PENDING',
        createdAt: new Date(),
        version: 1,
      };

      const dive = await storage.createDive(diveData);

      expect(dive).toBeDefined();
      expect(dive.dayId).toBe(day.id);
      expect(dive.diverId).toBe(user.id);
      expect(dive.diveNumber).toBe(1);
    });

    it('should get dive by ID', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({ id: 'diver_get_test' });
      const created = await createTestDive(day.id, { diverId: user.id });
      const retrieved = await storage.getDive(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.diverId).toBe(user.id);
    });

    it('should get dives by day', async () => {
      const { day } = await createTestScenario();
      const user1 = await createTestUser({ id: 'diver_day_1' });
      const user2 = await createTestUser({ id: 'diver_day_2' });

      await createTestDive(day.id, { diverId: user1.id, diveNumber: 1 });
      await createTestDive(day.id, { diverId: user2.id, diveNumber: 2 });

      const dives = await storage.getDivesByDay(day.id);

      expect(dives).toHaveLength(2);
    });

    it('should get dives by diver', async () => {
      const project = await createTestProject();
      const user = await createTestUser({ id: 'diver_by_diver_test' });
      const day1 = await createTestDay(project.projectId);
      const day2 = await createTestDay(project.projectId);

      await createTestDive(day1.id, { diverId: user.id, diveNumber: 1 });
      await createTestDive(day2.id, { diverId: user.id, diveNumber: 2 });

      const dives = await storage.getDivesByDiver(user.id);

      expect(dives).toHaveLength(2);
      expect(dives.every(d => d.diverId === user.id)).toBe(true);
    });

    it('should get or create dive for diver', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({ id: 'diver_create_test' });
      const project = await createTestProject();

      const dive = await storage.getOrCreateDiveForDiver(day.id, project.projectId, user.id, 'A');

      expect(dive).toBeDefined();
      expect(dive.diverId).toBe(user.id);
      expect(dive.station).toBe('A');

      // Calling again should return the same dive
      const dive2 = await storage.getOrCreateDiveForDiver(day.id, project.projectId, user.id, 'A');
      expect(dive2.id).toBe(dive.id);
    });

    it('should get or create dive by display name', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({
        id: 'diver_display_test',
        displayName: 'John Doe',
      });
      const project = await createTestProject();

      const dive = await storage.getOrCreateDiveByDisplayName(
        day.id,
        project.projectId,
        'John Doe',
        'B'
      );

      expect(dive).toBeDefined();
      expect(dive.diverId).toBe(user.id);
      expect(dive.station).toBe('B');
    });

    it('should update dive', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({ id: 'diver_update_test' });
      const dive = await createTestDive(day.id, { diverId: user.id, status: 'PENDING', version: 1 });

      const updated = await storage.updateDive(dive.id, {
        status: 'COMPLETED',
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('COMPLETED');
    });

    it('should update dive times', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({ id: 'diver_time_test' });
      const dive = await createTestDive(day.id, { diverId: user.id });

      const updated = await storage.updateDiveTimes(dive.id, 'lsTime', new Date('2024-01-15T08:30:00'), 100);

      expect(updated).toBeDefined();
      expect(updated?.lsTime).toBeDefined();
    });

    it('should create dive confirmation', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({ id: 'diver_confirm_test' });
      const dive = await createTestDive(day.id, { diverId: user.id });

      const confirmation = await storage.createDiveConfirmation({
        diveId: dive.id,
        diverId: user.id,
        confirmedAt: new Date(),
        depthFsw: 150,
        bottomTime: 45,
      });

      expect(confirmation).toBeDefined();
      expect(confirmation.diveId).toBe(dive.id);
      expect(confirmation.diverId).toBe(user.id);
    });

    it('should get dive confirmation', async () => {
      const { day } = await createTestScenario();
      const user = await createTestUser({ id: 'diver_get_confirm_test' });
      const dive = await createTestDive(day.id, { diverId: user.id });

      await storage.createDiveConfirmation({
        diveId: dive.id,
        diverId: user.id,
        confirmedAt: new Date(),
        depthFsw: 150,
        bottomTime: 45,
      });

      const confirmation = await storage.getDiveConfirmation(dive.id, user.id);

      expect(confirmation).toBeDefined();
      expect(confirmation?.diveId).toBe(dive.id);
      expect(confirmation?.diverId).toBe(user.id);
    });
  });

  // ==================== COMPLEX WORKFLOW TESTS ====================
  describe('Complex Workflows', () => {
    it('should handle complete project-day-event-dive workflow', async () => {
      // Create complete scenario
      const { user, project, day, event } = await createTestScenario();

      // Verify all entities exist
      expect(user.id).toBeDefined();
      expect(project.projectId).toBeDefined();
      expect(day.id).toBeDefined();
      expect(event.id).toBeDefined();

      // Create multiple dives
      const diver1 = await createTestUser({ id: 'workflow_diver_1' });
      const diver2 = await createTestUser({ id: 'workflow_diver_2' });

      const dive1 = await createTestDive(day.id, { diverId: diver1.id, station: 'A' });
      const dive2 = await createTestDive(day.id, { diverId: diver2.id, station: 'B' });

      expect(dive1.id).toBeDefined();
      expect(dive2.id).toBeDefined();

      // Create dive confirmations
      await storage.createDiveConfirmation({
        diveId: dive1.id,
        diverId: diver1.id,
        confirmedAt: new Date(),
        depthFsw: 120,
        bottomTime: 30,
      });

      await storage.createDiveConfirmation({
        diveId: dive2.id,
        diverId: diver2.id,
        confirmedAt: new Date(),
        depthFsw: 140,
        bottomTime: 35,
      });

      // Verify database state
      const state = await verifyDatabaseState();
      expect(state.users).toBeGreaterThanOrEqual(3);
      expect(state.projects).toBe(1);
      expect(state.days).toBe(1);
      expect(state.logEvents).toBe(1);
      expect(state.dives).toBe(2);
    });

    it('should handle day closeout with all data', async () => {
      const user = await createTestUser();
      const project = await createTestProject({ createdBy: user.id });
      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'OPEN',
      });

      // Add log events
      await createTestLogEvent(day.id, {
        rawText: 'Morning briefing',
        eventTime: '07:00',
        createdById: user.id,
      });

      await createTestLogEvent(day.id, {
        rawText: 'Dive operations started',
        eventTime: '08:00',
        createdById: user.id,
      });

      // Add dives
      const diver = await createTestUser({ id: 'closeout_diver' });
      const dive = await createTestDive(day.id, { diverId: diver.id, station: 'A' });

      // Close day
      const closed = await storage.closeDay(day.id, user.id, {
        qcReviewComplete: true,
        qcReviewerId: user.id,
        qcReviewedAt: new Date(),
      });

      expect(closed).toBeDefined();
      expect(closed?.status).toBe('CLOSED');
      expect(closed?.closedAt).toBeDefined();
    });
  });
});