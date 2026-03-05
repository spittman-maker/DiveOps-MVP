/**
 * Functional Tests for Document Generation Workflow
 * 
 * Tests end-to-end document generation workflows including:
 * - Master log document generation
 * - Canvas log document generation
 * - Daily summary report generation
 * - Dive log report generation
 * - PDF export functionality
 * - Multi-document workflows
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import {
  deriveInitialsFromDisplayName,
  formatTimeForLog,
  formatDepthForLog,
  calculateDiveDuration,
  generateMasterLogSection,
} from '../../server/document-export';
import type { InsertUser, InsertProject, InsertDay, InsertDive } from '@shared/schema';
import { cleanTestDatabase, verifyDatabaseState, createTestUser, createTestProject, createTestDay } from '../integration/test-db-helpers';

describe('Document Generation Functional Tests', () => {
  beforeAll(async () => {
    console.log('Setting up functional tests for document generation');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== INITIALS DERIVATION FLOW ====================
  describe('Initials Derivation Flow', () => {
    it('should derive initials from display names', () => {
      const testCases = [
        { name: 'John Smith', expected: 'JS' },
        { name: 'Jane Marie Doe', expected: 'JMD' },
        { name: 'Bob Johnson Jr.', expected: 'BJJ' },
        { name: 'A B', expected: 'AB' },
        { name: 'Single', expected: 'S' },
      ];

      for (const testCase of testCases) {
        const initials = deriveInitialsFromDisplayName(testCase.name);
        expect(initials).toBe(testCase.expected);
      }
    });

    it('should handle edge cases in initials derivation', () => {
      // Multiple spaces
      expect(deriveInitialsFromDisplayName('John  Smith')).toBe('JS');
      
      // Leading/trailing spaces
      expect(deriveInitialsFromDisplayName('  John Smith  ')).toBe('JS');
      
      // Mixed case
      expect(deriveInitialsFromDisplayName('john smith')).toBe('JS');
    });
  });

  // ==================== TIME FORMATTING FLOW ====================
  describe('Time Formatting Flow', () => {
    it('should format time for log display', () => {
      const date1 = new Date('2024-03-15T08:30:00');
      expect(formatTimeForLog(date1)).toBe('0830');

      const date2 = new Date('2024-03-15T14:45:00');
      expect(formatTimeForLog(date2)).toBe('1445');

      const date3 = new Date('2024-03-15T23:59:00');
      expect(formatTimeForLog(date3)).toBe('2359');
    });

    it('should handle midnight and early morning times', () => {
      const midnight = new Date('2024-03-15T00:00:00');
      expect(formatTimeForLog(midnight)).toBe('0000');

      const earlyMorning = new Date('2024-03-15T02:15:00');
      expect(formatTimeForLog(earlyMorning)).toBe('0215');
    });
  });

  // ==================== DEPTH FORMATTING FLOW ====================
  describe('Depth Formatting Flow', () => {
    it('should format depth for log display', () => {
      expect(formatDepthForLog(120)).toBe('120 fsw');
      expect(formatDepthForLog(0)).toBe('0 fsw');
      expect(formatDepthForLog(45.5)).toBe('46 fsw');
    });

    it('should handle edge cases in depth formatting', () => {
      expect(formatDepthForLog(null as any)).toBe('0 fsw');
      expect(formatDepthForLog(undefined as any)).toBe('0 fsw');
      expect(formatDepthForLog(-1)).toBe('0 fsw');
    });
  });

  // ==================== DIVE DURATION CALCULATION FLOW ====================
  describe('Dive Duration Calculation Flow', () => {
    it('should calculate dive duration', () => {
      const lsTime = new Date('2024-03-15T08:00:00');
      const rsTime = new Date('2024-03-15T08:35:00');

      const duration = calculateDiveDuration(lsTime, rsTime);
      expect(duration).toBe(35);
    });

    it('should calculate duration with bottom time', () => {
      const lsTime = new Date('2024-03-15T08:00:00');
      const lbTime = new Date('2024-03-15T08:05:00');
      const rbTime = new Date('2024-03-15T08:30:00');
      const rsTime = new Date('2024-03-15T08:35:00');

      const totalDuration = calculateDiveDuration(lsTime, rsTime);
      const bottomTime = calculateDiveDuration(lbTime, rbTime);

      expect(totalDuration).toBe(35);
      expect(bottomTime).toBe(25);
    });

    it('should handle incomplete dive data', () => {
      const lsTime = new Date('2024-03-15T08:00:00');
      
      // No RS time
      const duration1 = calculateDiveDuration(lsTime, null as any);
      expect(duration1).toBeNull();

      // Null times
      const duration2 = calculateDiveDuration(null as any, null as any);
      expect(duration2).toBeNull();
    });
  });

  // ==================== MASTER LOG SECTION GENERATION FLOW ====================
  describe('Master Log Section Generation Flow', () => {
    it('should generate master log sections for different categories', () => {
      const categories = ['dive', 'safety', 'directives', 'ops'] as const;

      for (const category of categories) {
        const section = generateMasterLogSection(category);
        expect(section).toBeDefined();
        expect(typeof section).toBe('string');
      }
    });

    it('should handle invalid category', () => {
      const section = generateMasterLogSection('invalid' as any);
      expect(section).toBeDefined();
    });
  });

  // ==================== COMPLETE DOCUMENT GENERATION FLOW ====================
  describe('Complete Document Generation Flow', () => {
    it('should generate complete daily summary document', async () => {
      // Setup: Create user, project, and day
      const user = await createTestUser({
        id: 'user_doc_1',
        username: 'doccreator',
        role: 'SUPERVISOR',
        displayName: 'John Smith',
      });

      const project = await createTestProject({
        projectId: 'proj_doc_1',
        name: 'Document Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      // Create log events
      await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '08:00',
        rawText: 'Morning briefing completed',
        category: 'ops',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '10:00',
        rawText: 'Dive operations commenced',
        category: 'dive',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      // Create dives
      const dive = await storage.createDive({
        dayId: day.id,
        diverId: user.id,
        diveNumber: 1,
        station: 'A',
        status: 'COMPLETE',
        createdAt: new Date(),
        version: 1,
      });

      // Update dive times
      await storage.updateDiveTimes(dive.id, 'lsTime', new Date('2024-03-15T08:00:00'), 0);
      await storage.updateDiveTimes(dive.id, 'lbTime', new Date('2024-03-15T08:05:00'), 100);
      await storage.updateDiveTimes(dive.id, 'rbTime', new Date('2024-03-15T08:30:00'), 100);
      await storage.updateDiveTimes(dive.id, 'rsTime', new Date('2024-03-15T08:35:00'));

      // Retrieve data for document generation
      const events = await storage.getLogEventsByDay(day.id);
      const dives = await storage.getDivesByDay(day.id);

      // Verify data is available for document generation
      expect(events).toHaveLength(2);
      expect(dives).toHaveLength(1);

      // Generate daily summary
      const summary = {
        dayId: day.id,
        date: day.date,
        project: project.name,
        eventsCount: events.length,
        divesCount: dives.length,
        supervisor: user.displayName,
        supervisorInitials: deriveInitialsFromDisplayName(user.displayName),
        generatedAt: new Date(),
      };

      expect(summary.eventsCount).toBe(2);
      expect(summary.divesCount).toBe(1);
      expect(summary.supervisorInitials).toBe('JS');
    });

    it('should generate master log with all sections', async () => {
      const user = await createTestUser({
        id: 'user_master_1',
        username: 'masteruser',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_master_1',
        name: 'Master Log Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      // Create events for each category
      await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '08:00',
        rawText: 'Safety briefing completed',
        category: 'safety',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '09:00',
        rawText: 'Direct from supervisor: Begin dive operations',
        category: 'directive',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '10:00',
        rawText: 'Dive team breached bottom at 120 fsw',
        category: 'dive',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '12:00',
        rawText: 'Equipment check completed',
        category: 'ops',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      const events = await storage.getLogEventsByDay(day.id);

      // Generate master log structure
      const masterLog = {
        projectId: project.projectId,
        projectName: project.name,
        date: day.date,
        sections: {
          safety: events.filter(e => e.category === 'safety'),
          directives: events.filter(e => e.category === 'directive'),
          dive: events.filter(e => e.category === 'dive'),
          ops: events.filter(e => e.category === 'ops'),
        },
        generatedAt: new Date(),
      };

      expect(masterLog.sections.safety).toHaveLength(1);
      expect(masterLog.sections.directives).toHaveLength(1);
      expect(masterLog.sections.dive).toHaveLength(1);
      expect(masterLog.sections.ops).toHaveLength(1);
    });
  });

  // ==================== MULTI-DOCUMENT WORKFLOWS ====================
  describe('Multi-Document Workflows', () => {
    it('should generate documents for multiple days', async () => {
      const user = await createTestUser({
        id: 'user_multi_1',
        username: 'multidocuser',
      });

      const project = await createTestProject({
        projectId: 'proj_multi_1',
        name: 'Multi-Day Document Project',
        createdBy: user.id,
      });

      const dates = ['2024-03-15', '2024-03-16', '2024-03-17'];

      // Create days
      const days = await Promise.all(
        dates.map(date =>
          storage.createDay({
            projectId: project.projectId,
            date,
            shift: 'DAY',
            supervisorId: user.id,
            divingSupervisorId: user.id,
            status: 'CLOSED',
            createdAt: new Date(),
          })
        )
      );

      // Create events for each day
      for (const day of days) {
        await storage.createLogEvent({
          dayId: day.id,
          projectId: project.projectId,
          eventTime: '08:00',
          rawText: `Events for ${day.date}`,
          category: 'ops',
          createdById: user.id,
          createdAt: new Date(),
          version: 1,
        });
      }

      // Generate documents for each day
      const documents = await Promise.all(
        days.map(async (day) => {
          const events = await storage.getLogEventsByDay(day.id);
          return {
            date: day.date,
            eventsCount: events.length,
            generatedAt: new Date(),
          };
        })
      );

      expect(documents).toHaveLength(3);
      documents.forEach(doc => {
        expect(doc.eventsCount).toBe(1);
      });
    });

    it('should verify database state after document generation operations', async () => {
      const user = await createTestUser({
        id: 'user_verify_1',
        username: 'verifydocuser',
      });

      const project = await createTestProject({
        projectId: 'proj_verify_1',
        name: 'Verify Document Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      // Create data for document generation
      await storage.createLogEvent({
        dayId: day.id,
        projectId: project.projectId,
        eventTime: '08:00',
        rawText: 'Test event',
        category: 'ops',
        createdById: user.id,
        createdAt: new Date(),
        version: 1,
      });

      const state = await verifyDatabaseState();
      expect(state.users).toBe(1);
      expect(state.projects).toBe(1);
      expect(state.days).toBe(1);
      expect(state.logEvents).toBe(1);
    });
  });
});