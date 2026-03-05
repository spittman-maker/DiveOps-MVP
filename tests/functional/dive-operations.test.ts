/**
 * Functional Tests for Dive Operations Workflow
 * 
 * Tests end-to-end dive operation workflows including:
 * - Dive creation and setup
 * - Dive time tracking (LS, LB, RB, RS)
 * - Dive confirmation and completion
 * - Multi-dive workflows
 * - Diver roster management
 * - Dive plan integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import type { InsertUser, InsertProject, InsertDay, InsertDive, InsertDiveConfirmation } from '@shared/schema';
import { cleanTestDatabase, verifyDatabaseState, createTestUser, createTestProject, createTestDay } from '../integration/test-db-helpers';

describe('Dive Operations Functional Tests', () => {
  beforeAll(async () => {
    console.log('Setting up functional tests for dive operations');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== DIVE CREATION FLOW ====================
  describe('Dive Creation Flow', () => {
    it('should complete full dive creation workflow', async () => {
      // Step 1: Create user, project, and day
      const diver = await createTestUser({
        id: 'user_dive_1',
        username: 'diver1',
        role: 'DIVER',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_1',
        username: 'supervisor1',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_dive_1',
        name: 'Dive Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      // Step 2: Create a dive
      const diveData: InsertDive = {
        dayId: day.id,
        diverId: diver.id,
        diveNumber: 1,
        station: 'A',
        status: 'PENDING',
        createdAt: new Date(),
        version: 1,
      };

      const dive = await storage.createDive(diveData);
      expect(dive).toBeDefined();
      expect(dive.dayId).toBe(day.id);
      expect(dive.diverId).toBe(diver.id);
      expect(dive.station).toBe('A');
      expect(dive.status).toBe('PENDING');

      // Step 3: Verify dive can be retrieved
      const retrieved = await storage.getDive(dive.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(dive.id);

      // Step 4: Verify dive appears in day's dives
      const dayDives = await storage.getDivesByDay(day.id);
      expect(dayDives).toHaveLength(1);
      expect(dayDives[0].id).toBe(dive.id);

      // Step 5: Verify dive appears in diver's dives
      const diverDives = await storage.getDivesByDiver(diver.id, day.id);
      expect(diverDives).toHaveLength(1);
      expect(diverDives[0].id).toBe(dive.id);
    });

    it('should create dive using getOrCreateDiveForDiver', async () => {
      const diver = await createTestUser({
        id: 'user_create_1',
        username: 'divercreate',
        role: 'DIVER',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_create_1',
        username: 'supcreate',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_create_1',
        name: 'Create Dive Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      // Create dive using helper function
      const dive = await storage.getOrCreateDiveForDiver(
        day.id,
        project.projectId,
        diver.id,
        'A'
      );

      expect(dive).toBeDefined();
      expect(dive.diverId).toBe(diver.id);
      expect(dive.station).toBe('A');

      // Calling again should return existing dive
      const dive2 = await storage.getOrCreateDiveForDiver(
        day.id,
        project.projectId,
        diver.id,
        'A'
      );

      expect(dive2.id).toBe(dive.id);
    });

    it('should create dive using getOrCreateDiveByDisplayName', async () => {
      const supervisor = await createTestUser({
        id: 'user_sup_name_1',
        username: 'supname',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_name_1',
        name: 'Display Name Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      // Create dive using display name
      const dive = await storage.getOrCreateDiveByDisplayName(
        day.id,
        project.projectId,
        'John Smith',
        'B'
      );

      expect(dive).toBeDefined();
      expect(dive.station).toBe('B');

      // Calling again should return existing dive
      const dive2 = await storage.getOrCreateDiveByDisplayName(
        day.id,
        project.projectId,
        'John Smith',
        'B'
      );

      expect(dive2.id).toBe(dive.id);
    });
  });

  // ==================== DIVE TIME TRACKING FLOW ====================
  describe('Dive Time Tracking Flow', () => {
    it('should track all dive times (LS, LB, RB, RS)', async () => {
      const diver = await createTestUser({
        id: 'user_time_1',
        username: 'timetracker',
        role: 'DIVER',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_time_1',
        username: 'suptime',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_time_1',
        name: 'Time Tracking Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      const dive = await storage.createDive({
        dayId: day.id,
        diverId: diver.id,
        diveNumber: 1,
        station: 'A',
        status: 'PENDING',
        createdAt: new Date(),
        version: 1,
      });

      // Record Left Splash (LS)
      const lsTime = new Date('2024-03-15T08:00:00');
      const lsUpdate = await storage.updateDiveTimes(
        dive.id,
        'lsTime',
        lsTime,
        0
      );

      expect(lsUpdate?.lsTime).toBeDefined();

      // Record Left Bottom (LB)
      const lbTime = new Date('2024-03-15T08:05:00');
      const lbUpdate = await storage.updateDiveTimes(
        dive.id,
        'lbTime',
        lbTime,
        120
      );

      expect(lbUpdate?.lbTime).toBeDefined();

      // Record Right Bottom (RB)
      const rbTime = new Date('2024-03-15T08:30:00');
      const rbUpdate = await storage.updateDiveTimes(
        dive.id,
        'rbTime',
        rbTime,
        120
      );

      expect(rbUpdate?.rbTime).toBeDefined();

      // Record Right Splash (RS)
      const rsTime = new Date('2024-03-15T08:35:00');
      const rsUpdate = await storage.updateDiveTimes(
        dive.id,
        'rsTime',
        rsTime
      );

      expect(rsUpdate?.rsTime).toBeDefined();

      // Verify all times are recorded
      const final = await storage.getDive(dive.id);
      expect(final?.lsTime).toBeDefined();
      expect(final?.lbTime).toBeDefined();
      expect(final?.rbTime).toBeDefined();
      expect(final?.rsTime).toBeDefined();
    });

    it('should update dive status based on time tracking', async () => {
      const diver = await createTestUser({
        id: 'user_status_1',
        username: 'statusdiver',
        role: 'DIVER',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_status_1',
        username: 'supstatus',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_status_1',
        name: 'Status Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      const dive = await storage.createDive({
        dayId: day.id,
        diverId: diver.id,
        diveNumber: 1,
        station: 'A',
        status: 'PENDING',
        createdAt: new Date(),
        version: 1,
      });

      expect(dive.status).toBe('PENDING');

      // Record LS - dive should be IN_PROGRESS
      await storage.updateDiveTimes(dive.id, 'lsTime', new Date());
      await storage.updateDive(dive.id, { status: 'IN_PROGRESS' });

      let updated = await storage.getDive(dive.id);
      expect(updated?.status).toBe('IN_PROGRESS');

      // Record RS - dive should be COMPLETE
      await storage.updateDiveTimes(dive.id, 'rsTime', new Date());
      await storage.updateDive(dive.id, { status: 'COMPLETE' });

      updated = await storage.getDive(dive.id);
      expect(updated?.status).toBe('COMPLETE');
    });
  });

  // ==================== DIVE CONFIRMATION FLOW ====================
  describe('Dive Confirmation Flow', () => {
    it('should create and manage dive confirmations', async () => {
      const diver = await createTestUser({
        id: 'user_confirm_1',
        username: 'confirmdriver',
        role: 'DIVER',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_confirm_1',
        username: 'supconfirm',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_confirm_1',
        name: 'Confirmation Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      const dive = await storage.createDive({
        dayId: day.id,
        diverId: diver.id,
        diveNumber: 1,
        station: 'A',
        status: 'COMPLETE',
        createdAt: new Date(),
        version: 1,
      });

      // Create dive confirmation
      const confirmationData: InsertDiveConfirmation = {
        diveId: dive.id,
        diverId: diver.id,
        confirmed: true,
        confirmedAt: new Date(),
        notes: 'Dive completed successfully',
        maxDepth: 120,
        bottomTime: 25,
      };

      const confirmation = await storage.createDiveConfirmation(confirmationData);
      expect(confirmation).toBeDefined();
      expect(confirmation.diveId).toBe(dive.id);
      expect(confirmation.diverId).toBe(diver.id);
      expect(confirmation.confirmed).toBe(true);

      // Retrieve confirmation
      const retrieved = await storage.getDiveConfirmation(dive.id, diver.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.confirmed).toBe(true);
      expect(retrieved?.maxDepth).toBe(120);
    });
  });

  // ==================== MULTI-DIVE WORKFLOWS ====================
  describe('Multi-Dive Workflows', () => {
    it('should manage multiple dives for same diver', async () => {
      const diver = await createTestUser({
        id: 'user_multi_1',
        username: 'multidiver',
        role: 'DIVER',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_multi_1',
        username: 'supmulti',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_multi_1',
        name: 'Multi-Dive Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      // Create multiple dives for same diver
      const dives = await Promise.all(
        [1, 2, 3].map(diveNumber =>
          storage.createDive({
            dayId: day.id,
            diverId: diver.id,
            diveNumber,
            station: 'A',
            status: 'PENDING',
            createdAt: new Date(),
            version: 1,
          })
        )
      );

      expect(dives).toHaveLength(3);

      // Verify all dives are retrieved
      const diverDives = await storage.getDivesByDiver(diver.id, day.id);
      expect(diverDives).toHaveLength(3);

      // Verify dive numbers are correct
      const diveNumbers = diverDives.map(d => d.diveNumber).sort((a, b) => a - b);
      expect(diveNumbers).toEqual([1, 2, 3]);
    });

    it('should manage multiple divers in same day', async () => {
      const supervisor = await createTestUser({
        id: 'user_sup_multi2_1',
        username: 'supmulti2',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_multi2_1',
        name: 'Multi-Diver Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      // Create multiple divers
      const divers = await Promise.all([
        createTestUser({ id: 'diver_a', username: 'divera', role: 'DIVER' }),
        createTestUser({ id: 'diver_b', username: 'diverb', role: 'DIVER' }),
        createTestUser({ id: 'diver_c', username: 'diverc', role: 'DIVER' }),
      ]);

      // Create dives for each diver
      await Promise.all(
        divers.map((diver, index) =>
          storage.createDive({
            dayId: day.id,
            diverId: diver.id,
            diveNumber: 1,
            station: ['A', 'B', 'C'][index],
            status: 'PENDING',
            createdAt: new Date(),
            version: 1,
          })
        )
      );

      // Verify all dives exist
      const dayDives = await storage.getDivesByDay(day.id);
      expect(dayDives).toHaveLength(3);

      // Verify each diver has a dive
      for (const diver of divers) {
        const diverDives = await storage.getDivesByDiver(diver.id, day.id);
        expect(diverDives).toHaveLength(1);
      }
    });

    it('should verify database state after multi-dive operations', async () => {
      const diver = await createTestUser({
        id: 'user_verify_1',
        username: 'verifydiver',
        role: 'DIVER',
      });

      const supervisor = await createTestUser({
        id: 'user_sup_verify_1',
        username: 'supverify',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_verify_1',
        name: 'Verify Dive Test Project',
        createdBy: supervisor.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: supervisor.id,
        divingSupervisorId: supervisor.id,
      });

      // Create multiple dives
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          storage.createDive({
            dayId: day.id,
            diverId: diver.id,
            diveNumber: i + 1,
            station: 'A',
            status: 'PENDING',
            createdAt: new Date(),
            version: 1,
          })
        )
      );

      const state = await verifyDatabaseState();
      expect(state.users).toBe(2);
      expect(state.projects).toBe(1);
      expect(state.days).toBe(1);
      expect(state.dives).toBe(5);
    });
  });

  // ==================== DIVER ROSTER FLOW ====================
  describe('Diver Roster Flow', () => {
    it('should manage diver roster for project', async () => {
      const supervisor = await createTestUser({
        id: 'user_roster_1',
        username: 'suproster',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_roster_1',
        name: 'Roster Test Project',
        createdBy: supervisor.id,
      });

      // Add divers to roster
      await storage.upsertDiverRoster(project.projectId, 'JS', 'John Smith');
      await storage.upsertDiverRoster(project.projectId, 'JD', 'Jane Doe');
      await storage.upsertDiverRoster(project.projectId, 'BJ', 'Bob Johnson');

      // Retrieve roster
      const roster = await storage.getDiverRosterByProject(project.projectId);
      expect(roster).toHaveLength(3);

      // Verify diver names can be looked up
      const johnSmith = await storage.lookupDiverName(project.projectId, 'JS');
      expect(johnSmith).toBe('John Smith');

      const janeDoe = await storage.lookupDiverName(project.projectId, 'JD');
      expect(janeDoe).toBe('Jane Doe');

      // Update existing roster entry
      await storage.upsertDiverRoster(project.projectId, 'JS', 'John Smith Jr.');

      const updated = await storage.lookupDiverName(project.projectId, 'JS');
      expect(updated).toBe('John Smith Jr.');
    });
  });
});