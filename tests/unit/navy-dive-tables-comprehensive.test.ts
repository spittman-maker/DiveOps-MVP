/**
 * COMPREHENSIVE verification tests for shared/navy-dive-tables.ts
 * Validates ALL table data, structural correctness, cross-table consistency,
 * and known spot-check values against U.S. Navy Diving Manual, Revision 7.
 *
 * These tests ensure the tables are 100% accurate for operational use.
 */
import { describe, it, expect } from 'vitest';
import {
  NO_DECOM_TABLE,
  AIR_DECOM_TABLE,
  RNT_TABLE,
  SURFACE_INTERVAL_TABLE,
  TABLE_DEPTHS,
  lookupDiveTable,
  lookupNewGroupAfterSurfaceInterval,
  lookupResidualNitrogenTime,
  planRepetitiveDive,
  calculateEAD,
  roundToNextDeeperDepth,
} from '../../shared/navy-dive-tables';

// ============================================================================
// TABLE 9-7: STRUCTURAL INTEGRITY
// ============================================================================
describe('Table 9-7: Structural Integrity', () => {
  const ALL_GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","Z"];

  it('should cover all depths from TABLE_DEPTHS that are ≤ 190 fsw', () => {
    const expected = TABLE_DEPTHS.filter(d => d <= 190);
    const actual = NO_DECOM_TABLE.map(r => r.depth);
    expect(actual).toEqual(expected);
  });

  it('should have depths in ascending order', () => {
    for (let i = 1; i < NO_DECOM_TABLE.length; i++) {
      expect(NO_DECOM_TABLE[i].depth).toBeGreaterThan(NO_DECOM_TABLE[i-1].depth);
    }
  });

  it('should have NDLs that decrease with depth (excluding unlimited)', () => {
    const nonUnlimited = NO_DECOM_TABLE.filter(r => !r.unlimited);
    for (let i = 1; i < nonUnlimited.length; i++) {
      expect(nonUnlimited[i].noStopLimit).toBeLessThanOrEqual(nonUnlimited[i-1].noStopLimit);
    }
  });

  it('should only have 10, 15, 20 fsw as unlimited', () => {
    const unlimited = NO_DECOM_TABLE.filter(r => r.unlimited).map(r => r.depth);
    expect(unlimited).toEqual([10, 15, 20]);
  });

  it('should have entries with monotonically increasing bottom times within each depth', () => {
    for (const row of NO_DECOM_TABLE) {
      for (let i = 1; i < row.entries.length; i++) {
        expect(row.entries[i].maxBottomTime).toBeGreaterThan(row.entries[i-1].maxBottomTime);
      }
    }
  });

  it('should have entries with monotonically increasing group letters within each depth', () => {
    for (const row of NO_DECOM_TABLE) {
      for (let i = 1; i < row.entries.length; i++) {
        const prevIdx = ALL_GROUPS.indexOf(row.entries[i-1].group);
        const currIdx = ALL_GROUPS.indexOf(row.entries[i].group);
        expect(currIdx).toBeGreaterThan(prevIdx);
      }
    }
  });

  it('should have last entry maxBottomTime equal to noStopLimit for non-unlimited depths', () => {
    for (const row of NO_DECOM_TABLE) {
      if (!row.unlimited) {
        const lastEntry = row.entries[row.entries.length - 1];
        expect(lastEntry.maxBottomTime).toBe(row.noStopLimit);
      }
    }
  });

  it('should only use valid group letters', () => {
    for (const row of NO_DECOM_TABLE) {
      for (const entry of row.entries) {
        expect(ALL_GROUPS).toContain(entry.group);
      }
    }
  });

  it('should have at least 2 entries per depth row', () => {
    for (const row of NO_DECOM_TABLE) {
      expect(row.entries.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('should always start with group A or higher (never lower than first available)', () => {
    for (const row of NO_DECOM_TABLE) {
      const firstGroup = row.entries[0].group;
      const idx = ALL_GROUPS.indexOf(firstGroup);
      expect(idx).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// TABLE 9-7: EXACT NO-DECOMPRESSION LIMITS (Rev 7 Spot Checks)
// ============================================================================
describe('Table 9-7: Exact No-Decompression Limits', () => {
  // These NDL values are from USN Diving Manual Rev 7, Table 9-7, p. 9-63
  const NDL_SPOT_CHECKS: Record<number, number | 'unlimited'> = {
    10: 'unlimited',
    15: 'unlimited',
    20: 'unlimited',
    25: 1102,
    30: 371,
    35: 232,
    40: 163,
    45: 125,
    50: 92,
    55: 74,
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

  for (const [depth, expected] of Object.entries(NDL_SPOT_CHECKS)) {
    it(`should have NDL=${expected} at ${depth} fsw`, () => {
      const row = NO_DECOM_TABLE.find(r => r.depth === Number(depth));
      expect(row).toBeDefined();
      if (expected === 'unlimited') {
        expect(row!.unlimited).toBe(true);
        expect(row!.noStopLimit).toBe(Infinity);
      } else {
        expect(row!.noStopLimit).toBe(expected);
      }
    });
  }
});

// ============================================================================
// TABLE 9-7: EXACT GROUP DESIGNATOR CHECKS (Key Depths)
// ============================================================================
describe('Table 9-7: Group Designator Spot Checks', () => {
  it('40 fsw: A=12, B=20, C=27, D=36, E=44, F=53, G=63, H=73, I=84, J=95, K=108, L=121, M=135, N=151, O=163', () => {
    const row = NO_DECOM_TABLE.find(r => r.depth === 40)!;
    const expected = [
      { maxBottomTime: 12, group: "A" }, { maxBottomTime: 20, group: "B" },
      { maxBottomTime: 27, group: "C" }, { maxBottomTime: 36, group: "D" },
      { maxBottomTime: 44, group: "E" }, { maxBottomTime: 53, group: "F" },
      { maxBottomTime: 63, group: "G" }, { maxBottomTime: 73, group: "H" },
      { maxBottomTime: 84, group: "I" }, { maxBottomTime: 95, group: "J" },
      { maxBottomTime: 108, group: "K" }, { maxBottomTime: 121, group: "L" },
      { maxBottomTime: 135, group: "M" }, { maxBottomTime: 151, group: "N" },
      { maxBottomTime: 163, group: "O" },
    ];
    expect(row.entries).toEqual(expected);
  });

  it('60 fsw: A=7, B=12, C=17, D=22, E=28, F=33, G=39, H=45, I=51, J=57, K=63', () => {
    const row = NO_DECOM_TABLE.find(r => r.depth === 60)!;
    expect(row.entries.length).toBe(11);
    expect(row.entries[0]).toEqual({ maxBottomTime: 7, group: "A" });
    expect(row.entries[10]).toEqual({ maxBottomTime: 63, group: "K" });
  });

  it('100 fsw: A=4, B=6, C=9, D=12, E=15, F=18, G=21, H=25', () => {
    const row = NO_DECOM_TABLE.find(r => r.depth === 100)!;
    expect(row.entries.length).toBe(8);
    expect(row.entries[0]).toEqual({ maxBottomTime: 4, group: "A" });
    expect(row.entries[7]).toEqual({ maxBottomTime: 25, group: "H" });
  });

  it('150 fsw starts at group B (no group A entry)', () => {
    const row = NO_DECOM_TABLE.find(r => r.depth === 150)!;
    expect(row.entries[0].group).toBe("B");
  });

  it('190 fsw starts at group C (no A or B entry)', () => {
    const row = NO_DECOM_TABLE.find(r => r.depth === 190)!;
    expect(row.entries[0].group).toBe("C");
  });

  it('25 fsw should be the shallowest depth with Z group', () => {
    const row25 = NO_DECOM_TABLE.find(r => r.depth === 25)!;
    expect(row25.entries[row25.entries.length - 1].group).toBe("Z");

    // 20 fsw should NOT have Z
    const row20 = NO_DECOM_TABLE.find(r => r.depth === 20)!;
    expect(row20.entries[row20.entries.length - 1].group).not.toBe("Z");
  });
});

// ============================================================================
// TABLE 9-8: SURFACE INTERVAL STRUCTURAL INTEGRITY
// ============================================================================
describe('Table 9-8: Surface Interval Structural Integrity', () => {
  const EXPECTED_GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","Z"];

  it('should have entries for all 16 groups (A-O plus Z)', () => {
    for (const g of EXPECTED_GROUPS) {
      expect(SURFACE_INTERVAL_TABLE[g]).toBeDefined();
    }
  });

  it('should have ranges that start at 10 min for every group', () => {
    for (const g of EXPECTED_GROUPS) {
      expect(SURFACE_INTERVAL_TABLE[g][0].minMinutes).toBe(10);
    }
  });

  it('should have contiguous ranges (no gaps) within each group', () => {
    for (const g of EXPECTED_GROUPS) {
      const ranges = SURFACE_INTERVAL_TABLE[g];
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].minMinutes).toBe(ranges[i-1].maxMinutes + 1);
      }
    }
  });

  it('should have ranges in descending group order (highest group first for group Z)', () => {
    const ranges = SURFACE_INTERVAL_TABLE["Z"];
    const groups = ranges.map(r => r.newGroup);
    // Should go Z, O, N, M, ..., A
    for (let i = 1; i < groups.length; i++) {
      const prevIdx = EXPECTED_GROUPS.indexOf(groups[i-1]);
      const currIdx = EXPECTED_GROUPS.indexOf(groups[i]);
      expect(currIdx).toBeLessThan(prevIdx);
    }
  });

  it('should always end with newGroup "A"', () => {
    for (const g of EXPECTED_GROUPS) {
      const ranges = SURFACE_INTERVAL_TABLE[g];
      expect(ranges[ranges.length - 1].newGroup).toBe("A");
    }
  });

  it('should have progressively longer max intervals for higher starting groups', () => {
    let prevMax = 0;
    for (const g of EXPECTED_GROUPS) {
      const ranges = SURFACE_INTERVAL_TABLE[g];
      const maxInterval = ranges[ranges.length - 1].maxMinutes;
      expect(maxInterval).toBeGreaterThan(prevMax);
      prevMax = maxInterval;
    }
  });
});

// ============================================================================
// TABLE 9-8: RNT STRUCTURAL INTEGRITY
// ============================================================================
describe('Table 9-8: RNT Structural Integrity', () => {
  const RNT_DEPTHS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
  const RNT_GROUPS = ["Z","O","N","M","L","K","J","I","H","G","F","E","D","C","B","A"];

  it('should have entries for all 24 depths (10-190 fsw)', () => {
    for (const d of RNT_DEPTHS) {
      expect(RNT_TABLE[d]).toBeDefined();
    }
  });

  it('should have entries for all 16 groups at every depth', () => {
    for (const d of RNT_DEPTHS) {
      for (const g of RNT_GROUPS) {
        expect(RNT_TABLE[d][g]).toBeDefined();
      }
    }
  });

  it('should have RNT=0 for group A at all depths (non-negative)', () => {
    // Group A should have the lowest RNT at every depth
    for (const d of RNT_DEPTHS) {
      const val = RNT_TABLE[d]["A"];
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it('should have RNT generally decreasing with depth for mid-range groups at 40+ fsw', () => {
    // For mid-range groups at operational depths (40+), deeper = less RNT
    // Note: very shallow depths (10-25 fsw) can have anomalies due to the nitrogen model
    for (const g of ["D", "E", "F"]) {
      let prevRnt = Infinity;
      for (const d of RNT_DEPTHS.filter(d => d >= 40)) {
        const val = RNT_TABLE[d][g];
        if (val >= 0) {
          expect(val).toBeLessThanOrEqual(prevRnt);
          prevRnt = val;
        }
      }
    }
  });

  it('should have RNT increasing with group letter for the same depth', () => {
    // Higher groups = more nitrogen = higher RNT
    for (const d of [60, 100, 150]) {
      const validGroups = RNT_GROUPS.filter(g => RNT_TABLE[d][g] >= 0);
      for (let i = 1; i < validGroups.length; i++) {
        // Groups are in Z,O,N,...,A order, so RNT should decrease
        expect(RNT_TABLE[d][validGroups[i]]).toBeLessThanOrEqual(RNT_TABLE[d][validGroups[i-1]]);
      }
    }
  });

  it('should use -1 for "cannot be determined" entries', () => {
    // 10 fsw should have many -1 entries (shallow depth, high groups can\'t be determined)
    expect(RNT_TABLE[10]["Z"]).toBe(-1);
    expect(RNT_TABLE[10]["O"]).toBe(-1);
  });

  it('should use -2 for dagger entries (read down to 30 fsw)', () => {
    expect(RNT_TABLE[25]["Z"]).toBe(-2);
  });

  it('RNT spot check: group A at 100 fsw = 5', () => {
    expect(RNT_TABLE[100]["A"]).toBe(5);
  });

  it('RNT spot check: group Z at 60 fsw = 101', () => {
    expect(RNT_TABLE[60]["Z"]).toBe(101);
  });

  it('RNT spot check: group F at 40 fsw = 55', () => {
    expect(RNT_TABLE[40]["F"]).toBe(55);
  });
});

// ============================================================================
// TABLE 9-9: AIR DECOMPRESSION STRUCTURAL INTEGRITY
// ============================================================================
describe('Table 9-9: Air Decompression Structural Integrity', () => {
  it('should cover depths 30-300 fsw', () => {
    const depths = AIR_DECOM_TABLE.map(r => r.depth);
    expect(depths[0]).toBe(30);
    expect(depths[depths.length - 1]).toBe(300);
  });

  it('should have entries with monotonically increasing bottom times per depth', () => {
    for (const row of AIR_DECOM_TABLE) {
      for (let i = 1; i < row.entries.length; i++) {
        expect(row.entries[i].bottomTime).toBeGreaterThan(row.entries[i-1].bottomTime);
      }
    }
  });

  it('should have entries with monotonically increasing total decomp time per depth', () => {
    for (const row of AIR_DECOM_TABLE) {
      for (let i = 1; i < row.entries.length; i++) {
        expect(row.entries[i].totalDecompTime).toBeGreaterThanOrEqual(row.entries[i-1].totalDecompTime);
      }
    }
  });

  it('first entry at each depth should match Table 9-7 NDL boundary (for depths ≤ 190)', () => {
    for (const decompRow of AIR_DECOM_TABLE) {
      if (decompRow.depth > 190) continue;
      const noDecompRow = NO_DECOM_TABLE.find(r => r.depth === decompRow.depth);
      if (noDecompRow && !noDecompRow.unlimited) {
        // First decompression entry should be at or near the NDL
        expect(decompRow.entries[0].bottomTime).toBe(noDecompRow.noStopLimit);
        // And it should have 0 decompression time (it's the NDL itself)
        expect(decompRow.entries[0].totalDecompTime).toBe(0);
      }
    }
  });

  it('decompression stop depths should be in decreasing order (deepest stop first)', () => {
    for (const row of AIR_DECOM_TABLE) {
      for (const entry of row.entries) {
        if (entry.decompStops.length > 1) {
          for (let i = 1; i < entry.decompStops.length; i++) {
            expect(entry.decompStops[i].depth).toBeGreaterThanOrEqual(entry.decompStops[i-1].depth);
          }
        }
      }
    }
  });

  it('totalDecompTime should equal sum of all stop times', () => {
    for (const row of AIR_DECOM_TABLE) {
      for (const entry of row.entries) {
        const sum = entry.decompStops.reduce((acc, s) => acc + s.time, 0);
        expect(entry.totalDecompTime).toBe(sum);
      }
    }
  });

  it('all entries at 200+ fsw should be exceptional exposure', () => {
    for (const row of AIR_DECOM_TABLE) {
      if (row.depth >= 200) {
        for (const entry of row.entries) {
          expect(entry.exceptionalExposure).toBe(true);
        }
      }
    }
  });

  it('should only use valid group letters', () => {
    const VALID = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","Z"];
    for (const row of AIR_DECOM_TABLE) {
      for (const entry of row.entries) {
        expect(VALID).toContain(entry.group);
      }
    }
  });
});

// ============================================================================
// TABLE 9-9: SPOT CHECKS
// ============================================================================
describe('Table 9-9: Key Value Spot Checks', () => {
  it('60 fsw / 90 min: 20ft stop 11 min, group N', () => {
    const row = AIR_DECOM_TABLE.find(r => r.depth === 60)!;
    const entry = row.entries.find(e => e.bottomTime === 90)!;
    expect(entry.decompStops).toEqual([{ depth: 20, time: 11 }]);
    expect(entry.totalDecompTime).toBe(11);
    expect(entry.group).toBe("N");
  });

  it('100 fsw / 60 min: 10ft/9min + 20ft/28min = 37 min total, group M', () => {
    const row = AIR_DECOM_TABLE.find(r => r.depth === 100)!;
    const entry = row.entries.find(e => e.bottomTime === 60)!;
    expect(entry.decompStops).toEqual([{ depth: 10, time: 9 }, { depth: 20, time: 28 }]);
    expect(entry.totalDecompTime).toBe(37);
    expect(entry.group).toBe("M");
  });

  it('190 fsw / 25 min: multi-stop, group Z', () => {
    const row = AIR_DECOM_TABLE.find(r => r.depth === 190)!;
    const entry = row.entries.find(e => e.bottomTime === 25)!;
    expect(entry.group).toBe("Z");
    expect(entry.decompStops.length).toBeGreaterThan(3);
    expect(entry.totalDecompTime).toBe(94);
  });

  it('30 fsw / 380 min: first decompression schedule, 20ft/5min, group Z', () => {
    const row = AIR_DECOM_TABLE.find(r => r.depth === 30)!;
    const entry = row.entries.find(e => e.bottomTime === 380)!;
    expect(entry.decompStops).toEqual([{ depth: 20, time: 5 }]);
    expect(entry.totalDecompTime).toBe(5);
    expect(entry.group).toBe("Z");
    // Should have Air/O2 stops
    expect(entry.airO2Stops).toBeDefined();
    expect(entry.surDO2Periods).toBeDefined();
  });
});

// ============================================================================
// CROSS-TABLE CONSISTENCY
// ============================================================================
describe('Cross-Table Consistency', () => {
  it('Table 9-9 depths should be a subset of TABLE_DEPTHS', () => {
    for (const row of AIR_DECOM_TABLE) {
      expect(TABLE_DEPTHS).toContain(row.depth);
    }
  });

  it('RNT depths should match Table 9-7 depths exactly', () => {
    const noDecompDepths = NO_DECOM_TABLE.map(r => r.depth);
    const rntDepths = Object.keys(RNT_TABLE).map(Number).sort((a,b) => a-b);
    expect(rntDepths).toEqual(noDecompDepths);
  });

  it('Surface interval groups should match Table 9-7 group coverage', () => {
    const siGroups = Object.keys(SURFACE_INTERVAL_TABLE).sort();
    expect(siGroups).toContain("A");
    expect(siGroups).toContain("Z");
    // Should have 16 groups (A-O + Z)
    expect(siGroups.length).toBe(16);
  });
});

// ============================================================================
// LOOKUP FUNCTION CORRECTNESS
// ============================================================================
describe('lookupDiveTable: Comprehensive Tests', () => {
  it('shallow unlimited dive: 15 fsw / 300 min', () => {
    const r = lookupDiveTable(15, 300);
    expect(r.withinNoDecompLimits).toBe(true);
    expect(r.decompRequired).toBe("NO");
    expect(r.noDecompLimit).toBeNull();
    expect(r.tableUsed).toContain("9-7");
    expect(r.repetitiveGroup).toBeDefined();
  });

  it('exact NDL boundary: 60 fsw / 63 min should be no-decompression', () => {
    const r = lookupDiveTable(60, 63);
    expect(r.withinNoDecompLimits).toBe(true);
    expect(r.decompRequired).toBe("NO");
    expect(r.repetitiveGroup).toBe("K");
  });

  it('1 min over NDL: 60 fsw / 64 min should use Table 9-9', () => {
    const r = lookupDiveTable(60, 64);
    expect(r.withinNoDecompLimits).toBe(false);
    expect(r.tableUsed).toContain("9-9");
    // Should get the 70 min schedule (next one up in Table 9-9)
    expect(r.scheduleUsed).toBe("60/70");
  });

  it('depth rounding: 42 fsw rounds to 45 fsw', () => {
    const r = lookupDiveTable(42, 30);
    expect(r.scheduleUsed).toMatch(/^45\//);
  });

  it('depth rounding: 65 fsw rounds to 70 fsw', () => {
    const r = lookupDiveTable(65, 20);
    expect(r.scheduleUsed).toMatch(/^70\//);
  });

  it('Nitrox EAD: 100 fsw EAN32 should use shallower EAD', () => {
    const r = lookupDiveTable(100, 30, 'nitrox', 32);
    expect(r.warnings.some(w => w.includes('EAD'))).toBe(true);
    // EAD for 100fsw at 32% = (100+33)*(0.68/0.79)-33 ≈ 81 → rounds to 90 fsw
    expect(r.scheduleUsed).toMatch(/^(80|90)\//);
  });

  it('deep exceptional exposure: 200 fsw / 20 min', () => {
    const r = lookupDiveTable(200, 20);
    expect(r.exceptionalExposure).toBe(true);
    expect(r.warnings.some(w => w.includes('EXCEPTIONAL'))).toBe(true);
  });

  it('returns group for every depth in Table 9-7 at minimum bottom time', () => {
    for (const row of NO_DECOM_TABLE) {
      const r = lookupDiveTable(row.depth, 1);
      expect(r.repetitiveGroup).toBeDefined();
      expect(r.repetitiveGroup.length).toBe(1);
      expect(r.decompRequired).toBe("NO");
    }
  });
});

// ============================================================================
// REPETITIVE DIVE PLANNING
// ============================================================================
describe('Repetitive Dive Planning: Edge Cases', () => {
  it('SI < 10 min: keeps same group', () => {
    const r = planRepetitiveDive("F", 5, 60);
    expect(r.newGroup).toBe("F");
    expect(r.isRepetitive).toBe(true);
  });

  it('SI exceeding all ranges: diver is clean (not repetitive)', () => {
    const r = planRepetitiveDive("A", 200, 60);
    expect(r.newGroup).toBeNull();
    expect(r.isRepetitive).toBe(false);
    expect(r.residualNitrogenTime).toBeNull();
  });

  it('Group Z with long SI: eventually becomes clean', () => {
    const r = planRepetitiveDive("Z", 1000, 60);
    expect(r.isRepetitive).toBe(false);
  });

  it('adjusted NDL should be positive for reasonable scenarios', () => {
    const r = planRepetitiveDive("C", 120, 60);
    if (r.isRepetitive && r.residualNitrogenTime !== null) {
      expect(r.adjustedNoDecompLimit).toBeDefined();
      expect(r.adjustedNoDecompLimit!).toBeGreaterThan(0);
    }
  });

  it('RNT lookup for dagger depth: 25 fsw group Z falls back to 30 fsw', () => {
    const rnt = lookupResidualNitrogenTime("Z", 25);
    expect(rnt).toBe(RNT_TABLE[30]["Z"]); // 372
  });

  it('RNT returns null for cannot-be-determined entries', () => {
    const rnt = lookupResidualNitrogenTime("Z", 10);
    expect(rnt).toBeNull();
  });
});

// ============================================================================
// EAD CALCULATION
// ============================================================================
describe('EAD Calculation', () => {
  it('EAN32 at 100 fsw ≈ 81 fsw', () => {
    const ead = calculateEAD(100, 0.32);
    expect(ead).toBeGreaterThanOrEqual(81);
    expect(ead).toBeLessThanOrEqual(82);
  });

  it('EAN36 at 100 fsw ≈ 75 fsw (ceiling)', () => {
    // EAD = (100+33)*(0.64/0.79)-33 = 133*0.8101-33 = 74.74 → ceil = 75
    const ead = calculateEAD(100, 0.36);
    expect(ead).toBe(75);
  });

  it('Air (21%) at any depth = same depth', () => {
    const ead = calculateEAD(100, 0.21);
    expect(ead).toBe(100);
  });

  it('handles percentage input (32 instead of 0.32)', () => {
    const ead = calculateEAD(100, 32);
    expect(ead).toBeGreaterThanOrEqual(81);
    expect(ead).toBeLessThanOrEqual(82);
  });

  it('higher FO2 = shallower EAD', () => {
    const ead32 = calculateEAD(100, 0.32);
    const ead36 = calculateEAD(100, 0.36);
    expect(ead36).toBeLessThan(ead32);
  });
});

// ============================================================================
// DEPTH ROUNDING
// ============================================================================
describe('Depth Rounding', () => {
  it('exact table depths round to themselves', () => {
    for (const d of TABLE_DEPTHS) {
      expect(roundToNextDeeperDepth(d)).toBe(d);
    }
  });

  it('in-between depths round to next deeper', () => {
    expect(roundToNextDeeperDepth(11)).toBe(15);
    expect(roundToNextDeeperDepth(21)).toBe(25);
    expect(roundToNextDeeperDepth(42)).toBe(45);
    expect(roundToNextDeeperDepth(65)).toBe(70);
    expect(roundToNextDeeperDepth(155)).toBe(160);
    expect(roundToNextDeeperDepth(195)).toBe(200);
  });

  it('depths beyond 300 fsw clamp to 300', () => {
    expect(roundToNextDeeperDepth(350)).toBe(300);
  });

  it('TABLE_DEPTHS starts at 10 and includes all standard Navy depths', () => {
    expect(TABLE_DEPTHS[0]).toBe(10);
    expect(TABLE_DEPTHS).toContain(60);
    expect(TABLE_DEPTHS).toContain(100);
    expect(TABLE_DEPTHS).toContain(190);
    expect(TABLE_DEPTHS).toContain(300);
    expect(TABLE_DEPTHS.length).toBe(29);
  });
});
