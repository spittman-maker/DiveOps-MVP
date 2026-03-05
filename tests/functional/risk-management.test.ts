/**
 * Functional Tests for Risk Management Workflow
 * 
 * Tests end-to-end risk management workflows including:
 * - Risk item creation and detection
 * - Risk assessment and classification
 * - Risk status tracking and updates
 * - Risk resolution workflows
 * - Multi-risk workflows
 * - Risk-dive event correlation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import { detectHazards, hasRiskKeywords } from '../../server/extraction';
import type { InsertUser, InsertProject, InsertDay, InsertRiskItem } from '@shared/schema';
import { cleanTestDatabase, verifyDatabaseState, createTestUser, createTestProject, createTestDay } from '../integration/test-db-helpers';

describe('Risk Management Functional Tests', () => {
  beforeAll(async () => {
    console.log('Setting up functional tests for risk management');
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ==================== RISK CREATION FLOW ====================
  describe('Risk Creation Flow', () => {
    it('should complete full risk item creation workflow', async () => {
      // Step 1: Create user, project, and day
      const user = await createTestUser({
        id: 'user_risk_1',
        username: 'riskcreator',
        role: 'SUPERVISOR',
      });

      const project = await createTestProject({
        projectId: 'proj_risk_1',
        name: 'Risk Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      // Step 2: Create a risk item
      const riskData: InsertRiskItem = {
        dayId: day.id,
        projectId: project.projectId,
        riskId: 'RISK-2024-0315-001',
        title: 'Welding near fuel line',
        description: 'Welding operations within 10 feet of fuel line',
        category: 'fire',
        severity: 'HIGH',
        status: 'OPEN',
        detectedAt: '14:00',
        detectedById: user.id,
        createdAt: new Date(),
      };

      const risk = await storage.createRiskItem(riskData);
      expect(risk).toBeDefined();
      expect(risk.dayId).toBe(day.id);
      expect(risk.riskId).toBe('RISK-2024-0315-001');
      expect(risk.severity).toBe('HIGH');
      expect(risk.status).toBe('OPEN');

      // Step 3: Verify risk can be retrieved
      const retrieved = await storage.getRiskItem(risk.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(risk.id);

      // Step 4: Verify risk appears in day's risks
      const dayRisks = await storage.getRiskItemsByDay(day.id);
      expect(dayRisks).toHaveLength(1);
      expect(dayRisks[0].id).toBe(risk.id);

      // Step 5: Verify risk appears in project's risks
      const projectRisks = await storage.getRiskItemsByProject(project.projectId);
      expect(projectRisks).toHaveLength(1);
    });

    it('should detect risks from log event text', async () => {
      const user = await createTestUser({
        id: 'user_detect_1',
        username: 'detectuser',
      });

      const project = await createTestProject({
        projectId: 'proj_detect_1',
        name: 'Risk Detection Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const hazardousTexts = [
        'Welding operations near fuel storage on barge 2',
        'Grinding in confined space without ventilation',
        'Electrical work in wet environment',
        'Heavy lifting overhead without safety harness',
      ];

      for (const text of hazardousTexts) {
        // Check if text has risk keywords
        const hasRisk = hasRiskKeywords(text);
        expect(hasRisk).toBe(true);

        // Detect specific hazards
        const hazards = detectHazards(text);
        expect(hazards.length).toBeGreaterThan(0);

        // Create risk item based on detection
        if (hazards.length > 0) {
          await storage.createRiskItem({
            dayId: day.id,
            projectId: project.projectId,
            riskId: `RISK-${Date.now()}`,
            title: hazards[0].hazard,
            description: text,
            category: 'safety',
            severity: 'MEDIUM',
            status: 'OPEN',
            detectedAt: '12:00',
            detectedById: user.id,
            createdAt: new Date(),
          });
        }
      }

      const risks = await storage.getRiskItemsByDay(day.id);
      expect(risks.length).toBeGreaterThan(0);
    });
  });

  // ==================== RISK ASSESSMENT FLOW ====================
  describe('Risk Assessment Flow', () => {
    it('should classify risks by severity', async () => {
      const user = await createTestUser({
        id: 'user_severity_1',
        username: 'severityuser',
      });

      const project = await createTestProject({
        projectId: 'proj_severity_1',
        name: 'Severity Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const severityLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

      // Create risks with different severity levels
      await Promise.all(
        severityLevels.map((severity, index) =>
          storage.createRiskItem({
            dayId: day.id,
            projectId: project.projectId,
            riskId: `RISK-SEV-${index}`,
            title: `Risk with ${severity} severity`,
            description: `Test risk with ${severity} severity level`,
            category: 'safety',
            severity,
            status: 'OPEN',
            detectedAt: '12:00',
            detectedById: user.id,
            createdAt: new Date(),
          })
        )
      );

      const risks = await storage.getRiskItemsByDay(day.id);
      expect(risks).toHaveLength(4);

      // Verify all severity levels are present
      const severities = risks.map(r => r.severity);
      expect(severities).toContain('LOW');
      expect(severities).toContain('MEDIUM');
      expect(severities).toContain('HIGH');
      expect(severities).toContain('CRITICAL');
    });

    it('should categorize risks by type', async () => {
      const user = await createTestUser({
        id: 'user_category_1',
        username: 'categoryuser',
      });

      const project = await createTestProject({
        projectId: 'proj_category_1',
        name: 'Category Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const categories = ['fire', 'environmental', 'health', 'equipment'] as const;

      // Create risks with different categories
      await Promise.all(
        categories.map((category, index) =>
          storage.createRiskItem({
            dayId: day.id,
            projectId: project.projectId,
            riskId: `RISK-CAT-${index}`,
            title: `Risk in ${category} category`,
            description: `Test risk in ${category} category`,
            category,
            severity: 'MEDIUM',
            status: 'OPEN',
            detectedAt: '12:00',
            detectedById: user.id,
            createdAt: new Date(),
          })
        )
      );

      const risks = await storage.getRiskItemsByDay(day.id);
      expect(risks).toHaveLength(4);

      // Verify all categories are present
      const riskCategories = risks.map(r => r.category);
      expect(riskCategories).toContain('fire');
      expect(riskCategories).toContain('environmental');
      expect(riskCategories).toContain('health');
      expect(riskCategories).toContain('equipment');
    });
  });

  // ==================== RISK STATUS FLOW ====================
  describe('Risk Status Flow', () => {
    it('should transition risk through lifecycle', async () => {
      const user = await createTestUser({
        id: 'user_status_1',
        username: 'riskstatususer',
      });

      const project = await createTestProject({
        projectId: 'proj_status_1',
        name: 'Risk Status Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const risk = await storage.createRiskItem({
        dayId: day.id,
        projectId: project.projectId,
        riskId: 'RISK-STATUS-001',
        title: 'Test Risk',
        description: 'Test risk for status transitions',
        category: 'safety',
        severity: 'MEDIUM',
        status: 'OPEN',
        detectedAt: '12:00',
        detectedById: user.id,
        createdAt: new Date(),
      });

      expect(risk.status).toBe('OPEN');

      // Under investigation
      const investigated = await storage.updateRiskItem(risk.id, {
        status: 'UNDER_INVESTIGATION',
      });

      expect(investigated?.status).toBe('UNDER_INVESTIGATION');

      // Mitigated
      const mitigated = await storage.updateRiskItem(risk.id, {
        status: 'MITIGATED',
      });

      expect(mitigated?.status).toBe('MITIGATED');

      // Closed
      const closed = await storage.updateRiskItem(risk.id, {
        status: 'CLOSED',
      });

      expect(closed?.status).toBe('CLOSED');

      // Verify final state
      const final = await storage.getRiskItem(risk.id);
      expect(final?.status).toBe('CLOSED');
    });

    it('should track risk resolution details', async () => {
      const user = await createTestUser({
        id: 'user_resolve_1',
        username: 'resolveuser',
      });

      const project = await createTestProject({
        projectId: 'proj_resolve_1',
        name: 'Resolution Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const risk = await storage.createRiskItem({
        dayId: day.id,
        projectId: project.projectId,
        riskId: 'RISK-RESOLVE-001',
        title: 'Welding Risk',
        description: 'Welding near fuel line',
        category: 'fire',
        severity: 'HIGH',
        status: 'OPEN',
        detectedAt: '12:00',
        detectedById: user.id,
        createdAt: new Date(),
      });

      // Update with resolution details
      const resolved = await storage.updateRiskItem(risk.id, {
        status: 'CLOSED',
        resolution: 'Moved welding operations to safe location',
        resolvedById: user.id,
        resolvedAt: new Date(),
      });

      expect(resolved?.status).toBe('CLOSED');
      expect(resolved?.resolution).toBeDefined();
      expect(resolved?.resolvedById).toBe(user.id);
      expect(resolved?.resolvedAt).toBeDefined();

      // Verify resolution details persisted
      const final = await storage.getRiskItem(risk.id);
      expect(final?.resolution).toBe('Moved welding operations to safe location');
      expect(final?.resolvedById).toBe(user.id);
    });
  });

  // ==================== MULTI-RISK WORKFLOWS ====================
  describe('Multi-Risk Workflows', () => {
    it('should manage multiple risks in same day', async () => {
      const user = await createTestUser({
        id: 'user_multi_1',
        username: 'multiriskuser',
      });

      const project = await createTestProject({
        projectId: 'proj_multi_1',
        name: 'Multi-Risk Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      const riskData = [
        {
          riskId: 'RISK-001',
          title: 'Welding Risk',
          category: 'fire',
          severity: 'HIGH',
        },
        {
          riskId: 'RISK-002',
          title: 'Environmental Risk',
          category: 'environmental',
          severity: 'MEDIUM',
        },
        {
          riskId: 'RISK-003',
          title: 'Health Risk',
          category: 'health',
          severity: 'LOW',
        },
      ];

      // Create multiple risks
      await Promise.all(
        riskData.map(data =>
          storage.createRiskItem({
            dayId: day.id,
            projectId: project.projectId,
            riskId: data.riskId,
            title: data.title,
            description: `${data.title} description`,
            category: data.category,
            severity: data.severity,
            status: 'OPEN',
            detectedAt: '12:00',
            detectedById: user.id,
            createdAt: new Date(),
          })
        )
      );

      const risks = await storage.getRiskItemsByDay(day.id);
      expect(risks).toHaveLength(3);

      // Count risks by severity
      const highRisks = risks.filter(r => r.severity === 'HIGH');
      const mediumRisks = risks.filter(r => r.severity === 'MEDIUM');
      const lowRisks = risks.filter(r => r.severity === 'LOW');

      expect(highRisks).toHaveLength(1);
      expect(mediumRisks).toHaveLength(1);
      expect(lowRisks).toHaveLength(1);
    });

    it('should manage risks across multiple days', async () => {
      const user = await createTestUser({
        id: 'user_days_1',
        username: 'daysriskuser',
      });

      const project = await createTestProject({
        projectId: 'proj_days_1',
        name: 'Multi-Day Risk Test Project',
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
            status: 'DRAFT',
            createdAt: new Date(),
          })
        )
      );

      // Create risks for each day
      await Promise.all(
        days.map((day, index) =>
          storage.createRiskItem({
            dayId: day.id,
            projectId: project.projectId,
            riskId: `RISK-DAY-${index}`,
            title: `Risk for day ${index + 1}`,
            description: `Risk on ${dates[index]}`,
            category: 'safety',
            severity: 'MEDIUM',
            status: 'OPEN',
            detectedAt: '12:00',
            detectedById: user.id,
            createdAt: new Date(),
          })
        )
      );

      // Verify each day has one risk
      for (const day of days) {
        const dayRisks = await storage.getRiskItemsByDay(day.id);
        expect(dayRisks).toHaveLength(1);
      }

      // Verify project has all risks
      const projectRisks = await storage.getRiskItemsByProject(project.projectId);
      expect(projectRisks).toHaveLength(3);
    });

    it('should verify database state after multi-risk operations', async () => {
      const user = await createTestUser({
        id: 'user_verify_1',
        username: 'verifyriskuser',
      });

      const project = await createTestProject({
        projectId: 'proj_verify_1',
        name: 'Verify Risk Test Project',
        createdBy: user.id,
      });

      const day = await createTestDay(project.projectId, {
        supervisorId: user.id,
        divingSupervisorId: user.id,
      });

      // Create multiple risks
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          storage.createRiskItem({
            dayId: day.id,
            projectId: project.projectId,
            riskId: `RISK-VERIFY-${i}`,
            title: `Risk ${i + 1}`,
            description: `Test risk ${i + 1}`,
            category: 'safety',
            severity: 'MEDIUM',
            status: 'OPEN',
            detectedAt: '12:00',
            detectedById: user.id,
            createdAt: new Date(),
          })
        )
      );

      const state = await verifyDatabaseState();
      expect(state.users).toBe(1);
      expect(state.projects).toBe(1);
      expect(state.days).toBe(1);
    });
  });
});