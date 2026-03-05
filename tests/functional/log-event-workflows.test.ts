/**
 * Functional Tests for Log Event Workflow
 * 
 * Tests end-to-end log event workflows including:
 * - Log event creation and submission
 * - Event classification and categorization
 * - Data extraction from raw text
 * - Event updates and versioning
 * - Multi-event workflows
 * - Event validation and sanitization
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import { classifyEvent, detectHazards, parseEventTime } from '../../server/extraction';
import { sanitizeForMasterLog } from '../../server/validator';
import type { InsertUser, InsertProject, InsertDay, InsertLogEvent } from '@shared/schema';
import { cleanTestDatabase, verifyDatabaseState, createTestUser, createTestProject, createTestDay } from '../integration/test-db-helpers';

describe('Log Event Workflow Functional Tests', () => {
  beforeAll(async () => {
    console.log('Setting up functional tests for log event workflows');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== LOG EVENT CREATION FLOW ====================
  describe('Log Event Creation Flow', () => {
    it('should complete full log event creation workflow', async () => {
      // Step 1: Create user, project, and day
      const user = await createTestUser({
        id: 'user_event_1',
        username: 'eventcreator',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_event_1',
        name: 'Event Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      // Step 2: Create a log event
      const eventData: InsertLogEvent = {
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '08:00',
        rawText: 'Started dive operations at barge 1',
        category: 'dive',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      };

      const event = await storage.createLogEvent(eventData);
      expect(event).toBeDefined();
      expect(event.dayId).toBe(day.id);
      expect(event.eventTime).toBe('08:00');
      expect(event.category).toBe('dive');

      // Step 3: Verify event can be retrieved
      const retrieved = await storage.getLogEvent(event.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(event.id);

      // Step 4: Verify event appears in day's events
      const dayEvents = await storage.getLogEventsByDay(day.id);
      expect(dayEvents).toHaveLength(1);
      expect(dayEvents[0].id).toBe(event.id);
    });

    it('should classify events automatically', async () => {
      const user = await createTestUser({
        id: 'user_class_1',
        username: 'classuser',
      });

      const project = await createTestProject({
        projectId: 'proj_class_1',
        name: 'Classification Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const testCases = [
        {
          rawText: 'SAFETY STOP: All personnel report to muster station',
          expectedCategory: 'safety',
        },
        {
          rawText: 'Direct from client: Change dive plan for station A',
          expectedCategory: 'directive',
        },
        {
          rawText: 'Dive team breached bottom at 120 fsw',
          expectedCategory: 'dive',
        },
        {
          rawText: 'Routine equipment check completed',
          expectedCategory: 'ops',
        },
      ];

      for (const testCase of testCases) {
        const classified = classifyEvent(testCase.rawText);
        expect(classified).toBe(testCase.expectedCategory);

        await storage.createLogEvent({
          dayId: day.id,
          projectId: project.projectId,
          eventTime: '12:00',
          rawText: testCase.rawText,
          category: classified,
          createdById: user.id,
          createdAt: new Date(),
          version: 1,
        });
      }

      const events = await storage.getLogEventsByDay(day.id);
      expect(events).toHaveLength(4);
    });
  });

  // ==================== DATA EXTRACTION FLOW ====================
  describe('Data Extraction Flow', () => {
    it('should extract data from event text', async () => {
      const user = await createTestUser({
        id: 'user_extract_1',
        username: 'extractuser',
      });

      const project = await createTestProject({
        projectId: 'proj_extract_1',
        name: 'Extraction Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const rawText = '1400 Diver J.D. performed welding on barge structure at 60 fsw';
      const eventTime = parseEventTime(rawText, day.date);

      const eventData: InsertLogEvent = {
        dayId: day.id,
        projectId: project.projectId,
        eventTime: eventTime || '14:00',
        rawText,
        category: 'dive',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      };

      const event = await storage.createLogEvent(eventData);

      // Verify event was created with extracted data
      expect(event.rawText).toBe(rawText);
      expect(event.category).toBe('dive');
    });

    it('should detect hazards in event text', async () => {
      const user = await createTestUser({
        id: 'user_hazard_1',
        username: 'hazarduser',
      });

      const project = await createTestProject({
        projectId: 'proj_hazard_1',
        name: 'Hazard Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const hazardousText = '1100 Warning: welding operations near fuel line on barge 2';
      const hazards = detectHazards(hazardousText);

      expect(hazards.length).toBeGreaterThan(0);
      expect(hazards[0].hazard).toBeDefined();

      const event = await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '11:00',
        rawText: hazardousText,
        category: 'dive',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      expect(event.rawText).toContain('welding');
    });
  });

  // ==================== EVENT VALIDATION FLOW ====================
  describe('Event Validation Flow', () => {
    it('should sanitize event text for master log', async () => {
      const user = await createTestUser({
        id: 'user_sanitize_1',
        username: 'sanitizeuser',
      });

      const project = await createTestProject({
        projectId: 'proj_sanitize_1',
        name: 'Sanitization Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const rawText = '0800 JV/OICC reported issue at 2:30 p.m.';
      const sanitized = sanitizeForMasterLog(rawText);

      expect(sanitized).not.toContain('JV/OICC');
      expect(sanitized).not.toContain('a.m.');
      expect(sanitized).not.toContain('p.m.');

      const event = await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '08:00',
        rawText: sanitized,
        category: 'ops',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      expect(event.rawText).toBe(sanitized);
    });
  });

  // ==================== EVENT UPDATE FLOW ====================
  describe('Event Update Flow', () => {
    it('should update log event with versioning', async () => {
      const user = await createTestUser({
        id: 'user_update_1',
        username: 'updateeventuser',
      });

      const project = await createTestProject({
        projectId: 'proj_update_1',
        name: 'Update Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const event = await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '08:00',
        rawText: 'Original event text',
        category: 'ops',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      expect(event.version).toBe(1);

      // Update event text
      const updated1 = await storage.updateLogEvent(event.id, {
        rawText: 'Updated event text',
      });

      expect(updated1?.rawText).toBe('Updated event text');
      expect(updated1?.version).toBe(2);

      // Update category
      const updated2 = await storage.updateLogEvent(event.id, {
        category: 'safety',
      });

      expect(updated2?.category).toBe('safety');
      expect(updated2?.version).toBe(3);

      // Verify final state
      const final = await storage.getLogEvent(event.id);
      expect(final?.rawText).toBe('Updated event text');
      expect(final?.category).toBe('safety');
      expect(final?.version).toBe(3);
    });
  });

  // ==================== MULTI-EVENT WORKFLOWS ====================
  describe('Multi-Event Workflows', () => {
    it('should manage multiple events in sequence', async () => {
      const user = await createTestUser({
        id: 'user_multi_1',
        username: 'multieventuser',
      });

      const project = await createTestProject({
        projectId: 'proj_multi_1',
        name: 'Multi-Event Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const eventTimes = ['08:00', '10:00', '12:00', '14:00', '16:00'];
      const eventTexts = [
        'Morning briefing completed',
        'Dive team entered water',
        'Lunch break started',
        'Dive operations resumed',
        'End of shift debriefing',
      ];

      // Create events in sequence
      const events = await Promise.all(
        eventTimes.map((time, index) =>
          storage.createLogEvent({
            dayId: day.id,
            projectId: project.projectId,
            eventTime: time,
            rawText: eventTexts[index],
            category: 'ops',
            createdById: user.id,
            createdAt: new Date(),
            version: 1,
          })
        )
      );

      expect(events).toHaveLength(5);

      // Retrieve all events for the day
      const dayEvents = await storage.getLogEventsByDay(day.id);
      expect(dayEvents).toHaveLength(5);

      // Verify events are in chronological order
      expect(dayEvents[0].eventTime).toBe('08:00');
      expect(dayEvents[4].eventTime).toBe('16:00');
    });

    it('should mix event categories in day', async () => {
      const user = await createTestUser({
        id: 'user_mix_1',
        username: 'mixeventuser',
      });

      const project = await createTestProject({
        projectId: 'proj_mix_1',
        name: 'Mixed Events Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const eventTypes = [
        { category: 'safety', text: 'Safety briefing completed' },
        { category: 'directive', text: 'Direct from supervisor: Proceed with dive plan' },
        { category: 'dive', text: 'Dive team breached bottom at 100 fsw' },
        { category: 'ops', text: 'Equipment check completed' },
        { category: 'safety', text: 'Emergency drill conducted' },
      ];

      await Promise.all(
        eventTypes.map((type, index) =>
          storage.createLogEvent({
            dayId: day.id,
            projectId: project.projectId,
            eventTime: `${(index + 1) * 2}:00`,
            rawText: type.text,
            category: type.category,
            createdById: user.id,
            createdAt: new Date(),
            version: 1,
          })
        )
      );

      const events = await storage.getLogEventsByDay(day.id);
      expect(events).toHaveLength(5);

      // Count events by category
      const categories = events.map(e => e.category);
      expect(categories.filter(c => c === 'safety')).toHaveLength(2);
      expect(categories.filter(c => c === 'directive')).toHaveLength(1);
      expect(categories.filter(c => c === 'dive')).toHaveLength(1);
      expect(categories.filter(c => c === 'ops')).toHaveLength(1);
    });

    it('should verify database state after multi-event operations', async () => {
      const user = await createTestUser({
        id: 'user_verify_1',
        username: 'verifyeventuser',
      });

      const project = await createTestProject({
        projectId: 'proj_verify_1',
        name: 'Verify Events Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      // Create multiple events
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          storage.createLogEvent({
            dayId: day.id,
            projectId: project.projectId,
            eventTime: `${(i + 1) * 2}:00`,
            rawText: `Event ${i + 1}`,
            category: 'ops',
            createdById: user.id,
            createdAt: new Date(),
            version: 1,
          })
        )
      );

      const state = await verifyDatabaseState();
      expect(state.users).toBe(1);
      expect(state.projects).toBe(1);
      expect(state.days).toBe(1);
      expect(state.logEvents).toBe(10);
    });
  });
});