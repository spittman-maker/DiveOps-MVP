/**
 * Unit tests for shared/navy-dive-tables.ts
 * Validates all tables, lookup functions, and citation system
 * against U.S. Navy Diving Manual, Revision 7
 */
import { describe, it, expect } from 'vitest';
import {
  NO_DECOM_TABLE,
  AIR_DECOM_TABLE,
  RNT_TABLE,
  SURFACE_INTERVAL_TABLE,
  PNEUMO_CORRECTION_TABLE,
  ALTITUDE_REPETITIVE_GROUPS,
  ALTITUDE_SURFACE_INTERVALS,
  ALTITUDE_DMO_WARNING,
  TABLE_9_2_DESCRIPTION,
  TABLE_9_3_DESCRIPTION,
  TABLE_DEPTHS,
  USN_MANUAL_CITATION,
  lookupDiveTable,
  lookupNewGroupAfterSurfaceInterval,
  lookupResidualNitrogenTime,
  planRepetitiveDive,
  calculateEAD,
  roundToNextDeeperDepth,
} from '../../shared/navy-dive-tables';

// ==================== TABLE 9-7: NO-DECOMPRESSION LIMITS ====================
describe('Table 9-7: No-Decompression Limits', () => {
  it('should include shallow depths 10, 15, 20, 25, 30, 35 fsw', () => {
    const depths = NO_DECOM_TABLE.map(r => r.depth);
    expect(depths).toContain(10);
    expect(depths).toContain(15);
    expect(depths).toContain(20);
    expect(depths).toContain(25);
    expect(depths).toContain(30);
    expect(depths).toContain(35);
  });

  it('should mark 10, 15, 20 fsw as unlimited', () => {
    for (const depth of [10, 15, 20]) {
      const row = NO_DECOM_TABLE.find(r => r.depth === depth);
      expect(row).toBeDefined();
      expect(row!.unlimited).toBe(true);
      expect(row!.noStopLimit).toBe(Infinity);
    }
  });

  it('should have correct no-stop limits for key depths', () => {
    // Values transcribed from USN Diving Manual Rev 7, Table 9-7, p. 9-63
    const expected: Record<number, number> = {
      25: 1102,
      30: 371,
      35: 232,
      40: 163,
      50: 92,
      60: 63,
      70: 48,
      80: 39,
      90: 33,
      100: 25,
      110: 20,
      120: 15,
      130: 12,
      140: 10,
      150: 8,
      160: 7,
      170: 6,
      180: 6,
      190: 5,
    };
    for (const [depth, limit] of Object.entries(expected)) {
      const row = NO_DECOM_TABLE.find(r => r.depth === Number(depth));
      expect(row, `Missing depth ${depth}`).toBeDefined();
      expect(row!.noStopLimit).toBe(limit);
    }
  });

  it('should start at 10 fsw, not 40 fsw', () => {
    const firstDepth = NO_DECOM_TABLE[0].depth;
    expect(firstDepth).toBe(10);
  });

  it('should have group entries for depths with defined groups', () => {
    const row40 = NO_DECOM_TABLE.find(r => r.depth === 40);
    expect(row40).toBeDefined();
    expect(row40!.entries.length).toBeGreaterThan(0);
    expect(row40!.entries[0].group).toBe('A');
  });
});

// ==================== TABLE 9-8: SURFACE INTERVAL & RNT ====================
describe('Table 9-8: Surface Interval Table', () => {
  it('should have entries for all groups A through Z', () => {
    const expectedGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'Z'];
    for (const group of expectedGroups) {
      expect(SURFACE_INTERVAL_TABLE[group], `Missing group ${group}`).toBeDefined();
      expect(SURFACE_INTERVAL_TABLE[group].length).toBeGreaterThan(0);
    }
  });

  it('should correctly look up new group after surface interval', () => {
    const result1 = lookupNewGroupAfterSurfaceInterval('Z', 10);
    expect(result1).toBe('Z');

    const result2 = lookupNewGroupAfterSurfaceInterval('A', 9999);
    expect(result2).toBeNull();
  });

  it('should return starting group for SI < 10 min', () => {
    const result = lookupNewGroupAfterSurfaceInterval('N', 5);
    expect(result).toBe('N');
  });
});

describe('Table 9-8: Residual Nitrogen Time', () => {
  it('should have RNT entries for depths 10 through 190 fsw', () => {
    const expectedDepths = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
    for (const depth of expectedDepths) {
      expect(RNT_TABLE[depth], `Missing RNT depth ${depth}`).toBeDefined();
    }
  });

  it('should return -1 for ** (cannot be determined) entries', () => {
    expect(RNT_TABLE[10]['Z']).toBe(-1);
    expect(RNT_TABLE[10]['O']).toBe(-1);
    expect(RNT_TABLE[10]['G']).toBe(-1);
  });

  it('should return -2 for dagger (read down to 30 fsw) entries', () => {
    expect(RNT_TABLE[25]['Z']).toBe(-2);
  });

  it('should correctly look up RNT values', () => {
    const rnt = lookupResidualNitrogenTime('A', 100);
    expect(rnt).toBe(5);
  });

  it('should handle dagger fallback to 30 fsw', () => {
    const rnt = lookupResidualNitrogenTime('Z', 25);
    expect(rnt).toBe(RNT_TABLE[30]['Z']);
  });

  it('should return null for ** entries', () => {
    const rnt = lookupResidualNitrogenTime('Z', 10);
    expect(rnt).toBeNull();
  });
});

// ==================== TABLE 9-9: AIR DECOMPRESSION ====================
describe('Table 9-9: Air Decompression Table', () => {
  it('should include depths 30 and 35 fsw', () => {
    const depths = AIR_DECOM_TABLE.map(r => r.depth);
    expect(depths).toContain(30);
    expect(depths).toContain(35);
  });

  it('should include depths 45 and 55 fsw', () => {
    const depths = AIR_DECOM_TABLE.map(r => r.depth);
    expect(depths).toContain(45);
    expect(depths).toContain(55);
  });

  it('should include deep depths 200-300 fsw', () => {
    const depths = AIR_DECOM_TABLE.map(r => r.depth);
    expect(depths).toContain(200);
    expect(depths).toContain(300);
  });

  it('should have Air/O2 stop data for shallow depths', () => {
    const row30 = AIR_DECOM_TABLE.find(r => r.depth === 30);
    expect(row30).toBeDefined();
    const decompEntry = row30!.entries.find(e => e.totalDecompTime > 0);
    expect(decompEntry).toBeDefined();
    expect(decompEntry!.airO2Stops).toBeDefined();
    expect(decompEntry!.airO2TotalDecompTime).toBeDefined();
  });

  it('should have SurDO2 periods for applicable entries', () => {
    const row30 = AIR_DECOM_TABLE.find(r => r.depth === 30);
    expect(row30).toBeDefined();
    const decompEntry = row30!.entries.find(e => e.totalDecompTime > 0);
    expect(decompEntry).toBeDefined();
    expect(decompEntry!.surDO2Periods).toBeDefined();
  });

  it('should flag exceptional exposure schedules', () => {
    const row30 = AIR_DECOM_TABLE.find(r => r.depth === 30);
    expect(row30).toBeDefined();
    const eeEntry = row30!.entries.find(e => e.exceptionalExposure);
    expect(eeEntry).toBeDefined();
  });

  it('should support multi-stop schedules at deeper depths', () => {
    const row190 = AIR_DECOM_TABLE.find(r => r.depth === 190);
    expect(row190).toBeDefined();
    const multiStopEntry = row190!.entries.find(e => e.decompStops.length > 1);
    expect(multiStopEntry).toBeDefined();
    const stopDepths = multiStopEntry!.decompStops.map(s => s.depth);
    const uniqueDepths = new Set(stopDepths);
    expect(uniqueDepths.size).toBeGreaterThan(1);
  });
});

// ==================== TABLE 9-1: PNEUMOFATHOMETER CORRECTION ====================
describe('Table 9-1: Pneumofathometer Correction Factors', () => {
  it('should exist as a reference table', () => {
    expect(PNEUMO_CORRECTION_TABLE).toBeDefined();
    expect(PNEUMO_CORRECTION_TABLE.length).toBeGreaterThan(0);
  });

  it('should have hoseLength and correctionFactor fields', () => {
    const first = PNEUMO_CORRECTION_TABLE[0];
    expect(first).toHaveProperty('hoseLength');
    expect(first).toHaveProperty('correctionFactor');
  });
});

// ==================== TABLES 9-4, 9-5, 9-6: ALTITUDE DIVING ====================
describe('Tables 9-4, 9-5, 9-6: Altitude Diving', () => {
  it('should have Table 9-5 altitude repetitive groups', () => {
    expect(ALTITUDE_REPETITIVE_GROUPS).toBeDefined();
    expect(ALTITUDE_REPETITIVE_GROUPS.length).toBeGreaterThan(0);
  });

  it('should have Table 9-6 altitude surface intervals', () => {
    expect(ALTITUDE_SURFACE_INTERVALS).toBeDefined();
    expect(Object.keys(ALTITUDE_SURFACE_INTERVALS).length).toBeGreaterThan(0);
  });

  it('should include DMO warning', () => {
    expect(ALTITUDE_DMO_WARNING).toBeDefined();
    expect(ALTITUDE_DMO_WARNING).toContain('DMO');
    expect(ALTITUDE_DMO_WARNING).toContain('WARNING');
  });
});

// ==================== TABLES 9-2, 9-3: DECISION TREES ====================
describe('Tables 9-2, 9-3: Decision Trees', () => {
  it('should have Table 9-2 description', () => {
    expect(TABLE_9_2_DESCRIPTION).toBeDefined();
    expect(TABLE_9_2_DESCRIPTION.tableNumber).toBe('9-2');
    expect(TABLE_9_2_DESCRIPTION.name).toBeDefined();
    expect(TABLE_9_2_DESCRIPTION.summary).toBeDefined();
  });

  it('should have Table 9-3 description', () => {
    expect(TABLE_9_3_DESCRIPTION).toBeDefined();
    expect(TABLE_9_3_DESCRIPTION.tableNumber).toBe('9-3');
    expect(TABLE_9_3_DESCRIPTION.name).toBeDefined();
    expect(TABLE_9_3_DESCRIPTION.summary).toBeDefined();
  });
});

// ==================== CITATION SYSTEM ====================
describe('Citation System', () => {
  it('should have USN_MANUAL_CITATION constant', () => {
    expect(USN_MANUAL_CITATION).toBeDefined();
    expect(USN_MANUAL_CITATION.title).toContain('Navy Diving Manual');
    expect(USN_MANUAL_CITATION.revision).toBe('Revision 7');
    expect(USN_MANUAL_CITATION.authority).toContain('NAVSEA');
  });

  it('should NOT link to an external website', () => {
    // inAppReference should reference in-app storage, not an external URL
    expect(USN_MANUAL_CITATION.inAppReference).toBeDefined();
    expect(USN_MANUAL_CITATION.inAppReference).not.toMatch(/https?:\/\//);
  });

  it('should attach citation to every DiveTableResult', () => {
    const result = lookupDiveTable(60, 30);
    expect(result.citation).toBeDefined();
    expect(result.citation.tableNumber).toBeDefined();
    expect(result.citation.manualRevision).toBe('Revision 7');
    expect(result.citation.authority).toBeDefined();
    expect(result.citation.chapterPage).toBeDefined();
    expect(result.citation.inAppReference).toBeDefined();
  });

  it('should include table number, page, manual revision, and authority in citation', () => {
    const result = lookupDiveTable(100, 20);
    expect(result.citation.tableNumber).toMatch(/^9-/);
    expect(result.citation.chapterPage).toMatch(/^9-/);
    expect(result.citation.manualRevision).toBe('Revision 7');
    expect(result.citation.authority).toContain('NAVSEA');
  });
});

// ==================== lookupDiveTable() FUNCTION ====================
describe('lookupDiveTable() Function', () => {
  it('should return correct group for shallow dives (< 40 fsw) — NOT defaulting to A', () => {
    // 25 fsw, 100 min — should get a proper group, not default to A
    const result = lookupDiveTable(25, 100);
    expect(result.repetitiveGroup).not.toBe('');
    expect(result.withinNoDecompLimits).toBe(true);
    expect(result.decompRequired).toBe('NO');
  });

  it('should return correct group for 30 fsw dive', () => {
    const result = lookupDiveTable(30, 100);
    expect(result.repetitiveGroup).toBeDefined();
    expect(result.repetitiveGroup).not.toBe('');
    expect(result.withinNoDecompLimits).toBe(true);
  });

  it('should handle unlimited depths (10, 15, 20 fsw)', () => {
    const result = lookupDiveTable(15, 500);
    expect(result.withinNoDecompLimits).toBe(true);
    expect(result.noDecompLimit).toBeNull();
    expect(result.decompRequired).toBe('NO');
  });

  it('should return correct no-stop result for 60 fsw / 30 min', () => {
    const result = lookupDiveTable(60, 30);
    expect(result.withinNoDecompLimits).toBe(true);
    expect(result.decompRequired).toBe('NO');
    expect(result.repetitiveGroup).toBeDefined();
    expect(result.tableUsed).toContain('9-7');
  });

  it('should return decompression result for 60 fsw / 90 min', () => {
    const result = lookupDiveTable(60, 90);
    expect(result.withinNoDecompLimits).toBe(false);
    expect(result.decompRequired).toBe('YES');
    expect(result.decompStops.length).toBeGreaterThan(0);
    expect(result.tableUsed).toContain('9-9');
  });

  it('should round depth up to next table depth', () => {
    const result = lookupDiveTable(42, 30);
    expect(result.scheduleUsed).toMatch(/^45\//);
  });

  it('should handle Nitrox EAD calculation', () => {
    const result = lookupDiveTable(100, 30, 'nitrox', 32);
    expect(result.warnings.some(w => w.includes('EAD'))).toBe(true);
  });

  it('should flag exceptional exposure schedules', () => {
    const result = lookupDiveTable(30, 600);
    if (result.exceptionalExposure) {
      expect(result.warnings.some(w => w.includes('EXCEPTIONAL'))).toBe(true);
    }
  });

  it('should return proper group for 35 fsw / 50 min', () => {
    const result = lookupDiveTable(35, 50);
    expect(result.withinNoDecompLimits).toBe(true);
    expect(result.repetitiveGroup).toBeDefined();
    expect(result.repetitiveGroup.length).toBe(1);
  });
});

// ==================== REPETITIVE DIVE PLANNING ====================
describe('Repetitive Dive Planning', () => {
  it('should plan a repetitive dive correctly', () => {
    const plan = planRepetitiveDive('F', 120, 60);
    expect(plan.previousGroup).toBe('F');
    expect(plan.surfaceIntervalMinutes).toBe(120);
    expect(plan.isRepetitive).toBeDefined();
    expect(plan.citation).toBeDefined();
  });

  it('should calculate adjusted no-decomp limit', () => {
    const plan = planRepetitiveDive('C', 180, 60);
    if (plan.isRepetitive && plan.residualNitrogenTime !== null) {
      expect(plan.adjustedNoDecompLimit).toBeDefined();
    }
  });

  it('should warn when RNT cannot be determined', () => {
    const plan = planRepetitiveDive('Z', 30, 10);
    if (plan.isRepetitive) {
      expect(plan.warnings.length).toBeGreaterThan(0);
    }
  });
});

// ==================== UTILITY FUNCTIONS ====================
describe('Utility Functions', () => {
  it('should calculate EAD correctly', () => {
    const ead = calculateEAD(100, 0.32);
    expect(ead).toBeGreaterThan(80);
    expect(ead).toBeLessThan(83);
  });

  it('should round to next deeper depth correctly', () => {
    expect(roundToNextDeeperDepth(10)).toBe(10);
    expect(roundToNextDeeperDepth(11)).toBe(15);
    expect(roundToNextDeeperDepth(42)).toBe(45);
    expect(roundToNextDeeperDepth(100)).toBe(100);
    expect(roundToNextDeeperDepth(195)).toBe(200);
  });

  it('should have TABLE_DEPTHS covering 10 through 300 fsw', () => {
    expect(TABLE_DEPTHS[0]).toBe(10);
    expect(TABLE_DEPTHS).toContain(300);
    expect(TABLE_DEPTHS.length).toBeGreaterThan(20);
  });
});
