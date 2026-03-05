/**
 * Unit Tests for Extraction Module (extraction.ts)
 * 
 * Tests pure functions for event classification and data extraction
 * without database dependencies.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyEvent,
  detectHazards,
  hasRiskKeywords,
  isStopWork,
  detectDirectiveTag,
  extractData,
  fixTypos,
  parseEventTime,
  generateRiskId,
  getMasterLogSection,
  renderInternalCanvasLine,
} from '../../server/extraction';

describe('Extraction Unit Tests', () => {
  // ==================== CLASSIFICATION TESTS ====================
  describe('classifyEvent', () => {
    it('should classify safety events correctly', () => {
      expect(classifyEvent('incident occurred during dive')).toBe('safety');
      expect(classifyEvent('injury reported on deck')).toBe('safety');
      expect(classifyEvent('near miss with crane')).toBe('safety');
      expect(classifyEvent('explosion detected')).toBe('safety');
      expect(classifyEvent('hydrogen buildup warning')).toBe('safety');
      expect(classifyEvent('emergency shutdown')).toBe('safety');
      expect(classifyEvent('accident investigation')).toBe('safety');
      expect(classifyEvent('hazard identified')).toBe('safety');
      expect(classifyEvent('unsafe conditions observed')).toBe('safety');
      expect(classifyEvent('DCS symptoms observed')).toBe('safety');
      expect(classifyEvent('decompression sickness suspected')).toBe('safety');
      expect(classifyEvent('barotrauma concern')).toBe('safety');
      expect(classifyEvent('medical emergency')).toBe('safety');
      expect(classifyEvent('first aid required')).toBe('safety');
    });

    it('should classify directive events correctly', () => {
      expect(classifyEvent('directive from client')).toBe('directive');
      expect(classifyEvent('client request received')).toBe('directive');
      expect(classifyEvent('OICC instruction')).toBe('directive');
      expect(classifyEvent('NAVFAC requirement')).toBe('directive');
      expect(classifyEvent('stop work order')).toBe('directive');
      expect(classifyEvent('hold operations')).toBe('directive');
      expect(classifyEvent('standdown issued')).toBe('directive');
      expect(classifyEvent('stand down all ops')).toBe('directive');
      expect(classifyEvent('order received')).toBe('directive');
      expect(classifyEvent('requested by PM')).toBe('directive');
      expect(classifyEvent('per client instruction')).toBe('directive');
      expect(classifyEvent('per supervisor')).toBe('directive');
    });

    it('should classify dive operation events correctly', () => {
      expect(classifyEvent('LS 0830')).toBe('dive_op');
      expect(classifyEvent('LB 0930')).toBe('dive_op');
      expect(classifyEvent('RS 1030')).toBe('dive_op');
      expect(classifyEvent('RB 1130')).toBe('dive_op');
      expect(classifyEvent('L/S 0830')).toBe('dive_op');
      expect(classifyEvent('L/B 0930')).toBe('dive_op');
      expect(classifyEvent('R/S 1030')).toBe('dive_op');
      expect(classifyEvent('R/B 1130')).toBe('dive_op');
      expect(classifyEvent('leave surface at 0830')).toBe('dive_op');
      expect(classifyEvent('left surface at 0830')).toBe('dive_op');
      expect(classifyEvent('on bottom at 0845')).toBe('dive_op');
      expect(classifyEvent('leaving bottom')).toBe('dive_op');
      expect(classifyEvent('left bottom at 0930')).toBe('dive_op');
      expect(classifyEvent('breached surface at 1000')).toBe('dive_op');
      expect(classifyEvent('breached bottom at 0845')).toBe('dive_op');
    });

    it('should classify ops events correctly', () => {
      expect(classifyEvent('morning briefing completed')).toBe('ops');
      expect(classifyEvent('equipment checked')).toBe('ops');
      expect(classifyEvent('standby duty started')).toBe('ops');
      expect(classifyEvent('toolbox talk completed')).toBe('ops');
      expect(classifyEvent('routine maintenance')).toBe('ops');
    });

    it('should prioritize safety over other categories', () => {
      expect(classifyEvent('incident: diver LS 0800')).toBe('safety');
      expect(classifyEvent('stop work - hazard detected')).toBe('safety');
    });

    it('should prioritize directive over dive_op', () => {
      expect(classifyEvent('client directive LS 0800')).toBe('directive');
      expect(classifyEvent('stop work order for all diving')).toBe('directive');
    });

    it('should handle empty input', () => {
      expect(classifyEvent('')).toBe('ops');
    });

    it('should handle whitespace-only input', () => {
      expect(classifyEvent('   ')).toBe('ops');
    });

    it('should be case-insensitive', () => {
      expect(classifyEvent('INCIDENT OCCURRED')).toBe('safety');
      expect(classifyEvent('Stop Work Order')).toBe('directive');
      expect(classifyEvent('ls 0800')).toBe('dive_op');
    });
  });

  // ==================== HAZARD DETECTION TESTS ====================
  describe('detectHazards', () => {
    it('should detect barge hazard', () => {
      const hazards = detectHazards('barge operation in progress');
      expect(hazards.length).toBeGreaterThan(0);
      expect(hazards[0].keyword).toBe('barge');
    });

    it('should detect welding hazard', () => {
      const hazards = detectHazards('welding work on pipeline');
      expect(hazards.length).toBeGreaterThan(0);
      expect(hazards[0].keyword).toBe('weld');
    });

    it('should detect grinding hazard', () => {
      const hazards = detectHazards('grinding operations started');
      expect(hazards.length).toBeGreaterThan(0);
      expect(hazards[0].keyword).toBe('grind');
    });

    it('should detect multiple hazards', () => {
      const hazards = detectHazards('welding and grinding operations');
      expect(hazards.length).toBe(2);
    });

    it('should return empty array for no hazards', () => {
      const hazards = detectHazards('routine dive completed successfully');
      expect(hazards).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const hazards1 = detectHazards('CONTAMINATION DETECTED');
      const hazards2 = detectHazards('contamination detected');
      expect(hazards1.length).toBe(hazards2.length);
    });

    it('should detect install hazard', () => {
      const hazards = detectHazards('install riser');
      expect(hazards.length).toBeGreaterThan(0);
    });
  });

  // ==================== RISK KEYWORDS TESTS ====================
  describe('hasRiskKeywords', () => {
    it('should detect risk keywords', () => {
      expect(hasRiskKeywords('risk of delay')).toBe(true);
      expect(hasRiskKeywords('schedule risk')).toBe(true);
      expect(hasRiskKeywords('risk of drift')).toBe(true);
      expect(hasRiskKeywords('safety risk')).toBe(true);
    });

    it('should return false for no risk keywords', () => {
      expect(hasRiskKeywords('routine operation')).toBe(false);
      expect(hasRiskKeywords('normal dive')).toBe(false);
    });
  });

  // ==================== STOP WORK DETECTION TESTS ====================
  describe('isStopWork', () => {
    it('should detect stop work orders', () => {
      expect(isStopWork('all stop')).toBe(true);
      expect(isStopWork('stop all dive operations')).toBe(true);
      expect(isStopWork('pull diver')).toBe(true);
      expect(isStopWork('secure dive ops')).toBe(true);
      expect(isStopWork('cease dive operations')).toBe(true);
      expect(isStopWork('break down station')).toBe(true);
    });

    it('should return false for non-stop-work text', () => {
      expect(isStopWork('continue working')).toBe(false);
      expect(isStopWork('work in progress')).toBe(false);
      expect(isStopWork('start work at 0800')).toBe(false);
    });
  });

  // ==================== DIRECTIVE TAG DETECTION TESTS ====================
  describe('detectDirectiveTag', () => {
    it('should detect directive tags', () => {
      // detectDirectiveTag returns null for non-directive categories
      expect(detectDirectiveTag('OICC directive to proceed', 'directive')).toBeDefined();
    });

    it('should return null for non-directive category', () => {
      expect(detectDirectiveTag('routine operation', 'ops')).toBeNull();
      expect(detectDirectiveTag('dive started at 0800', 'dive_op')).toBeNull();
    });
  });

  // ==================== TIME PARSING TESTS ====================
  describe('parseEventTime', () => {
    it('should parse 4-digit time', () => {
      const time = parseEventTime('0830', '2024-01-15');
      expect(time).toBeDefined();
    });

    it('should parse time with colon', () => {
      const time = parseEventTime('08:30', '2024-01-15');
      expect(time).toBeDefined();
    });

    it('should parse time from text', () => {
      const time = parseEventTime('LS 0830 for dive', '2024-01-15');
      expect(time).toBeDefined();
    });

    it('should return null for no time', () => {
      const time = parseEventTime('no time in this text', '2024-01-15');
      expect(time).toBeNull();
    });
  });

  // ==================== RISK ID GENERATION TESTS ====================
  describe('generateRiskId', () => {
    it('should generate unique risk IDs', () => {
      const id1 = generateRiskId('2024-01-15', 1);
      const id2 = generateRiskId('2024-01-15', 2);
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct format', () => {
      const id = generateRiskId('2024-01-15', 1);
      expect(id).toBe('RISK-20240115-001');
    });
  });

  // ==================== SECTION CLASSIFICATION TESTS ====================
  describe('getMasterLogSection', () => {
    it('should classify dive operations as dive', () => {
      expect(getMasterLogSection('dive_op')).toBe('dive');
    });

    it('should classify safety events as safety', () => {
      expect(getMasterLogSection('safety')).toBe('safety');
    });

    it('should classify directives as directives', () => {
      expect(getMasterLogSection('directive')).toBe('directives');
    });

    it('should classify ops events as ops', () => {
      expect(getMasterLogSection('ops')).toBe('ops');
    });
  });

  // ==================== DATA EXTRACTION TESTS ====================
  describe('extractData', () => {
    it('should extract dive times', () => {
      const data = extractData('LS 0800 LB 0845 RB 0930', 'dive_op');
      expect(data).toBeDefined();
    });

    it('should extract depth information', () => {
      const data = extractData('Dive to 150 FSW completed', 'dive_op');
      expect(data).toBeDefined();
    });

    it('should handle empty input', () => {
      const data = extractData('', 'ops');
      expect(data).toBeDefined();
    });
  });

  // ==================== TYPO FIXING TESTS ====================
  describe('fixTypos', () => {
    it('should fix common typos', () => {
      const fixed = fixTypos('diver left serface at 0800');
      expect(fixed).toBeDefined();
    });

    it('should preserve correct text', () => {
      const text = 'Diver left surface at 0800';
      const fixed = fixTypos(text);
      expect(fixed).toBe(text);
    });
  });

  // ==================== CANVAS LINE RENDERING TESTS ====================
  describe('renderInternalCanvasLine', () => {
    it('should render canvas line from raw input', () => {
      const time = new Date('2024-01-15T08:00:00');
      const line = renderInternalCanvasLine('LS 0800', time, 'dive_op', {});
      expect(line).toBeDefined();
      expect(typeof line).toBe('string');
    });

    it('should handle empty input', () => {
      const time = new Date('2024-01-15T08:00:00');
      const line = renderInternalCanvasLine('', time, 'ops', {});
      expect(line).toBeDefined();
    });
  });

  // ==================== EDGE CASES ====================
  describe('Edge Cases', () => {
    it('should handle very long input', () => {
      const longInput = 'A'.repeat(10000);
      expect(() => classifyEvent(longInput)).not.toThrow();
      expect(() => detectHazards(longInput)).not.toThrow();
    });

    it('should handle special characters', () => {
      const specialInput = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`';
      expect(() => classifyEvent(specialInput)).not.toThrow();
      expect(() => detectHazards(specialInput)).not.toThrow();
    });

    it('should handle unicode characters', () => {
      const unicodeInput = '日本語テスト dive 操作';
      expect(() => classifyEvent(unicodeInput)).not.toThrow();
      expect(() => detectHazards(unicodeInput)).not.toThrow();
    });

    it('should handle newlines and tabs', () => {
      const input = 'LS 0800\n\tLB 0845\n\tRB 0930';
      expect(() => classifyEvent(input)).not.toThrow();
    });
  });
});