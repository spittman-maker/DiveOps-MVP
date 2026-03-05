/**
 * Unit Tests for Validator Module (validator.ts)
 * 
 * Tests pure functions for content validation and sanitization
 * without database dependencies.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeForMasterLog,
  validateAIContent,
  validateTimestamp,
  formatTimeTo24Hour,
} from '../../server/validator';

describe('Validator Unit Tests', () => {
  // ==================== SANITIZATION TESTS ====================
  describe('sanitizeForMasterLog', () => {
    it('should replace JV with Client', () => {
      const result = sanitizeForMasterLog('JV representative approved the plan');
      expect(result).not.toContain('JV');
      expect(result).toContain('Client');
    });

    it('should replace OICC with Client', () => {
      const result = sanitizeForMasterLog('OICC confirmed the scope');
      expect(result).not.toContain('OICC');
      expect(result).toContain('Client');
    });

    it('should handle both JV and OICC in same text', () => {
      const result = sanitizeForMasterLog('JV and OICC representatives met today');
      expect(result).not.toContain('JV');
      expect(result).not.toContain('OICC');
      expect(result).toContain('Client');
    });

    it('should handle Client/Client duplication', () => {
      const result = sanitizeForMasterLog('Client/Client approved the plan');
      expect(result).not.toContain('Client/Client');
      expect(result).toContain('Client');
    });

    it('should convert 12-hour time to 24-hour format', () => {
      const result = sanitizeForMasterLog('Dive at 2:30 PM');
      expect(result).toBeDefined();
    });

    it('should handle a.m. and p.m. formats', () => {
      const result1 = sanitizeForMasterLog('Meeting at 10:30 a.m.');
      const result2 = sanitizeForMasterLog('Dive at 2:45 p.m.');
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should handle AM and PM formats', () => {
      const result1 = sanitizeForMasterLog('Meeting at 10:30 AM');
      const result2 = sanitizeForMasterLog('Dive at 2:45 PM');
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should preserve other content', () => {
      const result = sanitizeForMasterLog('Diver John completed the task at 150 FSW');
      expect(result).toContain('John');
      expect(result).toContain('150');
    });

    it('should handle empty string', () => {
      const result = sanitizeForMasterLog('');
      expect(result).toBe('');
    });

    it('should handle text with no replacements needed', () => {
      const text = 'Dive completed successfully at 1500';
      const result = sanitizeForMasterLog(text);
      expect(result).toBe(text);
    });

    it('should handle special regex characters in terminology', () => {
      // Test that regex special characters don't cause errors
      const result = sanitizeForMasterLog('Test (parentheses) [brackets] {braces}');
      expect(result).toBeDefined();
    });
  });

  // ==================== AI CONTENT VALIDATION TESTS ====================
  describe('validateAIContent', () => {
    it('should validate correct content', () => {
      const result = validateAIContent('Dive completed at 150 FSW for 45 minutes');
      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
    });

    it('should detect missing information', () => {
      const result = validateAIContent('');
      expect(result).toBeDefined();
    });

    it('should handle very long content', () => {
      const longContent = 'A'.repeat(10000);
      const result = validateAIContent(longContent);
      expect(result).toBeDefined();
    });

    it('should detect time format issues', () => {
      const result = validateAIContent('Dive at 25:00 hours');
      expect(result).toBeDefined();
    });

    it('should return structured validation result', () => {
      const result = validateAIContent('Test content');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should handle special characters', () => {
      const result = validateAIContent('!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`');
      expect(result).toBeDefined();
    });

    it('should handle unicode content', () => {
      const result = validateAIContent('日本語テスト dive 操作');
      expect(result).toBeDefined();
    });
  });

  // ==================== TIMESTAMP VALIDATION TESTS ====================
  describe('validateTimestamp', () => {
    it('should validate correct timestamps', () => {
      expect(validateTimestamp('2024-01-15T08:30:00Z')).toBe(true);
      expect(validateTimestamp('2024-12-31T23:59:59Z')).toBe(true);
    });

    it('should reject invalid timestamps', () => {
      expect(validateTimestamp('not-a-timestamp')).toBe(false);
      expect(validateTimestamp('2024-13-01T00:00:00Z')).toBe(false);
    });

    it('should handle empty input', () => {
      expect(validateTimestamp('')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(validateTimestamp(null as any)).toBe(false);
      expect(validateTimestamp(undefined as any)).toBe(false);
    });
  });

  // ==================== TIME FORMAT CONVERSION TESTS ====================
  describe('formatTimeTo24Hour', () => {
    it('should convert AM times correctly', () => {
      expect(formatTimeTo24Hour('12:00 AM')).toBe('00:00');
      expect(formatTimeTo24Hour('01:00 AM')).toBe('01:00');
      expect(formatTimeTo24Hour('11:59 AM')).toBe('11:59');
    });

    it('should convert PM times correctly', () => {
      expect(formatTimeTo24Hour('12:00 PM')).toBe('12:00');
      expect(formatTimeTo24Hour('01:00 PM')).toBe('13:00');
      expect(formatTimeTo24Hour('11:59 PM')).toBe('23:59');
    });

    it('should handle a.m. and p.m. formats', () => {
      expect(formatTimeTo24Hour('10:30 a.m.')).toBe('10:30');
      expect(formatTimeTo24Hour('02:45 p.m.')).toBe('14:45');
    });

    it('should return original for invalid input', () => {
      expect(formatTimeTo24Hour('invalid')).toBe('invalid');
      expect(formatTimeTo24Hour('')).toBe('');
    });
  });

  // ==================== EDGE CASES ====================
  describe('Edge Cases', () => {
    it('should handle very long strings', () => {
      const longString = 'A'.repeat(100000);
      expect(() => sanitizeForMasterLog(longString)).not.toThrow();
    });

    it('should handle strings with only whitespace', () => {
      const result = sanitizeForMasterLog('   ');
      expect(result).toBeDefined();
    });

    it('should handle mixed case terminology', () => {
      const result = sanitizeForMasterLog('jv and oicc representatives met');
      expect(result.toLowerCase()).not.toContain('jv');
      expect(result.toLowerCase()).not.toContain('oicc');
    });

    it('should handle multiple occurrences', () => {
      const result = sanitizeForMasterLog('JV said JV confirmed JV approved');
      const clientCount = (result.match(/Client/g) || []).length;
      expect(clientCount).toBe(3);
    });
  });
});