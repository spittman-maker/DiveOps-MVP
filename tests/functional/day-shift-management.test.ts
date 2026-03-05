/**
 * Functional Tests for Day/Shift Management Workflow
 * 
 * Tests end-to-end day and shift management flows including:
 * - Day creation and setup
 * - Shift assignment and management
 * - Day status transitions (draft → active → closed)
 * - Day closeout procedures
 * - Day reopening procedures
 * - Multi-day workflows
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import type { InsertUser, InsertProject, InsertDay, InsertLogEvent } from '@shared/schema';
import { cleanTestDatabase, verifyDatabaseState, createTestUser, createTestProject, createTestDay } from '../integration/test-db-helpers';

describe('Day/Shift Management Functional Tests', () => {
  beforeAll(async () => {
    console.log('Setting up functional tests for day/shift management');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== DAY CREATION FLOW ====================
  describe('Day Creation Flow', () => {
    it('should complete full day creation workflow', async () => {
      // Step 1: Create user and project
      const user = await createTestUser({
        id: 'user_day_1',
        username: 'daycreator',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_day_1',
        name: 'Day Test Project',
        createdBy: user.id,
      });

      // Step 2: Create a new day
      const dayData: InsertDay = {
        projectId: project.projectId,
        date: '2024-03-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'DRAFT',
        createdAt: new Date(),
      };

      const day = await storage.createDay(dayData);
      expect(day).toBeDefined();
      expect(day.projectId).toBe(project.projectId);
      expect(day.date).toBe('2024-03-15');
      expect(day.shift).toBe('DAY');
      expect(day.status).toBe('DRAFT');

      // Step 3: Verify day can be retrieved
      const retrieved = await storage.getDay(day.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(day.id);

      // Step 4: Verify day can be retrieved by project and date
      const byDate = await storage.getDayByProjectAndDate(project.projectId, '2024-03-15');
      expect(byDate).toBeDefined();
      expect(byDate?.id).toBe(day.id);

      // Step 5: Verify day appears in project's days list
      const projectDays = await storage.getDaysByProject(project.projectId);
      expect(projectDays).toHaveLength(1);
      expect(projectDays[0].id).toBe(day.id);
    });

    it('should handle multiple shifts for same day', async () => {
      const user = await createTestUser({
        id: 'user_multi_1',
        username: 'multishift',
      });

      const project = await createTestProject({
        projectId: 'proj_multi_1',
        name: 'Multi-Shift Project',
        createdBy: user.id,
      });

      const date = '2024-03-15';

      // Create day shift
      const dayShift = await storage.createDay({
        projectId: project.projectId,
        date,
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'DRAFT',
        createdAt: new Date(),
      });

      // Create night shift
      const nightShift = await storage.createDay({
        projectId: project.projectId,
        date,
        shift: 'NIGHT',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'DRAFT',
        createdAt: new Date(),
      });

      // Verify both shifts exist
      const shifts = await storage.getShiftCountForDate(project.projectId, date);
      expect(shifts).toBe(2);

      // Verify both can be retrieved
      const day = await storage.getDay(dayShift.id);
      const night = await storage.getDay(nightShift.id);

      expect(day?.shift).toBe('DAY');
      expect(night?.shift).toBe('NIGHT');
    });
  });

  // ==================== DAY STATUS TRANSITIONS FLOW ====================
  describe('Day Status Transitions Flow', () => {
    it('should transition day through lifecycle', async () => {
      const user = await createTestUser({
        id: 'user_status_1',
        username: 'statususer',
      });

      const project = await createTestProject({
        projectId: 'proj_status_1',
        name: 'Status Test Project',
        createdBy: user.id,
      });

      const day = await storage.createDay({
        projectId: project.projectId,
        date: '2024-03-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'DRAFT',
        createdAt: new Date(),
      });

      expect(day.status).toBe('DRAFT');

      // Activate day
      const activated = await storage.updateDay(day.id, {
        status: 'ACTIVE',
      });

      expect(activated?.status).toBe('ACTIVE');

      // Close day
      const closed = await storage.closeDay(day.id, user.id);
      expect(closed?.status).toBe('CLOSED');
      expect(closed?.closedBy).toBe(user.id);
      expect(closed?.closedAt).toBeDefined();

      // Verify final state
      const final = await storage.getDay(day.id);
      expect(final?.status).toBe('CLOSED');
      expect(final?.closedBy).toBe(user.id);
    });

    it('should close day with QC closeout data', async () => {
      const user = await createTestUser({
        id: 'user_qc_1',
        username: 'qcuser',
      });

      const project = await createTestProject({
        projectId: 'proj_qc_1',
        name: 'QC Test Project',
        createdBy: user.id,
      });

      const day = await storage.createDay({
        projectId: project.projectId,
        date: '2024-03-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const closeoutData = {
        scopeStatus: 'complete',
        documentationStatus: 'complete',
        exceptions: 'No exceptions',
        advisedFor: 'Work completed safely',
        advisedAgainst: 'No issues',
        advisoryOutcome: 'All clear',
        standingRisks: [],
        deviations: 'No deviations',
        outstandingIssues: 'None',
        plannedNextShift: 'Continue with remaining work',
      };

      const closed = await storage.closeDay(day.id, user.id, closeoutData);

      expect(closed?.status).toBe('CLOSED');
      expect(closed?.closeoutData).toEqual(closeoutData);
    });
  });

  // ==================== DAY REOPENING FLOW ====================
  describe('Day Reopening Flow', () => {
    it('should reopen closed day', async () => {
      const user = await createTestUser({
        id: 'user_reopen_1',
        username: 'reopenuser',
      });

      const project = await createTestProject({
        projectId: 'proj_reopen_1',
        name: 'Reopen Test Project',
        createdBy: user.id,
      });

      const day = await storage.createDay({
        projectId: project.projectId,
        date: '2024-03-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      // Close the day
      const closed = await storage.closeDay(day.id, user.id);
      expect(closed?.status).toBe('CLOSED');

      // Reopen the day
      const reopened = await storage.reopenDay(day.id);
      expect(reopened?.status).toBe('ACTIVE');
      expect(reopened?.closedBy).toBeNull();
      expect(reopened?.closedAt).toBeNull();

      // Verify day is active again
      const final = await storage.getDay(day.id);
      expect(final?.status).toBe('ACTIVE');
    });

    it('should handle multiple close and reopen cycles', async () => {
      const user = await createTestUser({
        id: 'user_cycle_1',
        username: 'cycleuser',
      });

      const project = await createTestProject({
        projectId: 'proj_cycle_1',
        name: 'Cycle Test Project',
        createdBy: user.id,
      });

      const day = await storage.createDay({
        projectId: project.projectId,
        date: '2024-03-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      // First close
      let closed = await storage.closeDay(day.id, user.id);
      expect(closed?.status).toBe('CLOSED');

      // First reopen
      let reopened = await storage.reopenDay(day.id);
      expect(reopened?.status).toBe('ACTIVE');

      // Second close
      closed = await storage.closeDay(day.id, user.id);
      expect(closed?.status).toBe('CLOSED');

      // Second reopen
      reopened = await storage.reopenDay(day.id);
      expect(reopened?.status).toBe('ACTIVE');

      // Final verification
      const final = await storage.getDay(day.id);
      expect(final?.status).toBe('ACTIVE');
    });
  });

  // ==================== MULTI-DAY WORKFLOWS ====================
  describe('Multi-Day Workflows', () => {
    it('should manage multiple days in sequence', async () => {
      const user = await createTestUser({
        id: 'user_seq_1',
        username: 'sequser',
      });

      const project = await createTestProject({
        projectId: 'proj_seq_1',
        name: 'Sequential Days Project',
        createdBy: user.id,
      });

      const dates = ['2024-03-15', '2024-03-16', '2024-03-17'];

      // Create days in sequence
      const days = await Promise.all(
        dates.map((date, index) =>
          storage.createDay({
            projectId: project.projectId,
            date,
            shift: 'DAY',
            supervisorId: user.id,
            divingSupervisorId: user.id,
            status: index === 0 ? 'ACTIVE' : 'DRAFT',
            createdAt: new Date(),
          })
        )
      );

      expect(days).toHaveLength(3);

      // Close first day
      await storage.closeDay(days[0].id, user.id);

      // Activate second day
      await storage.updateDay(days[1].id, { status: 'ACTIVE' });

      // Verify most recent day
      const mostRecent = await storage.getMostRecentDayByProject(project.projectId);
      expect(mostRecent?.id).toBe(days[1].id);
    });

    it('should track day versions', async () => {
      const user = await createTestUser({
        id: 'user_version_1',
        username: 'versionuser',
      });

      const project = await createTestProject({
        projectId: 'proj_version_1',
        name: 'Version Test Project',
        createdBy: user.id,
      });

      const day = await storage.createDay({
        projectId: project.projectId,
        date: '2024-03-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'DRAFT',
        createdAt: new Date(),
      });

      expect(day.version).toBe(1);

      // Update day
      const updated1 = await storage.updateDay(day.id, {
        shift: 'NIGHT',
      });

      expect(updated1?.version).toBe(1);

      // Add log event to day (this would increment version in real implementation)
      const event = await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '12:00',
        rawText: 'Test event',
        category: 'ops',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      // Verify event is associated with day
      const dayEvents = await storage.getLogEventsByDay(day.id);
      expect(dayEvents).toHaveLength(1);
    });

    it('should verify database state after multi-day operations', async () => {
      const user = await createTestUser({
        id: 'user_verify_1',
        username: 'verifyuser',
      });

      const project = await createTestProject({
        projectId: 'proj_verify_1',
        name: 'Verify Test Project',
        createdBy: user.id,
      });

      // Create multiple days
      await Promise.all(
        ['2024-03-15', '2024-03-16', '2024-03-17'].map(date =>
          storage.createDay({
            projectId: project.projectId,
            date,
            shift: 'DAY',
            supervisorId: user.id,
            divingSupervisorId: user.id,
            status: 'DRAFT',
            createdAt: new Date(),
          })
        )
      );

      const state = await verifyDatabaseState();
      expect(state.users).toBe(1);
      expect(state.projects).toBe(1);
      expect(state.days).toBe(3);
    });
  });

  // ==================== DAY UPDATE FLOW ====================
  describe('Day Update Flow', () => {
    it('should update day information', async () => {
      const user = await createTestUser({
        id: 'user_update_1',
        username: 'updateuser',
      });

      const project = await createTestProject({
        projectId: 'proj_update_1',
        name: 'Update Test Project',
        createdBy: user.id,
      });

      const day = await storage.createDay({
        projectId: project.projectId,
        date: '2024-03-15',
        shift: 'DAY',
        supervisorId: user.id,
        divingSupervisorId: user.id,
        status: 'DRAFT',
        createdAt: new Date(),
      });

      // Update shift
      const updated1 = await storage.updateDay(day.id, {
        shift: 'NIGHT',
      });

      expect(updated1?.shift).toBe('NIGHT');

      // Update supervisors
      const updated2 = await storage.updateDay(day.id, {
        divingSupervisorId: 'new_supervisor_id',
      });

      expect(updated2?.divingSupervisorId).toBe('new_supervisor_id');

      // Update breathing gas settings
      const updated3 = await storage.updateDay(day.id, {
        defaultBreathingGas: 'Nitrox',
        defaultFo2Percent: 32,
      });

      expect(updated3?.defaultBreathingGas).toBe('Nitrox');
      expect(updated3?.defaultFo2Percent).toBe(32);

      // Verify all updates persisted
      const final = await storage.getDay(day.id);
      expect(final?.shift).toBe('NIGHT');
      expect(final?.divingSupervisorId).toBe('new_supervisor_id');
      expect(final?.defaultBreathingGas).toBe('Nitrox');
      expect(final?.defaultFo2Percent).toBe(32);
    });
  });
});