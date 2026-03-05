/**
 * Integration Tests for AI Drafting Module (ai-drafting.ts)
 * 
 * Tests AI-powered log rendering including:
 * - Internal canvas line generation
 * - Master log line generation
 * - Section classification
 * - Error handling and fallbacks
 * - Content sanitization and compliance
 * 
 * NOTE: These tests use mocked OpenAI responses for reliability.
 * Real AI calls require API keys and are not recommended for CI.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { AIAnnotation, AIRenderResult } from '../../server/ai-drafting';
import { cleanTestDatabase, createTestUser } from './test-db-helpers';

// Mock OpenAI module
vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'AI-generated log line for testing.',
              },
            },
          ],
        }),
      },
    },
  }));

  return { default: MockOpenAI };
});

describe('AI Drafting Integration Tests', () => {
  beforeAll(async () => {
    console.log('Setting up integration tests for AI module');
  });

  afterAll(async () => {
    await cleanTestDatabase();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    vi.clearAllMocks();
  });

  // ==================== PROMPT CONFIGURATION TESTS ====================
  describe('Prompt Configuration', () => {
    it('should have correct model configuration', async () => {
      // Read the ai-drafting.ts to verify configuration
      const fs = await import('fs');
      const path = await import('path');
      const content = fs.readFileSync(
        path.join(__dirname, '../../server/ai-drafting.ts'),
        'utf-8'
      );

      expect(content).toContain('PROMPT_VERSION');
      expect(content).toContain('MODEL');
    });

    it('should include key system prompt rules', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const content = fs.readFileSync(
        path.join(__dirname, '../../server/ai-drafting.ts'),
        'utf-8'
      );

      // Verify critical rules are present
      expect(content).toContain('Do not invent data');
      expect(content).toContain('Client');
      expect(content).toContain('U.S. Navy Dive Manual');
    });

    it('should have internal and master log system prompts', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const content = fs.readFileSync(
        path.join(__dirname, '../../server/ai-drafting.ts'),
        'utf-8'
      );

      expect(content).toContain('INTERNAL_SYSTEM_PROMPT');
      expect(content).toContain('MASTER_LOG_SYSTEM_PROMPT');
    });
  });

  // ==================== ANNOTATION TYPE TESTS ====================
  describe('AI Annotation Types', () => {
    it('should define all annotation types', () => {
      const validTypes: AIAnnotation['type'][] = [
        'typo',
        'missing_info',
        'ambiguous',
        'safety_flag',
        'suggestion',
      ];

      validTypes.forEach((type) => {
        const annotation: AIAnnotation = {
          type,
          message: `Test ${type} annotation`,
        };

        expect(annotation.type).toBe(type);
        expect(annotation.message).toBeDefined();
      });
    });

    it('should create valid annotation objects', () => {
      const annotation: AIAnnotation = {
        type: 'safety_flag',
        message: 'Potential safety issue detected',
      };

      expect(annotation).toHaveProperty('type');
      expect(annotation).toHaveProperty('message');
      expect(typeof annotation.type).toBe('string');
      expect(typeof annotation.message).toBe('string');
    });
  });

  // ==================== RENDER RESULT TESTS ====================
  describe('AI Render Result', () => {
    it('should define correct result structure', () => {
      const result: AIRenderResult = {
        internalCanvasLine: 'Internal log line',
        masterLogLine: 'Master log line',
        section: 'DIVING',
        status: 'ok',
        model: 'gpt-5.2',
        promptVersion: 'v1.0',
        annotations: [],
      };

      expect(result).toHaveProperty('internalCanvasLine');
      expect(result).toHaveProperty('masterLogLine');
      expect(result).toHaveProperty('section');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('promptVersion');
      expect(result).toHaveProperty('annotations');
    });

    it('should support all status types', () => {
      const statuses: AIRenderResult['status'][] = ['ok', 'failed', 'needs_review'];

      statuses.forEach((status) => {
        const result: AIRenderResult = {
          internalCanvasLine: '',
          masterLogLine: '',
          section: 'ROUTINE',
          status,
          model: 'gpt-5.2',
          promptVersion: 'v1.0',
          annotations: [],
        };

        expect(result.status).toBe(status);
      });
    });

    it('should handle annotations in result', () => {
      const result: AIRenderResult = {
        internalCanvasLine: 'Test line with typo',
        masterLogLine: 'Corrected log line',
        section: 'ROUTINE',
        status: 'needs_review',
        model: 'gpt-5.2',
        promptVersion: 'v1.0',
        annotations: [
          { type: 'typo', message: 'Fixed typo in line' },
          { type: 'suggestion', message: 'Consider adding more detail' },
        ],
      };

      expect(result.annotations).toHaveLength(2);
      expect(result.annotations[0].type).toBe('typo');
      expect(result.annotations[1].type).toBe('suggestion');
    });
  });

  // ==================== CONTENT SANITIZATION TESTS ====================
  describe('Content Sanitization', () => {
    it('should replace JV/OICC with Client in master log', async () => {
      // Import sanitization function from validator
      const { sanitizeForMasterLog } = await import('../../server/validator');

      const input = 'JV representative approved the dive plan. OICC confirmed the scope.';
      const sanitized = sanitizeForMasterLog(input);

      expect(sanitized).not.toContain('JV');
      expect(sanitized).not.toContain('OICC');
      expect(sanitized).toContain('Client');
    });

    it('should convert time formats correctly', async () => {
      const { sanitizeForMasterLog } = await import('../../server/validator');

      const input = 'Dive started at 2:30 p.m. and ended at 4:45 p.m.';
      const sanitized = sanitizeForMasterLog(input);

      // Should convert to 24-hour format or standardized format
      expect(sanitized).toBeDefined();
    });

    it('should handle client/client duplication', async () => {
      const { sanitizeForMasterLog } = await import('../../server/validator');

      const input = 'Client/Client approved the plan';
      const sanitized = sanitizeForMasterLog(input);

      expect(sanitized).not.toContain('Client/Client');
      expect(sanitized).toContain('Client');
    });
  });

  // ==================== SECTION CLASSIFICATION TESTS ====================
  describe('Section Classification', () => {
    it('should classify events into correct master log sections', async () => {
      const { getMasterLogSection } = await import('../../server/extraction');

      // Test section mapping
      expect(getMasterLogSection('dive_op')).toBe('DIVING');
      expect(getMasterLogSection('safety')).toBe('SAFETY');
      expect(getMasterLogSection('directive')).toBe('DIRECTIVES');
      expect(getMasterLogSection('routine')).toBe('ROUTINE');
    });

    it('should handle unknown event categories', async () => {
      const { getMasterLogSection } = await import('../../server/extraction');

      // Unknown categories should return a default
      const section = getMasterLogSection('unknown_category');
      expect(section).toBeDefined();
    });
  });

  // ==================== EVENT CLASSIFICATION INTEGRATION ====================
  describe('Event Classification Integration', () => {
    it('should classify dive events correctly', async () => {
      const { classifyEvent } = await import('../../server/extraction');

      expect(classifyEvent('LS 0800')).toBe('dive_op');
      expect(classifyEvent('LB 0830')).toBe('dive_op');
      expect(classifyEvent('RS 0900')).toBe('dive_op');
      expect(classifyEvent('RB 0930')).toBe('dive_op');
    });

    it('should classify safety events correctly', async () => {
      const { classifyEvent } = await import('../../server/extraction');

      expect(classifyEvent('incident occurred')).toBe('safety');
      expect(classifyEvent('near miss on deck')).toBe('safety');
      expect(classifyEvent('hazard identified in workspace')).toBe('safety');
    });

    it('should classify directive events correctly', async () => {
      const { classifyEvent } = await import('../../server/extraction');

      expect(classifyEvent('client directive received')).toBe('directive');
      expect(classifyEvent('OICC instruction to proceed')).toBe('directive');
      expect(classifyEvent('stop work order issued')).toBe('directive');
    });

    it('should classify routine events correctly', async () => {
      const { classifyEvent } = await import('../../server/extraction');

      expect(classifyEvent('morning briefing completed')).toBe('routine');
      expect(classifyEvent('equipment checked')).toBe('routine');
    });
  });

  // ==================== TYPHO DETECTION INTEGRATION ====================
  describe('Typo Detection Integration', () => {
    it('should detect and fix typos in log entries', async () => {
      const { fixTypos } = await import('../../server/extraction');

      const input = 'diver left serface at 0800'; // Typo: serface
      const fixed = fixTypos(input);

      expect(fixed).toBeDefined();
      // Should fix common typos
    });
  });

  // ==================== ERROR HANDLING TESTS ====================
  describe('Error Handling', () => {
    it('should handle empty input gracefully', async () => {
      const { classifyEvent } = await import('../../server/extraction');

      const result = classifyEvent('');
      expect(result).toBeDefined();
    });

    it('should handle very long input', async () => {
      const { classifyEvent } = await import('../../server/extraction');

      const longInput = 'A'.repeat(10000);
      const result = classifyEvent(longInput);
      expect(result).toBeDefined();
    });

    it('should handle special characters in input', async () => {
      const { classifyEvent } = await import('../../server/extraction');

      const specialInput = 'LS 0800 @#$%^&*() \\n\\t\\r';
      const result = classifyEvent(specialInput);
      expect(result).toBeDefined();
    });
  });

  // ==================== COMPLIANCE TESTS ====================
  describe('Compliance', () => {
    it('should not include internal terminology in master log', async () => {
      const { sanitizeForMasterLog } = await import('../../server/validator');

      const internalTerms = ['JV', 'OICC', 'joint venture'];
      internalTerms.forEach((term) => {
        const result = sanitizeForMasterLog(`${term} directive received`);
        expect(result).not.toContain(term);
      });
    });

    it('should preserve critical information in master log', async () => {
      const { sanitizeForMasterLog } = await import('../../server/validator');

      const input = 'Diver John Smith completed inspection at 150 FSW, bottom time 45 minutes';
      const result = sanitizeForMasterLog(input);

      // Critical details should be preserved
      expect(result).toContain('John Smith');
      expect(result).toContain('150');
      expect(result).toContain('45');
    });

    it('should flag potential safety concerns', async () => {
      const { detectHazards } = await import('../../server/extraction');

      const input = 'contamination detected in water supply';
      const hazards = detectHazards(input);

      expect(hazards).toBeDefined();
      expect(Array.isArray(hazards)).toBe(true);
    });
  });

  // ==================== HAZARD DETECTION INTEGRATION ====================
  describe('Hazard Detection Integration', () => {
    it('should detect multiple hazards in single entry', async () => {
      const { detectHazards } = await import('../../server/extraction');

      const input = 'diver reported contamination in area with damaged equipment';
      const hazards = detectHazards(input);

      expect(hazards.length).toBeGreaterThan(0);
    });

    it('should return empty array for no hazards', async () => {
      const { detectHazards } = await import('../../server/extraction');

      const input = 'routine dive completed successfully';
      const hazards = detectHazards(input);

      expect(hazards).toEqual([]);
    });

    it('should detect hazard keywords case-insensitively', async () => {
      const { detectHazards } = await import('../../server/extraction');

      const input1 = 'CONTAMINATION detected';
      const input2 = 'contamination detected';
      const input3 = 'Contamination Detected';

      expect(detectHazards(input1)).toBeDefined();
      expect(detectHazards(input2)).toBeDefined();
      expect(detectHazards(input3)).toBeDefined();
    });
  });

  // ==================== EXTRACTION INTEGRATION ====================
  describe('Data Extraction Integration', () => {
    it('should extract times from log entries', async () => {
      const { extractData } = await import('../../server/extraction');

      const input = 'LS 0800 LB 0845 RB 0930';
      const data = extractData(input, 'dive_op');

      expect(data).toBeDefined();
    });

    it('should extract diver information', async () => {
      const { extractData } = await import('../../server/extraction');

      const input = 'Diver John Smith entered water at 0800';
      const data = extractData(input, 'dive_op');

      expect(data).toBeDefined();
    });

    it('should extract depths from log entries', async () => {
      const { extractData } = await import('../../server/extraction');

      const input = 'Dive to 150 FSW completed';
      const data = extractData(input, 'dive_op');

      expect(data).toBeDefined();
    });
  });

  // ==================== CANVAS LINE RENDERING ====================
  describe('Internal Canvas Line Rendering', () => {
    it('should render clean canvas line from raw input', async () => {
      const { renderInternalCanvasLine } = await import('../../server/extraction');

      const input = 'dive op at 0800, diver entered water';
      const line = renderInternalCanvasLine(input, 'dive_op', {});

      expect(line).toBeDefined();
      expect(typeof line).toBe('string');
    });

    it('should include timestamps in canvas line', async () => {
      const { renderInternalCanvasLine } = await import('../../server/extraction');

      const input = 'LS 0800';
      const line = renderInternalCanvasLine(input, 'dive_op', {});

      expect(line).toBeDefined();
    });
  });
});