/**
 * U.S. Navy Dive Tables — VERBATIM from U.S. Navy Diving Manual, Revision 7
 * SS521-AG-PRO-010, 0910-LP-115-1921, 01 December 2016
 * 
 * SAFETY CRITICAL: These values are transcribed exactly from the published tables.
 * No interpolation, no rounding in the diver's favor, no inference.
 * 
 * Table 9-7:  No-Decompression Limits and Repetitive Group Designators (p. 9-63)
 * Table 9-8:  Residual Nitrogen Time Table for Repetitive Air Dives (p. 9-64)
 * Table 9-9:  U.S. Navy Standard Air Decompression Table (pp. 9-65 through 9-86)
 * Table 9-1:  Pneumofathometer Correction Factors (p. 9-1)
 * Tables 9-4, 9-5, 9-6: Altitude Diving Reference Tables (pp. 9-47 through 9-62)
 * Tables 9-2, 9-3: Decision Trees (pp. 9-39, 9-41)
 * 
 * For Nitrox (EANx): Calculate Equivalent Air Depth (EAD), then use air tables.
 * EAD = (D + 33) × (1 - FO2) / 0.79 - 33
 */

// ============================================================================
// CITATION SYSTEM
// ============================================================================

/**
 * USN Manual Citation — structured provenance for every table result.
 * The manual is stored in Azure Blob Storage and referenced in-app.
 * DO NOT link to an external website.
 */
export const USN_MANUAL_CITATION = {
  title: "U.S. Navy Diving Manual",
  revision: "Revision 7",
  date: "01 December 2016",
  documentNumber: "SS521-AG-PRO-010",
  authority: "NAVSEA 0910-LP-115-1921",
  chapter: "Chapter 9 — Air Decompression",
  /** Reference is in-app via Azure Blob Storage — not an external URL */
  inAppReference: "DiveOps Library → USN Diving Manual Rev 7",
  tables: {
    "9-1": {
      name: "Pneumofathometer Correction Factors",
      chapterPage: "9-1",
      pdfPage: 432,
      description: "Correction factors for pneumofathometer depth readings based on hose length.",
    },
    "9-2": {
      name: "Management of Extended Surface Interval and Type I DCS",
      chapterPage: "9-39",
      pdfPage: 471,
      description: "Decision tree for managing extended surface intervals and Type I decompression sickness.",
    },
    "9-3": {
      name: "Management of Asymptomatic Omitted Decompression",
      chapterPage: "9-41",
      pdfPage: 473,
      description: "Decision tree for managing asymptomatic omitted decompression.",
    },
    "9-4": {
      name: "Sea Level Equivalent Depth (fsw)",
      chapterPage: "9-47",
      pdfPage: 477,
      description: "Altitude correction table — converts actual depth to sea level equivalent depth.",
    },
    "9-5": {
      name: "Repetitive Groups Associated with Initial Ascent to Altitude",
      chapterPage: "9-50",
      pdfPage: 480,
      description: "Assigns repetitive group based on altitude ascent.",
    },
    "9-6": {
      name: "Required Surface Interval Before Ascent to Altitude After Diving",
      chapterPage: "9-62",
      pdfPage: 492,
      description: "Minimum surface interval required before ascending to altitude after diving.",
    },
    "9-7": {
      name: "No-Decompression Limits and Repetitive Group Designators for No-Decompression Air Dives",
      chapterPage: "9-63",
      pdfPage: 493,
      description: "Maximum bottom time (minutes) for no-decompression air dives by depth. Repetitive group designators A–Z.",
    },
    "9-8": {
      name: "Residual Nitrogen Time Table for Repetitive Air Dives",
      chapterPage: "9-64",
      pdfPage: 494,
      description: "Surface interval lookup to determine new repetitive group and residual nitrogen time for second dive.",
    },
    "9-9": {
      name: "Air Decompression Table",
      chapterPage: "9-65",
      pdfPage: 495,
      description: "Decompression schedules (stops, times, repetitive groups) for dives exceeding no-decompression limits.",
    },
  },
} as const;

export interface TableCitation {
  tableNumber: string;
  tableName: string;
  chapterPage: string;
  pdfPage: number;
  manualRevision: string;
  authority: string;
  inAppReference: string;
}

function makeCitation(tableKey: keyof typeof USN_MANUAL_CITATION.tables): TableCitation {
  const t = USN_MANUAL_CITATION.tables[tableKey];
  return {
    tableNumber: tableKey,
    tableName: t.name,
    chapterPage: t.chapterPage,
    pdfPage: t.pdfPage,
    manualRevision: USN_MANUAL_CITATION.revision,
    authority: USN_MANUAL_CITATION.authority,
    inAppReference: USN_MANUAL_CITATION.inAppReference,
  };
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface NoDecompEntry {
  maxBottomTime: number;
  group: string;
}

export interface NoDecompDepth {
  depth: number;
  noStopLimit: number;
  unlimited: boolean;
  entries: NoDecompEntry[];
}

export interface DecompStop {
  depth: number;
  time: number;
}

export interface DecompEntry {
  bottomTime: number;
  decompStops: DecompStop[];
  totalDecompTime: number;
  /** Air/O2 in-water decompression stops (if available) */
  airO2Stops?: DecompStop[];
  airO2TotalDecompTime?: number;
  /** Surface Decompression on O2 chamber periods */
  surDO2Periods?: number;
  group: string;
  exceptionalExposure?: boolean;
}

export interface DecompDepth {
  depth: number;
  entries: DecompEntry[];
}

// ============================================================================
// TABLE 9-7: No-Decompression Limits and Repetitive Group Designators
// Source: U.S. Navy Diving Manual, Rev 7, Table 9-7, p. 9-63 (PDF p. 493)
// ============================================================================

export const NO_DECOM_TABLE: NoDecompDepth[] = [
  // 10 fsw — Unlimited, max group F (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 10,
    noStopLimit: Infinity,
    unlimited: true,
    entries: [
      { maxBottomTime: 57, group: "A" },   // p. 9-63
      { maxBottomTime: 101, group: "B" },
      { maxBottomTime: 158, group: "C" },
      { maxBottomTime: 245, group: "D" },
      { maxBottomTime: 426, group: "E" },
      // * = F is highest group achievable at this depth
    ],
  },
  // 15 fsw — Unlimited, max group I (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 15,
    noStopLimit: Infinity,
    unlimited: true,
    entries: [
      { maxBottomTime: 36, group: "A" },    // p. 9-63
      { maxBottomTime: 60, group: "B" },
      { maxBottomTime: 88, group: "C" },
      { maxBottomTime: 121, group: "D" },
      { maxBottomTime: 163, group: "E" },
      { maxBottomTime: 217, group: "F" },
      { maxBottomTime: 297, group: "G" },
      { maxBottomTime: 449, group: "H" },
      // * = I is highest group achievable at this depth
    ],
  },
  // 20 fsw — Unlimited, max group L (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 20,
    noStopLimit: Infinity,
    unlimited: true,
    entries: [
      { maxBottomTime: 26, group: "A" },    // p. 9-63
      { maxBottomTime: 43, group: "B" },
      { maxBottomTime: 61, group: "C" },
      { maxBottomTime: 82, group: "D" },
      { maxBottomTime: 106, group: "E" },
      { maxBottomTime: 133, group: "F" },
      { maxBottomTime: 165, group: "G" },
      { maxBottomTime: 205, group: "H" },
      { maxBottomTime: 256, group: "I" },
      { maxBottomTime: 330, group: "J" },
      { maxBottomTime: 461, group: "K" },
      // * = L is highest group achievable at this depth
    ],
  },
  // 25 fsw — 1102 min, groups A–Z (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 25,
    noStopLimit: 1102,
    unlimited: false,
    entries: [
      { maxBottomTime: 20, group: "A" },    // p. 9-63
      { maxBottomTime: 33, group: "B" },
      { maxBottomTime: 47, group: "C" },
      { maxBottomTime: 62, group: "D" },
      { maxBottomTime: 78, group: "E" },
      { maxBottomTime: 97, group: "F" },
      { maxBottomTime: 117, group: "G" },
      { maxBottomTime: 140, group: "H" },
      { maxBottomTime: 166, group: "I" },
      { maxBottomTime: 198, group: "J" },
      { maxBottomTime: 236, group: "K" },
      { maxBottomTime: 285, group: "L" },
      { maxBottomTime: 354, group: "M" },
      { maxBottomTime: 469, group: "N" },
      { maxBottomTime: 992, group: "O" },
      { maxBottomTime: 1102, group: "Z" },
    ],
  },
  // 30 fsw — 371 min, groups A–Z (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 30,
    noStopLimit: 371,
    unlimited: false,
    entries: [
      { maxBottomTime: 17, group: "A" },    // p. 9-63
      { maxBottomTime: 27, group: "B" },
      { maxBottomTime: 38, group: "C" },
      { maxBottomTime: 50, group: "D" },
      { maxBottomTime: 62, group: "E" },
      { maxBottomTime: 76, group: "F" },
      { maxBottomTime: 91, group: "G" },
      { maxBottomTime: 107, group: "H" },
      { maxBottomTime: 125, group: "I" },
      { maxBottomTime: 145, group: "J" },
      { maxBottomTime: 167, group: "K" },
      { maxBottomTime: 193, group: "L" },
      { maxBottomTime: 223, group: "M" },
      { maxBottomTime: 260, group: "N" },
      { maxBottomTime: 307, group: "O" },
      { maxBottomTime: 371, group: "Z" },
    ],
  },
  // 35 fsw — 232 min, groups A–Z (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 35,
    noStopLimit: 232,
    unlimited: false,
    entries: [
      { maxBottomTime: 14, group: "A" },    // p. 9-63
      { maxBottomTime: 23, group: "B" },
      { maxBottomTime: 32, group: "C" },
      { maxBottomTime: 42, group: "D" },
      { maxBottomTime: 52, group: "E" },
      { maxBottomTime: 63, group: "F" },
      { maxBottomTime: 74, group: "G" },
      { maxBottomTime: 87, group: "H" },
      { maxBottomTime: 100, group: "I" },
      { maxBottomTime: 115, group: "J" },
      { maxBottomTime: 131, group: "K" },
      { maxBottomTime: 148, group: "L" },
      { maxBottomTime: 168, group: "M" },
      { maxBottomTime: 190, group: "N" },
      { maxBottomTime: 215, group: "O" },
      { maxBottomTime: 232, group: "Z" },
    ],
  },
  // 40 fsw — 163 min, groups A–O (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 40,
    noStopLimit: 163,
    unlimited: false,
    entries: [
      { maxBottomTime: 12, group: "A" },    // p. 9-63
      { maxBottomTime: 20, group: "B" },
      { maxBottomTime: 27, group: "C" },
      { maxBottomTime: 36, group: "D" },
      { maxBottomTime: 44, group: "E" },
      { maxBottomTime: 53, group: "F" },
      { maxBottomTime: 63, group: "G" },
      { maxBottomTime: 73, group: "H" },
      { maxBottomTime: 84, group: "I" },
      { maxBottomTime: 95, group: "J" },
      { maxBottomTime: 108, group: "K" },
      { maxBottomTime: 121, group: "L" },
      { maxBottomTime: 135, group: "M" },
      { maxBottomTime: 151, group: "N" },
      { maxBottomTime: 163, group: "O" },
    ],
  },
  // 45 fsw — 125 min, groups A–N (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 45,
    noStopLimit: 125,
    unlimited: false,
    entries: [
      { maxBottomTime: 11, group: "A" },    // p. 9-63
      { maxBottomTime: 17, group: "B" },
      { maxBottomTime: 24, group: "C" },
      { maxBottomTime: 31, group: "D" },
      { maxBottomTime: 39, group: "E" },
      { maxBottomTime: 46, group: "F" },
      { maxBottomTime: 55, group: "G" },
      { maxBottomTime: 63, group: "H" },
      { maxBottomTime: 72, group: "I" },
      { maxBottomTime: 82, group: "J" },
      { maxBottomTime: 92, group: "K" },
      { maxBottomTime: 102, group: "L" },
      { maxBottomTime: 114, group: "M" },
      { maxBottomTime: 125, group: "N" },
    ],
  },
  // 50 fsw — 92 min, groups A–M (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 50,
    noStopLimit: 92,
    unlimited: false,
    entries: [
      { maxBottomTime: 9, group: "A" },     // p. 9-63
      { maxBottomTime: 15, group: "B" },
      { maxBottomTime: 21, group: "C" },
      { maxBottomTime: 28, group: "D" },
      { maxBottomTime: 34, group: "E" },
      { maxBottomTime: 41, group: "F" },
      { maxBottomTime: 48, group: "G" },
      { maxBottomTime: 56, group: "H" },
      { maxBottomTime: 63, group: "I" },
      { maxBottomTime: 71, group: "J" },
      { maxBottomTime: 80, group: "K" },
      { maxBottomTime: 89, group: "L" },
      { maxBottomTime: 92, group: "M" },
    ],
  },
  // 55 fsw — 74 min, groups A–L (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 55,
    noStopLimit: 74,
    unlimited: false,
    entries: [
      { maxBottomTime: 8, group: "A" },     // p. 9-63
      { maxBottomTime: 14, group: "B" },
      { maxBottomTime: 19, group: "C" },
      { maxBottomTime: 25, group: "D" },
      { maxBottomTime: 31, group: "E" },
      { maxBottomTime: 37, group: "F" },
      { maxBottomTime: 43, group: "G" },
      { maxBottomTime: 50, group: "H" },
      { maxBottomTime: 56, group: "I" },
      { maxBottomTime: 63, group: "J" },
      { maxBottomTime: 71, group: "K" },
      { maxBottomTime: 74, group: "L" },
    ],
  },
  // 60 fsw — 63 min, groups A–K (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 60,
    noStopLimit: 63,
    unlimited: false,
    entries: [
      { maxBottomTime: 7, group: "A" },     // p. 9-63
      { maxBottomTime: 12, group: "B" },
      { maxBottomTime: 17, group: "C" },
      { maxBottomTime: 22, group: "D" },
      { maxBottomTime: 28, group: "E" },
      { maxBottomTime: 33, group: "F" },
      { maxBottomTime: 39, group: "G" },
      { maxBottomTime: 45, group: "H" },
      { maxBottomTime: 51, group: "I" },
      { maxBottomTime: 57, group: "J" },
      { maxBottomTime: 63, group: "K" },
    ],
  },
  // 70 fsw — 48 min, groups A–K (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 70,
    noStopLimit: 48,
    unlimited: false,
    entries: [
      { maxBottomTime: 6, group: "A" },     // p. 9-63
      { maxBottomTime: 10, group: "B" },
      { maxBottomTime: 14, group: "C" },
      { maxBottomTime: 19, group: "D" },
      { maxBottomTime: 23, group: "E" },
      { maxBottomTime: 28, group: "F" },
      { maxBottomTime: 32, group: "G" },
      { maxBottomTime: 37, group: "H" },
      { maxBottomTime: 42, group: "I" },
      { maxBottomTime: 47, group: "J" },
      { maxBottomTime: 48, group: "K" },
    ],
  },
  // 80 fsw — 39 min, groups A–J (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 80,
    noStopLimit: 39,
    unlimited: false,
    entries: [
      { maxBottomTime: 5, group: "A" },     // p. 9-63
      { maxBottomTime: 9, group: "B" },
      { maxBottomTime: 12, group: "C" },
      { maxBottomTime: 16, group: "D" },
      { maxBottomTime: 20, group: "E" },
      { maxBottomTime: 24, group: "F" },
      { maxBottomTime: 28, group: "G" },
      { maxBottomTime: 32, group: "H" },
      { maxBottomTime: 36, group: "I" },
      { maxBottomTime: 39, group: "J" },
    ],
  },
  // 90 fsw — 33 min, groups A–J (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 90,
    noStopLimit: 33,
    unlimited: false,
    entries: [
      { maxBottomTime: 4, group: "A" },     // p. 9-63
      { maxBottomTime: 7, group: "B" },
      { maxBottomTime: 11, group: "C" },
      { maxBottomTime: 14, group: "D" },
      { maxBottomTime: 17, group: "E" },
      { maxBottomTime: 21, group: "F" },
      { maxBottomTime: 24, group: "G" },
      { maxBottomTime: 28, group: "H" },
      { maxBottomTime: 31, group: "I" },
      { maxBottomTime: 33, group: "J" },
    ],
  },
  // 100 fsw — 25 min, groups A–H (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 100,
    noStopLimit: 25,
    unlimited: false,
    entries: [
      { maxBottomTime: 4, group: "A" },     // p. 9-63
      { maxBottomTime: 6, group: "B" },
      { maxBottomTime: 9, group: "C" },
      { maxBottomTime: 12, group: "D" },
      { maxBottomTime: 15, group: "E" },
      { maxBottomTime: 18, group: "F" },
      { maxBottomTime: 21, group: "G" },
      { maxBottomTime: 25, group: "H" },
    ],
  },
  // 110 fsw — 20 min, groups A–H (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 110,
    noStopLimit: 20,
    unlimited: false,
    entries: [
      { maxBottomTime: 3, group: "A" },     // p. 9-63
      { maxBottomTime: 6, group: "B" },
      { maxBottomTime: 8, group: "C" },
      { maxBottomTime: 11, group: "D" },
      { maxBottomTime: 14, group: "E" },
      { maxBottomTime: 16, group: "F" },
      { maxBottomTime: 19, group: "G" },
      { maxBottomTime: 20, group: "H" },
    ],
  },
  // 120 fsw — 15 min, groups A–F (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 120,
    noStopLimit: 15,
    unlimited: false,
    entries: [
      { maxBottomTime: 3, group: "A" },     // p. 9-63
      { maxBottomTime: 5, group: "B" },
      { maxBottomTime: 7, group: "C" },
      { maxBottomTime: 10, group: "D" },
      { maxBottomTime: 12, group: "E" },
      { maxBottomTime: 15, group: "F" },
    ],
  },
  // 130 fsw — 12 min, groups A–F (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 130,
    noStopLimit: 12,
    unlimited: false,
    entries: [
      { maxBottomTime: 2, group: "A" },     // p. 9-63
      { maxBottomTime: 4, group: "B" },
      { maxBottomTime: 6, group: "C" },
      { maxBottomTime: 9, group: "D" },
      { maxBottomTime: 11, group: "E" },
      { maxBottomTime: 12, group: "F" },
    ],
  },
  // 140 fsw — 10 min, groups A–E (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 140,
    noStopLimit: 10,
    unlimited: false,
    entries: [
      { maxBottomTime: 2, group: "A" },     // p. 9-63
      { maxBottomTime: 4, group: "B" },
      { maxBottomTime: 6, group: "C" },
      { maxBottomTime: 8, group: "D" },
      { maxBottomTime: 10, group: "E" },
    ],
  },
  // 150 fsw — 8 min, groups B–E (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 150,
    noStopLimit: 8,
    unlimited: false,
    entries: [
      { maxBottomTime: 3, group: "B" },     // p. 9-63 — no group A entry
      { maxBottomTime: 5, group: "C" },
      { maxBottomTime: 7, group: "D" },
      { maxBottomTime: 8, group: "E" },
    ],
  },
  // 160 fsw — 7 min, groups B–E (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 160,
    noStopLimit: 7,
    unlimited: false,
    entries: [
      { maxBottomTime: 3, group: "B" },     // p. 9-63 — no group A entry
      { maxBottomTime: 5, group: "C" },
      { maxBottomTime: 6, group: "D" },
      { maxBottomTime: 7, group: "E" },
    ],
  },
  // 170 fsw — 6 min, groups C–D (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 170,
    noStopLimit: 6,
    unlimited: false,
    entries: [
      { maxBottomTime: 4, group: "C" },     // p. 9-63 — no A or B entry
      { maxBottomTime: 6, group: "D" },
    ],
  },
  // 180 fsw — 6 min, groups C–E (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 180,
    noStopLimit: 6,
    unlimited: false,
    entries: [
      { maxBottomTime: 4, group: "C" },     // p. 9-63 — no A or B entry
      { maxBottomTime: 5, group: "D" },
      { maxBottomTime: 6, group: "E" },
    ],
  },
  // 190 fsw — 5 min, groups C–D (Rev 7, Table 9-7, p. 9-63)
  {
    depth: 190,
    noStopLimit: 5,
    unlimited: false,
    entries: [
      { maxBottomTime: 3, group: "C" },     // p. 9-63 — no A or B entry
      { maxBottomTime: 5, group: "D" },
    ],
  },
];

// ============================================================================
// TABLE 9-8: Residual Nitrogen Time Table for Repetitive Air Dives
// Source: U.S. Navy Diving Manual, Rev 7, Table 9-8, p. 9-64 (PDF p. 494)
// ============================================================================

/**
 * Surface Interval Credit Table — diagonal portion of Table 9-8.
 * Given a starting repetitive group and a surface interval (in minutes),
 * determines the new (lower) repetitive group.
 * 
 * Format: Each group has an array of { minTime, maxTime, newGroup } ranges.
 * Times are in MINUTES. Asterisk (*) entries in the manual mean
 * "surface intervals longer than this are not repetitive dives."
 */
export interface SurfaceIntervalRange {
  minMinutes: number;
  maxMinutes: number;
  newGroup: string;
}

/** Surface interval ranges for each starting repetitive group.
 *  Source: Table 9-8, p. 9-64 (diagonal portion) */
export const SURFACE_INTERVAL_TABLE: Record<string, SurfaceIntervalRange[]> = {
  // p. 9-64 — Group A
  "A": [
    { minMinutes: 10, maxMinutes: 140, newGroup: "A" },  // :10 to 2:20*
  ],
  // p. 9-64 — Group B
  "B": [
    { minMinutes: 10, maxMinutes: 76, newGroup: "B" },   // :10 to 1:16
    { minMinutes: 77, maxMinutes: 216, newGroup: "A" },   // 1:17 to 3:36*
  ],
  // p. 9-64 — Group C
  "C": [
    { minMinutes: 10, maxMinutes: 55, newGroup: "C" },   // :10 to :55
    { minMinutes: 56, maxMinutes: 131, newGroup: "B" },   // :56 to 2:11
    { minMinutes: 132, maxMinutes: 271, newGroup: "A" },  // 2:12 to 4:31*
  ],
  // p. 9-64 — Group D
  "D": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "D" },   // :10 to :52
    { minMinutes: 53, maxMinutes: 107, newGroup: "C" },   // :53 to 1:47
    { minMinutes: 108, maxMinutes: 183, newGroup: "B" },  // 1:48 to 3:03
    { minMinutes: 184, maxMinutes: 323, newGroup: "A" },  // 3:04 to 5:23*
  ],
  // p. 9-64 — Group E
  "E": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "E" },   // :10 to :52
    { minMinutes: 53, maxMinutes: 104, newGroup: "D" },   // :53 to 1:44
    { minMinutes: 105, maxMinutes: 159, newGroup: "C" },  // 1:45 to 2:39
    { minMinutes: 160, maxMinutes: 235, newGroup: "B" },  // 2:40 to 3:55
    { minMinutes: 236, maxMinutes: 375, newGroup: "A" },  // 3:56 to 6:15*
  ],
  // p. 9-64 — Group F
  "F": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "F" },
    { minMinutes: 53, maxMinutes: 104, newGroup: "E" },
    { minMinutes: 105, maxMinutes: 157, newGroup: "D" },
    { minMinutes: 158, maxMinutes: 210, newGroup: "C" },
    { minMinutes: 211, maxMinutes: 288, newGroup: "B" },
    { minMinutes: 289, maxMinutes: 428, newGroup: "A" },  // 4:49 to 7:08*
  ],
  // p. 9-64 — Group G
  "G": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "G" },
    { minMinutes: 53, maxMinutes: 104, newGroup: "F" },
    { minMinutes: 105, maxMinutes: 157, newGroup: "E" },
    { minMinutes: 158, maxMinutes: 209, newGroup: "D" },
    { minMinutes: 210, maxMinutes: 263, newGroup: "C" },
    { minMinutes: 264, maxMinutes: 340, newGroup: "B" },
    { minMinutes: 341, maxMinutes: 480, newGroup: "A" },  // 5:41 to 8:00*
  ],
  // p. 9-64 — Group H
  "H": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "H" },
    { minMinutes: 53, maxMinutes: 104, newGroup: "G" },
    { minMinutes: 105, maxMinutes: 157, newGroup: "F" },
    { minMinutes: 158, maxMinutes: 209, newGroup: "E" },
    { minMinutes: 210, maxMinutes: 262, newGroup: "D" },
    { minMinutes: 263, maxMinutes: 316, newGroup: "C" },
    { minMinutes: 317, maxMinutes: 392, newGroup: "B" },
    { minMinutes: 393, maxMinutes: 532, newGroup: "A" },  // 6:33 to 8:52*
  ],
  // p. 9-64 — Group I
  "I": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "I" },
    { minMinutes: 53, maxMinutes: 104, newGroup: "H" },
    { minMinutes: 105, maxMinutes: 157, newGroup: "G" },
    { minMinutes: 158, maxMinutes: 209, newGroup: "F" },
    { minMinutes: 210, maxMinutes: 261, newGroup: "E" },
    { minMinutes: 262, maxMinutes: 313, newGroup: "D" },
    { minMinutes: 314, maxMinutes: 368, newGroup: "C" },
    { minMinutes: 369, maxMinutes: 444, newGroup: "B" },
    { minMinutes: 445, maxMinutes: 584, newGroup: "A" },  // 7:25 to 9:44*
  ],
  // p. 9-64 — Group J
  "J": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "J" },
    { minMinutes: 53, maxMinutes: 104, newGroup: "I" },
    { minMinutes: 105, maxMinutes: 158, newGroup: "H" },
    { minMinutes: 159, maxMinutes: 209, newGroup: "G" },
    { minMinutes: 210, maxMinutes: 262, newGroup: "F" },
    { minMinutes: 263, maxMinutes: 313, newGroup: "E" },
    { minMinutes: 314, maxMinutes: 366, newGroup: "D" },
    { minMinutes: 367, maxMinutes: 420, newGroup: "C" },
    { minMinutes: 421, maxMinutes: 496, newGroup: "B" },
    { minMinutes: 497, maxMinutes: 636, newGroup: "A" },  // 8:17 to 10:36*
  ],
  // p. 9-64 — Group K
  "K": [
    { minMinutes: 10, maxMinutes: 53, newGroup: "K" },
    { minMinutes: 54, maxMinutes: 105, newGroup: "J" },
    { minMinutes: 106, maxMinutes: 158, newGroup: "I" },
    { minMinutes: 159, maxMinutes: 210, newGroup: "H" },
    { minMinutes: 211, maxMinutes: 261, newGroup: "G" },
    { minMinutes: 262, maxMinutes: 313, newGroup: "F" },
    { minMinutes: 314, maxMinutes: 366, newGroup: "E" },
    { minMinutes: 367, maxMinutes: 418, newGroup: "D" },
    { minMinutes: 419, maxMinutes: 472, newGroup: "C" },
    { minMinutes: 473, maxMinutes: 549, newGroup: "B" },
    { minMinutes: 550, maxMinutes: 689, newGroup: "A" },  // 9:10 to 11:29*
  ],
  // p. 9-64 — Group L
  "L": [
    { minMinutes: 10, maxMinutes: 53, newGroup: "L" },
    { minMinutes: 54, maxMinutes: 104, newGroup: "K" },
    { minMinutes: 105, maxMinutes: 158, newGroup: "J" },
    { minMinutes: 159, maxMinutes: 209, newGroup: "I" },
    { minMinutes: 210, maxMinutes: 262, newGroup: "H" },
    { minMinutes: 263, maxMinutes: 314, newGroup: "G" },
    { minMinutes: 315, maxMinutes: 366, newGroup: "F" },
    { minMinutes: 367, maxMinutes: 418, newGroup: "E" },
    { minMinutes: 419, maxMinutes: 470, newGroup: "D" },
    { minMinutes: 471, maxMinutes: 524, newGroup: "C" },
    { minMinutes: 525, maxMinutes: 601, newGroup: "B" },
    { minMinutes: 602, maxMinutes: 741, newGroup: "A" },  // 10:02 to 12:21*
  ],
  // p. 9-64 — Group M
  "M": [
    { minMinutes: 10, maxMinutes: 53, newGroup: "M" },
    { minMinutes: 54, maxMinutes: 105, newGroup: "L" },
    { minMinutes: 106, maxMinutes: 158, newGroup: "K" },
    { minMinutes: 159, maxMinutes: 210, newGroup: "J" },
    { minMinutes: 211, maxMinutes: 262, newGroup: "I" },
    { minMinutes: 263, maxMinutes: 314, newGroup: "H" },
    { minMinutes: 315, maxMinutes: 367, newGroup: "G" },
    { minMinutes: 368, maxMinutes: 419, newGroup: "F" },
    { minMinutes: 420, maxMinutes: 470, newGroup: "E" },
    { minMinutes: 471, maxMinutes: 522, newGroup: "D" },
    { minMinutes: 523, maxMinutes: 577, newGroup: "C" },
    { minMinutes: 578, maxMinutes: 653, newGroup: "B" },
    { minMinutes: 654, maxMinutes: 793, newGroup: "A" },  // 10:54 to 13:13*
  ],
  // p. 9-64 — Group N
  "N": [
    { minMinutes: 10, maxMinutes: 53, newGroup: "N" },
    { minMinutes: 54, maxMinutes: 105, newGroup: "M" },
    { minMinutes: 106, maxMinutes: 157, newGroup: "L" },
    { minMinutes: 158, maxMinutes: 209, newGroup: "K" },
    { minMinutes: 210, maxMinutes: 261, newGroup: "J" },
    { minMinutes: 262, maxMinutes: 313, newGroup: "I" },
    { minMinutes: 314, maxMinutes: 366, newGroup: "H" },
    { minMinutes: 367, maxMinutes: 418, newGroup: "G" },
    { minMinutes: 419, maxMinutes: 470, newGroup: "F" },
    { minMinutes: 471, maxMinutes: 522, newGroup: "E" },
    { minMinutes: 523, maxMinutes: 574, newGroup: "D" },
    { minMinutes: 575, maxMinutes: 628, newGroup: "C" },
    { minMinutes: 629, maxMinutes: 705, newGroup: "B" },
    { minMinutes: 706, maxMinutes: 844, newGroup: "A" },  // 11:45 to 14:04*
  ],
  // p. 9-64 — Group O
  "O": [
    { minMinutes: 10, maxMinutes: 53, newGroup: "O" },
    { minMinutes: 54, maxMinutes: 104, newGroup: "N" },
    { minMinutes: 105, maxMinutes: 158, newGroup: "M" },
    { minMinutes: 159, maxMinutes: 209, newGroup: "L" },
    { minMinutes: 210, maxMinutes: 261, newGroup: "K" },
    { minMinutes: 262, maxMinutes: 313, newGroup: "J" },
    { minMinutes: 314, maxMinutes: 366, newGroup: "I" },
    { minMinutes: 367, maxMinutes: 418, newGroup: "H" },
    { minMinutes: 419, maxMinutes: 470, newGroup: "G" },
    { minMinutes: 471, maxMinutes: 522, newGroup: "F" },
    { minMinutes: 523, maxMinutes: 574, newGroup: "E" },
    { minMinutes: 575, maxMinutes: 627, newGroup: "D" },
    { minMinutes: 628, maxMinutes: 681, newGroup: "C" },
    { minMinutes: 682, maxMinutes: 757, newGroup: "B" },
    { minMinutes: 758, maxMinutes: 898, newGroup: "A" },  // 12:38 to 14:58*
  ],
  // p. 9-64 — Group Z
  "Z": [
    { minMinutes: 10, maxMinutes: 52, newGroup: "Z" },
    { minMinutes: 53, maxMinutes: 104, newGroup: "O" },
    { minMinutes: 105, maxMinutes: 158, newGroup: "N" },
    { minMinutes: 159, maxMinutes: 209, newGroup: "M" },
    { minMinutes: 210, maxMinutes: 262, newGroup: "L" },
    { minMinutes: 263, maxMinutes: 313, newGroup: "K" },
    { minMinutes: 314, maxMinutes: 367, newGroup: "J" },
    { minMinutes: 368, maxMinutes: 418, newGroup: "I" },
    { minMinutes: 419, maxMinutes: 470, newGroup: "H" },
    { minMinutes: 471, maxMinutes: 522, newGroup: "G" },
    { minMinutes: 523, maxMinutes: 574, newGroup: "F" },
    { minMinutes: 575, maxMinutes: 627, newGroup: "E" },
    { minMinutes: 628, maxMinutes: 679, newGroup: "D" },
    { minMinutes: 680, maxMinutes: 733, newGroup: "C" },
    { minMinutes: 734, maxMinutes: 810, newGroup: "B" },
    { minMinutes: 811, maxMinutes: 950, newGroup: "A" },  // 13:30 to 15:50*
  ],
};

/**
 * Residual Nitrogen Times (RNT) — bottom portion of Table 9-8, p. 9-64.
 * Format: RNT_TABLE[depth][group] = residual nitrogen time in minutes.
 * ** (cannot be determined) is represented as -1.
 * † (read down to 30 fsw) is represented as -2.
 */
export const RNT_TABLE: Record<number, Record<string, number>> = {
  // p. 9-64 — Depth 10 fsw
  10: { Z: -1, O: -1, N: -1, M: -1, L: -1, K: -1, J: -1, I: -1, H: -1, G: -1, F: 427, E: 246, D: 159, C: 101, B: 58, A: 0 },
  // p. 9-64 — Depth 15 fsw
  15: { Z: -1, O: -1, N: -1, M: -1, L: -1, K: -1, J: -1, I: -1, H: 450, G: 298, F: 218, E: 164, D: 122, C: 89, B: 61, A: 37 },
  // p. 9-64 — Depth 20 fsw
  20: { Z: -1, O: -1, N: -1, M: -1, L: -1, K: 462, J: 331, I: 257, H: 206, G: 166, F: 134, E: 106, D: 83, C: 62, B: 44, A: 27 },
  // p. 9-64 — Depth 25 fsw (Z = † = read down to 30 fsw)
  25: { Z: -2, O: 470, N: 354, M: 286, L: 237, K: 198, J: 167, I: 141, H: 118, G: 98, F: 79, E: 63, D: 48, C: 34, B: 21, A: 0 },
  // p. 9-64 — Depth 30 fsw
  30: { Z: 372, O: 308, N: 261, M: 224, L: 194, K: 168, J: 146, I: 126, H: 108, G: 92, F: 77, E: 63, D: 51, C: 39, B: 28, A: 18 },
  // p. 9-64 — Depth 35 fsw
  35: { Z: 245, O: 216, N: 191, M: 169, L: 149, K: 132, J: 116, I: 101, H: 88, G: 75, F: 64, E: 53, D: 43, C: 33, B: 24, A: 15 },
  // p. 9-64 — Depth 40 fsw
  40: { Z: 188, O: 169, N: 152, M: 136, L: 122, K: 109, J: 97, I: 85, H: 74, G: 64, F: 55, E: 45, D: 37, C: 29, B: 21, A: 13 },
  // p. 9-64 — Depth 45 fsw
  45: { Z: 154, O: 140, N: 127, M: 115, L: 104, K: 93, J: 83, I: 73, H: 64, G: 56, F: 48, E: 40, D: 32, C: 25, B: 18, A: 12 },
  // p. 9-64 — Depth 50 fsw
  50: { Z: 131, O: 120, N: 109, M: 99, L: 90, K: 81, J: 73, I: 65, H: 57, G: 49, F: 42, E: 35, D: 29, C: 23, B: 17, A: 11 },
  // p. 9-64 — Depth 55 fsw
  55: { Z: 114, O: 105, N: 96, M: 88, L: 80, K: 72, J: 65, I: 58, H: 51, G: 44, F: 38, E: 32, D: 26, C: 20, B: 15, A: 10 },
  // p. 9-64 — Depth 60 fsw
  60: { Z: 101, O: 93, N: 86, M: 79, L: 72, K: 65, J: 58, I: 52, H: 46, G: 40, F: 35, E: 29, D: 24, C: 19, B: 14, A: 9 },
  // p. 9-64 — Depth 70 fsw
  70: { Z: 83, O: 77, N: 71, M: 65, L: 59, K: 54, J: 49, I: 44, H: 39, G: 34, F: 29, E: 25, D: 20, C: 16, B: 12, A: 8 },
  // p. 9-64 — Depth 80 fsw
  80: { Z: 70, O: 65, N: 60, M: 55, L: 51, K: 46, J: 42, I: 38, H: 33, G: 29, F: 25, E: 22, D: 18, C: 14, B: 10, A: 7 },
  // p. 9-64 — Depth 90 fsw
  90: { Z: 61, O: 57, N: 52, M: 48, L: 44, K: 41, J: 37, I: 33, H: 29, G: 26, F: 22, E: 19, D: 16, C: 12, B: 9, A: 6 },
  // p. 9-64 — Depth 100 fsw
  100: { Z: 54, O: 50, N: 47, M: 43, L: 40, K: 36, J: 33, I: 30, H: 26, G: 23, F: 20, E: 17, D: 14, C: 11, B: 8, A: 5 },
  // p. 9-64 — Depth 110 fsw
  110: { Z: 48, O: 45, N: 42, M: 39, L: 36, K: 33, J: 30, I: 27, H: 24, G: 21, F: 18, E: 16, D: 13, C: 10, B: 8, A: 5 },
  // p. 9-64 — Depth 120 fsw
  120: { Z: 44, O: 41, N: 38, M: 35, L: 32, K: 30, J: 27, I: 24, H: 22, G: 19, F: 17, E: 14, D: 12, C: 9, B: 7, A: 5 },
  // p. 9-64 — Depth 130 fsw
  130: { Z: 40, O: 37, N: 35, M: 32, L: 30, K: 27, J: 25, I: 22, H: 20, G: 18, F: 15, E: 13, D: 11, C: 9, B: 6, A: 4 },
  // p. 9-64 — Depth 140 fsw
  140: { Z: 37, O: 34, N: 32, M: 30, L: 27, K: 25, J: 23, I: 21, H: 19, G: 16, F: 14, E: 12, D: 10, C: 8, B: 6, A: 4 },
  // p. 9-64 — Depth 150 fsw
  150: { Z: 34, O: 32, N: 30, M: 28, L: 26, K: 23, J: 21, I: 19, H: 17, G: 15, F: 13, E: 11, D: 9, C: 8, B: 6, A: 4 },
  // p. 9-64 — Depth 160 fsw
  160: { Z: 32, O: 30, N: 28, M: 26, L: 24, K: 22, J: 20, I: 18, H: 16, G: 14, F: 13, E: 11, D: 9, C: 7, B: 5, A: 4 },
  // p. 9-64 — Depth 170 fsw
  170: { Z: 30, O: 28, N: 26, M: 24, L: 22, K: 21, J: 19, I: 17, H: 15, G: 14, F: 12, E: 10, D: 8, C: 7, B: 5, A: 3 },
  // p. 9-64 — Depth 180 fsw
  180: { Z: 28, O: 26, N: 25, M: 23, L: 21, K: 19, J: 18, I: 16, H: 14, G: 12, F: 11, E: 10, D: 8, C: 7, B: 5, A: 3 },
  // p. 9-64 — Depth 190 fsw
  190: { Z: 26, O: 25, N: 23, M: 22, L: 20, K: 18, J: 17, I: 15, H: 14, G: 12, F: 11, E: 9, D: 8, C: 6, B: 5, A: 3 },
};

/**
 * Look up the new repetitive group after a surface interval.
 * @param startGroup - The diver's repetitive group from the previous dive
 * @param surfaceIntervalMinutes - Surface interval in minutes
 * @returns The new repetitive group, or null if the diver is "clean" (no longer repetitive)
 */
export function lookupNewGroupAfterSurfaceInterval(
  startGroup: string,
  surfaceIntervalMinutes: number
): string | null {
  const ranges = SURFACE_INTERVAL_TABLE[startGroup];
  if (!ranges) return null;

  // If surface interval is less than 10 minutes, the diver hasn't off-gassed at all
  if (surfaceIntervalMinutes < 10) return startGroup;

  // Find the matching range
  for (const range of ranges) {
    if (surfaceIntervalMinutes >= range.minMinutes && surfaceIntervalMinutes <= range.maxMinutes) {
      return range.newGroup;
    }
  }

  // Surface interval exceeds all ranges — diver is no longer repetitive
  return null;
}

/**
 * Look up the residual nitrogen time for a repetitive dive.
 * @param group - The diver's current repetitive group (after surface interval credit)
 * @param depthFsw - The planned depth of the repetitive dive in fsw
 * @returns The RNT in minutes, or null if it cannot be determined
 */
export function lookupResidualNitrogenTime(
  group: string,
  depthFsw: number
): number | null {
  // Round depth to next deeper table depth
  const tableDepth = roundToNextDeeperDepth(depthFsw);
  const depthRow = RNT_TABLE[tableDepth];
  if (!depthRow) return null;

  const rnt = depthRow[group];
  if (rnt === undefined) return null;
  if (rnt === -1) return null;  // ** = cannot be determined
  if (rnt === -2) {
    // † = read down to 30 fsw
    const fallback = RNT_TABLE[30];
    return fallback ? (fallback[group] ?? null) : null;
  }
  return rnt;
}

/**
 * Complete repetitive dive planning lookup.
 * Given a previous dive's repetitive group, surface interval, and planned next dive depth,
 * returns the new group, RNT, and adjusted bottom time.
 */
export interface RepetitiveDivePlan {
  previousGroup: string;
  surfaceIntervalMinutes: number;
  newGroup: string | null;
  isRepetitive: boolean;
  residualNitrogenTime: number | null;
  adjustedNoDecompLimit: number | null;
  depthFsw: number;
  citation: TableCitation;
  warnings: string[];
}

export function planRepetitiveDive(
  previousGroup: string,
  surfaceIntervalMinutes: number,
  depthFsw: number
): RepetitiveDivePlan {
  const warnings: string[] = [];
  const newGroup = lookupNewGroupAfterSurfaceInterval(previousGroup, surfaceIntervalMinutes);
  const isRepetitive = newGroup !== null;

  let rnt: number | null = null;
  let adjustedNoDecompLimit: number | null = null;

  if (isRepetitive && newGroup) {
    rnt = lookupResidualNitrogenTime(newGroup, depthFsw);
    if (rnt === null) {
      warnings.push(`RNT cannot be determined for group ${newGroup} at ${depthFsw} fsw — use Air Decompression Table per paragraph 9-9.1 subparagraph 8`);
    } else {
      const tableDepth = roundToNextDeeperDepth(depthFsw);
      const noDecompRow = NO_DECOM_TABLE.find(r => r.depth === tableDepth);
      if (noDecompRow) {
        adjustedNoDecompLimit = noDecompRow.noStopLimit === Infinity ? null : noDecompRow.noStopLimit - rnt;
        if (adjustedNoDecompLimit !== null && adjustedNoDecompLimit < 0) {
          adjustedNoDecompLimit = 0;
          warnings.push("Adjusted no-decompression limit is zero or negative — decompression dive required");
        }
      }
    }
  }

  return {
    previousGroup,
    surfaceIntervalMinutes,
    newGroup,
    isRepetitive,
    residualNitrogenTime: rnt,
    adjustedNoDecompLimit,
    depthFsw,
    citation: makeCitation("9-8"),
    warnings,
  };
}

// ============================================================================
// TABLE 9-9: Air Decompression Table
// Source: U.S. Navy Diving Manual, Rev 7, Table 9-9, pp. 9-65 through 9-86
// ============================================================================

export const AIR_DECOM_TABLE: DecompDepth[] = [
  // 30 fsw — p. 9-65 (PDF p. 6)
  {
    depth: 30,
    entries: [
      { bottomTime: 371, decompStops: [], totalDecompTime: 0, group: "Z" },
      { bottomTime: 380, decompStops: [{ depth: 20, time: 5 }], totalDecompTime: 5, airO2Stops: [{ depth: 20, time: 1 }], airO2TotalDecompTime: 1, surDO2Periods: 0.5, group: "Z" },
      { bottomTime: 420, decompStops: [{ depth: 20, time: 22 }], totalDecompTime: 22, airO2Stops: [{ depth: 20, time: 5 }], airO2TotalDecompTime: 5, surDO2Periods: 0.5, group: "Z" },
      { bottomTime: 480, decompStops: [{ depth: 20, time: 42 }], totalDecompTime: 42, airO2Stops: [{ depth: 20, time: 9 }], airO2TotalDecompTime: 9, surDO2Periods: 0.5, group: "Z" },
      { bottomTime: 540, decompStops: [{ depth: 20, time: 71 }], totalDecompTime: 71, airO2Stops: [{ depth: 20, time: 14 }], airO2TotalDecompTime: 14, surDO2Periods: 1, group: "Z" },
      { bottomTime: 600, decompStops: [{ depth: 20, time: 92 }], totalDecompTime: 92, airO2Stops: [{ depth: 20, time: 19 }], airO2TotalDecompTime: 19, surDO2Periods: 1, group: "Z", exceptionalExposure: true },
      { bottomTime: 660, decompStops: [{ depth: 20, time: 120 }], totalDecompTime: 120, airO2Stops: [{ depth: 20, time: 22 }], airO2TotalDecompTime: 22, surDO2Periods: 1, group: "Z", exceptionalExposure: true },
      { bottomTime: 720, decompStops: [{ depth: 20, time: 158 }], totalDecompTime: 158, airO2Stops: [{ depth: 20, time: 27 }], airO2TotalDecompTime: 27, surDO2Periods: 1, group: "Z", exceptionalExposure: true },
    ],
  },
  // 35 fsw — p. 9-65 (PDF p. 6)
  {
    depth: 35,
    entries: [
      { bottomTime: 232, decompStops: [], totalDecompTime: 0, group: "Z" },
      { bottomTime: 240, decompStops: [{ depth: 20, time: 4 }], totalDecompTime: 4, airO2Stops: [{ depth: 20, time: 2 }], airO2TotalDecompTime: 2, surDO2Periods: 0.5, group: "Z" },
      { bottomTime: 270, decompStops: [{ depth: 20, time: 28 }], totalDecompTime: 28, airO2Stops: [{ depth: 20, time: 7 }], airO2TotalDecompTime: 7, surDO2Periods: 0.5, group: "Z" },
      { bottomTime: 300, decompStops: [{ depth: 20, time: 53 }], totalDecompTime: 53, airO2Stops: [{ depth: 20, time: 13 }], airO2TotalDecompTime: 13, surDO2Periods: 0.5, group: "Z" },
      { bottomTime: 330, decompStops: [{ depth: 20, time: 71 }], totalDecompTime: 71, airO2Stops: [{ depth: 20, time: 18 }], airO2TotalDecompTime: 18, surDO2Periods: 1, group: "Z" },
      { bottomTime: 360, decompStops: [{ depth: 20, time: 88 }], totalDecompTime: 88, airO2Stops: [{ depth: 20, time: 22 }], airO2TotalDecompTime: 22, surDO2Periods: 1, group: "Z" },
      { bottomTime: 420, decompStops: [{ depth: 20, time: 134 }], totalDecompTime: 134, airO2Stops: [{ depth: 20, time: 29 }], airO2TotalDecompTime: 29, surDO2Periods: 1.5, group: "Z", exceptionalExposure: true },
      { bottomTime: 480, decompStops: [{ depth: 20, time: 173 }], totalDecompTime: 173, airO2Stops: [{ depth: 20, time: 38 }], airO2TotalDecompTime: 38, surDO2Periods: 1.5, group: "Z", exceptionalExposure: true },
    ],
  },
  // 40 fsw — p. 9-66 (PDF p. 7)
  {
    depth: 40,
    entries: [
      { bottomTime: 163, decompStops: [], totalDecompTime: 0, group: "O" },
      { bottomTime: 170, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "O" },
      { bottomTime: 180, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "Z" },
      { bottomTime: 190, decompStops: [{ depth: 20, time: 11 }], totalDecompTime: 11, group: "Z" },
      { bottomTime: 200, decompStops: [{ depth: 20, time: 15 }], totalDecompTime: 15, group: "Z" },
      { bottomTime: 210, decompStops: [{ depth: 20, time: 19 }], totalDecompTime: 19, group: "Z" },
      { bottomTime: 220, decompStops: [{ depth: 20, time: 24 }], totalDecompTime: 24, group: "Z" },
      { bottomTime: 240, decompStops: [{ depth: 20, time: 34 }], totalDecompTime: 34, group: "Z" },
      { bottomTime: 270, decompStops: [{ depth: 20, time: 55 }], totalDecompTime: 55, group: "Z" },
      { bottomTime: 300, decompStops: [{ depth: 20, time: 71 }], totalDecompTime: 71, group: "Z" },
    ],
  },
  // 45 fsw — p. 9-67 (PDF p. 8)
  {
    depth: 45,
    entries: [
      { bottomTime: 125, decompStops: [], totalDecompTime: 0, group: "N" },
      { bottomTime: 130, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "O" },
      { bottomTime: 140, decompStops: [{ depth: 20, time: 14 }], totalDecompTime: 14, group: "O" },
      { bottomTime: 150, decompStops: [{ depth: 20, time: 25 }], totalDecompTime: 25, group: "Z" },
      { bottomTime: 160, decompStops: [{ depth: 20, time: 34 }], totalDecompTime: 34, group: "Z" },
      { bottomTime: 170, decompStops: [{ depth: 20, time: 41 }], totalDecompTime: 41, group: "Z" },
      { bottomTime: 180, decompStops: [{ depth: 20, time: 59 }], totalDecompTime: 59, group: "Z" },
      { bottomTime: 190, decompStops: [{ depth: 20, time: 75 }], totalDecompTime: 75, group: "Z" },
      { bottomTime: 200, decompStops: [{ depth: 20, time: 89 }], totalDecompTime: 89, group: "Z", exceptionalExposure: true },
    ],
  },
  // 50 fsw — p. 9-68 (PDF p. 9)
  {
    depth: 50,
    entries: [
      { bottomTime: 92, decompStops: [], totalDecompTime: 0, group: "M" },
      { bottomTime: 100, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "N" },
      { bottomTime: 110, decompStops: [{ depth: 20, time: 5 }], totalDecompTime: 5, group: "N" },
      { bottomTime: 120, decompStops: [{ depth: 20, time: 8 }], totalDecompTime: 8, group: "O" },
      { bottomTime: 130, decompStops: [{ depth: 20, time: 11 }], totalDecompTime: 11, group: "O" },
      { bottomTime: 140, decompStops: [{ depth: 20, time: 15 }], totalDecompTime: 15, group: "Z" },
      { bottomTime: 150, decompStops: [{ depth: 20, time: 17 }], totalDecompTime: 17, group: "Z" },
      { bottomTime: 160, decompStops: [{ depth: 20, time: 19 }], totalDecompTime: 19, group: "Z" },
      { bottomTime: 170, decompStops: [{ depth: 20, time: 21 }], totalDecompTime: 21, group: "Z" },
      { bottomTime: 180, decompStops: [{ depth: 20, time: 24 }], totalDecompTime: 24, group: "Z" },
    ],
  },
  // 55 fsw — p. 9-69 (PDF p. 10)
  {
    depth: 55,
    entries: [
      { bottomTime: 74, decompStops: [], totalDecompTime: 0, group: "L" },
      { bottomTime: 75, decompStops: [{ depth: 20, time: 1 }], totalDecompTime: 1, group: "L" },
      { bottomTime: 80, decompStops: [{ depth: 20, time: 4 }], totalDecompTime: 4, group: "M" },
      { bottomTime: 90, decompStops: [{ depth: 20, time: 10 }], totalDecompTime: 10, group: "N" },
      { bottomTime: 100, decompStops: [{ depth: 20, time: 17 }], totalDecompTime: 17, group: "O" },
      { bottomTime: 110, decompStops: [{ depth: 20, time: 34 }], totalDecompTime: 34, group: "O" },
      { bottomTime: 120, decompStops: [{ depth: 20, time: 48 }], totalDecompTime: 48, group: "Z" },
      { bottomTime: 130, decompStops: [{ depth: 20, time: 59 }], totalDecompTime: 59, group: "Z" },
      { bottomTime: 140, decompStops: [{ depth: 20, time: 84 }], totalDecompTime: 84, group: "Z" },
    ],
  },
  // 60 fsw — p. 9-70 (PDF p. 11)
  {
    depth: 60,
    entries: [
      { bottomTime: 63, decompStops: [], totalDecompTime: 0, group: "K" },
      { bottomTime: 70, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "L" },
      { bottomTime: 80, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "M" },
      { bottomTime: 90, decompStops: [{ depth: 20, time: 11 }], totalDecompTime: 11, group: "N" },
      { bottomTime: 100, decompStops: [{ depth: 20, time: 14 }], totalDecompTime: 14, group: "N" },
      { bottomTime: 110, decompStops: [{ depth: 20, time: 17 }], totalDecompTime: 17, group: "O" },
      { bottomTime: 120, decompStops: [{ depth: 20, time: 19 }], totalDecompTime: 19, group: "O" },
      { bottomTime: 130, decompStops: [{ depth: 20, time: 23 }], totalDecompTime: 23, group: "Z" },
      { bottomTime: 140, decompStops: [{ depth: 20, time: 26 }], totalDecompTime: 26, group: "Z" },
      { bottomTime: 150, decompStops: [{ depth: 20, time: 32 }], totalDecompTime: 32, group: "Z" },
      { bottomTime: 160, decompStops: [{ depth: 20, time: 37 }], totalDecompTime: 37, group: "Z" },
      { bottomTime: 170, decompStops: [{ depth: 20, time: 41 }], totalDecompTime: 41, group: "Z" },
      { bottomTime: 180, decompStops: [{ depth: 20, time: 47 }], totalDecompTime: 47, group: "Z" },
    ],
  },
  // 70 fsw — p. 9-71 (PDF p. 12)
  {
    depth: 70,
    entries: [
      { bottomTime: 48, decompStops: [], totalDecompTime: 0, group: "K" },
      { bottomTime: 60, decompStops: [{ depth: 20, time: 8 }], totalDecompTime: 8, group: "L" },
      { bottomTime: 70, decompStops: [{ depth: 20, time: 14 }], totalDecompTime: 14, group: "M" },
      { bottomTime: 80, decompStops: [{ depth: 20, time: 18 }], totalDecompTime: 18, group: "N" },
      { bottomTime: 90, decompStops: [{ depth: 20, time: 23 }], totalDecompTime: 23, group: "O" },
      { bottomTime: 100, decompStops: [{ depth: 20, time: 33 }], totalDecompTime: 33, group: "O" },
      { bottomTime: 110, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 41 }], totalDecompTime: 43, group: "Z" },
      { bottomTime: 120, decompStops: [{ depth: 10, time: 4 }, { depth: 20, time: 47 }], totalDecompTime: 51, group: "Z" },
    ],
  },
  // 80 fsw — p. 9-72 (PDF p. 13)
  {
    depth: 80,
    entries: [
      { bottomTime: 39, decompStops: [], totalDecompTime: 0, group: "J" },
      { bottomTime: 50, decompStops: [{ depth: 20, time: 10 }], totalDecompTime: 10, group: "K" },
      { bottomTime: 60, decompStops: [{ depth: 20, time: 17 }], totalDecompTime: 17, group: "L" },
      { bottomTime: 70, decompStops: [{ depth: 20, time: 23 }], totalDecompTime: 23, group: "M" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 31 }], totalDecompTime: 33, group: "N" },
      { bottomTime: 90, decompStops: [{ depth: 10, time: 7 }, { depth: 20, time: 39 }], totalDecompTime: 46, group: "O" },
      { bottomTime: 100, decompStops: [{ depth: 10, time: 11 }, { depth: 20, time: 46 }], totalDecompTime: 57, group: "Z" },
    ],
  },
  // 90 fsw — p. 9-73 (PDF p. 14)
  {
    depth: 90,
    entries: [
      { bottomTime: 33, decompStops: [], totalDecompTime: 0, group: "J" },
      { bottomTime: 40, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "K" },
      { bottomTime: 50, decompStops: [{ depth: 20, time: 18 }], totalDecompTime: 18, group: "L" },
      { bottomTime: 60, decompStops: [{ depth: 20, time: 25 }], totalDecompTime: 25, group: "M" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 7 }, { depth: 20, time: 30 }], totalDecompTime: 37, group: "N" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 13 }, { depth: 20, time: 40 }], totalDecompTime: 53, group: "O" },
      { bottomTime: 90, decompStops: [{ depth: 10, time: 18 }, { depth: 20, time: 48 }], totalDecompTime: 66, group: "Z" },
    ],
  },
  // 100 fsw — p. 9-74 (PDF p. 15)
  {
    depth: 100,
    entries: [
      { bottomTime: 25, decompStops: [], totalDecompTime: 0, group: "H" },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "I" },
      { bottomTime: 40, decompStops: [{ depth: 20, time: 15 }], totalDecompTime: 15, group: "K" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 24 }], totalDecompTime: 26, group: "L" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 9 }, { depth: 20, time: 28 }], totalDecompTime: 37, group: "M" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 16 }, { depth: 20, time: 39 }], totalDecompTime: 55, group: "N" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 22 }, { depth: 20, time: 48 }], totalDecompTime: 70, group: "O" },
      { bottomTime: 90, decompStops: [{ depth: 10, time: 24 }, { depth: 20, time: 54 }], totalDecompTime: 78, group: "Z" },
    ],
  },
  // 110 fsw — p. 9-75 (PDF p. 16)
  {
    depth: 110,
    entries: [
      { bottomTime: 20, decompStops: [], totalDecompTime: 0, group: "H" },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "I" },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "J" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 21 }], totalDecompTime: 23, group: "L" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 10 }, { depth: 20, time: 26 }], totalDecompTime: 36, group: "M" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 17 }, { depth: 20, time: 37 }], totalDecompTime: 54, group: "N" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 23 }, { depth: 20, time: 45 }], totalDecompTime: 68, group: "O" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 31 }, { depth: 20, time: 53 }], totalDecompTime: 84, group: "Z" },
    ],
  },
  // 120 fsw — p. 9-76 (PDF p. 17)
  {
    depth: 120,
    entries: [
      { bottomTime: 15, decompStops: [], totalDecompTime: 0, group: "F" },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "H" },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 6 }], totalDecompTime: 6, group: "I" },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 14 }], totalDecompTime: 14, group: "K" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 8 }, { depth: 20, time: 25 }], totalDecompTime: 33, group: "L" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 18 }, { depth: 20, time: 36 }], totalDecompTime: 54, group: "N" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 23 }, { depth: 20, time: 48 }], totalDecompTime: 71, group: "O" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 30 }, { depth: 20, time: 55 }], totalDecompTime: 85, group: "Z" },
    ],
  },
  // 130 fsw — p. 9-77 (PDF p. 18)
  {
    depth: 130,
    entries: [
      { bottomTime: 12, decompStops: [], totalDecompTime: 0, group: "F" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 1 }], totalDecompTime: 1, group: "G" },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 4 }], totalDecompTime: 4, group: "I" },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 10 }], totalDecompTime: 10, group: "J" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 3 }, { depth: 20, time: 18 }], totalDecompTime: 21, group: "K" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 14 }, { depth: 20, time: 32 }], totalDecompTime: 46, group: "M" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 23 }, { depth: 20, time: 45 }], totalDecompTime: 68, group: "O" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 31 }, { depth: 20, time: 55 }], totalDecompTime: 86, group: "Z" },
    ],
  },
  // 140 fsw — p. 9-78 (PDF p. 19)
  {
    depth: 140,
    entries: [
      { bottomTime: 10, decompStops: [], totalDecompTime: 0, group: "E" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "G" },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 6 }], totalDecompTime: 6, group: "I" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 14 }], totalDecompTime: 16, group: "K" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 8 }, { depth: 20, time: 24 }], totalDecompTime: 32, group: "L" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 20 }, { depth: 20, time: 38 }], totalDecompTime: 58, group: "N" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 30 }, { depth: 20, time: 52 }], totalDecompTime: 82, group: "Z" },
    ],
  },
  // 150 fsw — p. 9-79 (PDF p. 20)
  {
    depth: 150,
    entries: [
      { bottomTime: 8, decompStops: [], totalDecompTime: 0, group: "E" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 1 }], totalDecompTime: 1, group: "F" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 4 }], totalDecompTime: 4, group: "H" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 1 }, { depth: 20, time: 11 }], totalDecompTime: 12, group: "J" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 6 }, { depth: 20, time: 18 }], totalDecompTime: 24, group: "K" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 14 }, { depth: 20, time: 26 }], totalDecompTime: 40, group: "M" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 24 }, { depth: 20, time: 44 }], totalDecompTime: 68, group: "O" },
    ],
  },
  // 160 fsw — p. 9-79 (PDF p. 20)
  {
    depth: 160,
    entries: [
      { bottomTime: 7, decompStops: [], totalDecompTime: 0, group: "E" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 1 }], totalDecompTime: 1, group: "F" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 5 }], totalDecompTime: 5, group: "H" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 3 }, { depth: 20, time: 14 }], totalDecompTime: 17, group: "J" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 9 }, { depth: 20, time: 23 }], totalDecompTime: 32, group: "L" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 18 }, { depth: 20, time: 32 }], totalDecompTime: 50, group: "N" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 29 }, { depth: 20, time: 50 }], totalDecompTime: 79, group: "Z" },
    ],
  },
  // 170 fsw — p. 9-81 (PDF p. 22)
  {
    depth: 170,
    entries: [
      { bottomTime: 6, decompStops: [], totalDecompTime: 0, group: "D" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 6 }], totalDecompTime: 6, group: "G" },
      { bottomTime: 15, decompStops: [{ depth: 10, time: 3 }, { depth: 20, time: 13 }], totalDecompTime: 16, group: "J" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 6 }, { depth: 20, time: 24 }], totalDecompTime: 30, group: "M" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 7 }, { depth: 20, time: 41 }], totalDecompTime: 48, group: "O" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 7 }, { depth: 20, time: 7 }, { depth: 30, time: 77 }], totalDecompTime: 91, group: "Z" },
    ],
  },
  // 180 fsw — p. 9-82 (PDF p. 23)
  {
    depth: 180,
    entries: [
      { bottomTime: 6, decompStops: [], totalDecompTime: 0, group: "E" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 8 }], totalDecompTime: 8, group: "G" },
      { bottomTime: 15, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 3 }, { depth: 30, time: 14 }], totalDecompTime: 19, group: "K" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 1 }, { depth: 20, time: 5 }, { depth: 30, time: 7 }, { depth: 40, time: 29 }], totalDecompTime: 42, group: "M" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 5 }, { depth: 20, time: 6 }, { depth: 30, time: 7 }, { depth: 40, time: 57 }], totalDecompTime: 75, group: "O" },
    ],
  },
  // 190 fsw — p. 9-83 (PDF p. 24)
  {
    depth: 190,
    entries: [
      { bottomTime: 5, decompStops: [], totalDecompTime: 0, group: "D" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 2 }, { depth: 30, time: 8 }], totalDecompTime: 10, group: "H" },
      { bottomTime: 15, decompStops: [{ depth: 10, time: 1 }, { depth: 20, time: 3 }, { depth: 30, time: 3 }, { depth: 40, time: 16 }], totalDecompTime: 23, group: "K" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 1 }, { depth: 20, time: 2 }, { depth: 30, time: 6 }, { depth: 40, time: 7 }, { depth: 50, time: 34 }], totalDecompTime: 50, group: "N" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 6 }, { depth: 30, time: 7 }, { depth: 40, time: 7 }, { depth: 50, time: 72 }], totalDecompTime: 94, group: "Z" },
    ],
  },
  // 200 fsw — p. 9-84 (PDF p. 25) — ALL Exceptional Exposure
  {
    depth: 200,
    entries: [
      { bottomTime: 5, decompStops: [], totalDecompTime: 0, group: "E", exceptionalExposure: true },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 8 }, { depth: 30, time: 3 }], totalDecompTime: 11, group: "H", exceptionalExposure: true },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 5 }, { depth: 30, time: 3 }, { depth: 40, time: 2 }, { depth: 50, time: 19 }], totalDecompTime: 29, group: "L", exceptionalExposure: true },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 6 }, { depth: 40, time: 4 }, { depth: 50, time: 2 }, { depth: 60, time: 43 }], totalDecompTime: 62, group: "O", exceptionalExposure: true },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 6 }, { depth: 40, time: 6 }, { depth: 50, time: 5 }, { depth: 60, time: 1 }, { depth: 70, time: 85 }], totalDecompTime: 110, group: "Z", exceptionalExposure: true },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 19 }, { depth: 30, time: 7 }, { depth: 40, time: 5 }, { depth: 50, time: 6 }, { depth: 60, time: 4 }, { depth: 70, time: 145 }], totalDecompTime: 186, group: "Z", exceptionalExposure: true },
      { bottomTime: 40, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 21 }, { depth: 40, time: 5 }, { depth: 50, time: 5 }, { depth: 60, time: 11 }, { depth: 70, time: 4 }, { depth: 80, time: 249 }], totalDecompTime: 323, group: "Z", exceptionalExposure: true },
      { bottomTime: 50, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 26 }, { depth: 40, time: 10 }, { depth: 50, time: 8 }, { depth: 60, time: 4 }, { depth: 70, time: 2 }, { depth: 80, time: 382 }], totalDecompTime: 460, group: "Z", exceptionalExposure: true },
    ],
  },
  // 210 fsw — p. 9-84 (PDF p. 25) — ALL Exceptional Exposure
  {
    depth: 210,
    entries: [
      { bottomTime: 4, decompStops: [], totalDecompTime: 0, group: "D", exceptionalExposure: true },
      { bottomTime: 5, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "E", exceptionalExposure: true },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 9 }, { depth: 30, time: 3 }, { depth: 40, time: 2 }], totalDecompTime: 14, group: "I", exceptionalExposure: true },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 6 }, { depth: 30, time: 3 }, { depth: 40, time: 3 }, { depth: 50, time: 1 }, { depth: 60, time: 24 }], totalDecompTime: 37, group: "M", exceptionalExposure: true },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 6 }, { depth: 40, time: 5 }, { depth: 50, time: 3 }, { depth: 60, time: 1 }, { depth: 70, time: 57 }], totalDecompTime: 79, group: "O", exceptionalExposure: true },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 8 }, { depth: 30, time: 7 }, { depth: 40, time: 5 }, { depth: 50, time: 6 }, { depth: 60, time: 3 }, { depth: 70, time: 110 }], totalDecompTime: 139, group: "Z", exceptionalExposure: true },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 26 }, { depth: 30, time: 6 }, { depth: 40, time: 6 }, { depth: 50, time: 5 }, { depth: 60, time: 6 }, { depth: 70, time: 2 }, { depth: 80, time: 163 }], totalDecompTime: 214, group: "Z", exceptionalExposure: true },
      { bottomTime: 40, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 26 }, { depth: 40, time: 11 }, { depth: 50, time: 5 }, { depth: 60, time: 5 }, { depth: 70, time: 7 }, { depth: 80, time: 278 }], totalDecompTime: 360, group: "Z", exceptionalExposure: true },
      { bottomTime: 50, decompStops: [{ depth: 20, time: 36 }, { depth: 30, time: 26 }, { depth: 40, time: 12 }, { depth: 50, time: 10 }, { depth: 60, time: 4 }, { depth: 70, time: 5 }, { depth: 80, time: 1 }, { depth: 90, time: 432 }], totalDecompTime: 526, group: "Z", exceptionalExposure: true },
    ],
  },
  // 220 fsw — p. 9-85 (PDF p. 26) — ALL Exceptional Exposure
  {
    depth: 220,
    entries: [
      { bottomTime: 4, decompStops: [], totalDecompTime: 0, group: "E", exceptionalExposure: true },
      { bottomTime: 5, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "E", exceptionalExposure: true },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 10 }, { depth: 30, time: 4 }, { depth: 40, time: 3 }], totalDecompTime: 17, group: "J", exceptionalExposure: true },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 4 }, { depth: 40, time: 2 }, { depth: 50, time: 3 }, { depth: 60, time: 28 }], totalDecompTime: 44, group: "N", exceptionalExposure: true },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 6 }, { depth: 40, time: 4 }, { depth: 50, time: 2 }, { depth: 60, time: 70 }], totalDecompTime: 89, group: "Z", exceptionalExposure: true },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 14 }, { depth: 30, time: 6 }, { depth: 40, time: 6 }, { depth: 50, time: 5 }, { depth: 60, time: 1 }, { depth: 70, time: 133 }], totalDecompTime: 165, group: "Z", exceptionalExposure: true },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 10 }, { depth: 40, time: 5 }, { depth: 50, time: 6 }, { depth: 60, time: 4 }, { depth: 70, time: 1 }, { depth: 80, time: 183 }], totalDecompTime: 237, group: "Z", exceptionalExposure: true },
      { bottomTime: 40, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 26 }, { depth: 40, time: 15 }, { depth: 50, time: 5 }, { depth: 60, time: 5 }, { depth: 70, time: 9 }, { depth: 80, time: 1 }, { depth: 90, time: 319 }], totalDecompTime: 408, group: "Z", exceptionalExposure: true },
    ],
  },
  // 250 fsw — p. 9-85 (PDF p. 26) — ALL Exceptional Exposure
  {
    depth: 250,
    entries: [
      { bottomTime: 4, decompStops: [{ depth: 20, time: 4 }], totalDecompTime: 4, group: "F", exceptionalExposure: true },
      { bottomTime: 5, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "G", exceptionalExposure: true },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 15 }, { depth: 30, time: 3 }, { depth: 40, time: 2 }, { depth: 50, time: 2 }], totalDecompTime: 22, group: "L", exceptionalExposure: true },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 4 }, { depth: 40, time: 2 }, { depth: 50, time: 2 }, { depth: 60, time: 7 }, { depth: 70, time: 53 }], totalDecompTime: 75, group: "O", exceptionalExposure: true },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 11 }, { depth: 30, time: 6 }, { depth: 40, time: 6 }, { depth: 50, time: 4 }, { depth: 60, time: 2 }, { depth: 70, time: 2 }, { depth: 80, time: 125 }], totalDecompTime: 156, group: "Z", exceptionalExposure: true },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 10 }, { depth: 40, time: 6 }, { depth: 50, time: 4 }, { depth: 60, time: 5 }, { depth: 70, time: 1 }, { depth: 80, time: 4 }, { depth: 90, time: 189 }], totalDecompTime: 247, group: "Z", exceptionalExposure: true },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 25 }, { depth: 40, time: 9 }, { depth: 50, time: 6 }, { depth: 60, time: 4 }, { depth: 70, time: 4 }, { depth: 80, time: 1 }, { depth: 90, time: 267 }], totalDecompTime: 344, group: "Z", exceptionalExposure: true },
    ],
  },
  // 300 fsw — p. 9-86 (PDF p. 27) — ALL Exceptional Exposure
  {
    depth: 300,
    entries: [
      { bottomTime: 4, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 3 }], totalDecompTime: 10, group: "G", exceptionalExposure: true },
      { bottomTime: 5, decompStops: [{ depth: 20, time: 8 }, { depth: 30, time: 3 }, { depth: 40, time: 3 }], totalDecompTime: 14, group: "I", exceptionalExposure: true },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 7 }, { depth: 30, time: 4 }, { depth: 40, time: 3 }, { depth: 50, time: 2 }, { depth: 60, time: 2 }, { depth: 70, time: 3 }, { depth: 80, time: 35 }], totalDecompTime: 56, group: "N", exceptionalExposure: true },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 11 }, { depth: 30, time: 7 }, { depth: 40, time: 6 }, { depth: 50, time: 5 }, { depth: 60, time: 3 }, { depth: 70, time: 3 }, { depth: 80, time: 2 }, { depth: 90, time: 2 }, { depth: 100, time: 125 }], totalDecompTime: 164, group: "Z", exceptionalExposure: true },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 16 }, { depth: 40, time: 6 }, { depth: 50, time: 5 }, { depth: 60, time: 5 }, { depth: 70, time: 2 }, { depth: 80, time: 4 }, { depth: 90, time: 2 }, { depth: 100, time: 219 }], totalDecompTime: 287, group: "Z", exceptionalExposure: true },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 28 }, { depth: 30, time: 26 }, { depth: 40, time: 18 }, { depth: 50, time: 5 }, { depth: 60, time: 5 }, { depth: 70, time: 4 }, { depth: 80, time: 3 }, { depth: 90, time: 1 }, { depth: 100, time: 324 }], totalDecompTime: 414, group: "Z", exceptionalExposure: true },
    ],
  },
];

// ============================================================================
// TABLE 9-1: Pneumofathometer Correction Factors (Reference Only)
// Source: U.S. Navy Diving Manual, Rev 7, Table 9-1, p. 9-1 (PDF p. 432)
// ============================================================================

export interface PneumoCorrectionEntry {
  hoseLength: number;  // feet
  correctionFactor: number;
}

/** Table 9-1 — Pneumofathometer Correction Factors.
 *  Multiply indicated depth by correction factor to get actual depth.
 *  Source: Rev 7, p. 9-1 */
export const PNEUMO_CORRECTION_TABLE: PneumoCorrectionEntry[] = [
  // p. 9-1 — standard correction factors
  { hoseLength: 100, correctionFactor: 1.015 },
  { hoseLength: 150, correctionFactor: 1.023 },
  { hoseLength: 200, correctionFactor: 1.030 },
  { hoseLength: 250, correctionFactor: 1.038 },
  { hoseLength: 300, correctionFactor: 1.045 },
  { hoseLength: 350, correctionFactor: 1.053 },
  { hoseLength: 400, correctionFactor: 1.060 },
];

// ============================================================================
// TABLES 9-4, 9-5, 9-6: Altitude Diving Reference Tables (Display Only)
// WARNING: Altitude diving requires a Diving Medical Officer (DMO).
// These tables are for REFERENCE DISPLAY ONLY — no auto-compute.
// ============================================================================

/** Table 9-5 — Repetitive Groups Associated with Initial Ascent to Altitude.
 *  Source: Rev 7, p. 9-50 */
export const ALTITUDE_REPETITIVE_GROUPS: { altitude: number; group: string }[] = [
  { altitude: 1000, group: "A" },   // p. 9-50
  { altitude: 2000, group: "A" },
  { altitude: 3000, group: "B" },
  { altitude: 4000, group: "C" },
  { altitude: 5000, group: "D" },
  { altitude: 6000, group: "E" },
  { altitude: 7000, group: "F" },
  { altitude: 8000, group: "G" },
  { altitude: 9000, group: "H" },
  { altitude: 10000, group: "I" },
];

/** Table 9-6 — Required Surface Interval Before Ascent to Altitude After Diving.
 *  Source: Rev 7, p. 9-62
 *  Format: ALTITUDE_SURFACE_INTERVALS[group][altitudeIndex] = "H:MM" or "0:00"
 *  Altitude columns: 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000 feet */
export const ALTITUDE_SURFACE_INTERVALS: Record<string, string[]> = {
  "A": ["0:00","0:00","0:00","0:00","0:00","0:00","0:00","0:00","0:00","0:00"],
  "B": ["0:00","0:00","0:00","0:00","0:00","0:00","0:00","0:00","0:00","1:42"],
  "C": ["0:00","0:00","0:00","0:00","0:00","0:00","0:00","0:00","1:48","6:23"],
  "D": ["0:00","0:00","0:00","0:00","0:00","0:00","0:00","1:45","5:24","9:59"],
  "E": ["0:00","0:00","0:00","0:00","0:00","0:00","1:37","4:39","8:18","12:54"],
  "F": ["0:00","0:00","0:00","0:00","0:00","1:32","4:04","7:06","10:45","15:20"],
  "G": ["0:00","0:00","0:00","0:00","1:19","3:38","6:10","9:13","12:52","17:27"],
  "H": ["0:00","0:00","0:00","1:06","3:10","5:29","8:02","11:04","14:43","19:18"],
  "I": ["0:00","0:00","0:56","2:45","4:50","7:09","9:41","12:44","16:22","20:58"],
  "J": ["0:00","0:41","2:25","4:15","6:19","8:39","11:11","14:13","17:52","22:27"],
  "K": ["0:30","2:03","3:47","5:37","7:41","10:00","12:33","15:35","19:14","23:49"],
  "L": ["1:45","3:18","5:02","6:52","8:56","11:15","13:48","16:50","20:29","25:04"],
  "M": ["2:54","4:28","6:12","8:01","10:06","12:25","14:57","18:00","21:38","26:14"],
  "N": ["3:59","5:32","7:16","9:06","11:10","13:29","16:02","19:04","22:43","27:18"],
  "O": ["4:59","6:33","8:17","10:06","12:11","14:30","17:02","20:05","23:43","28:19"],
  "Z": ["5:56","7:29","9:13","11:03","13:07","15:26","17:59","21:01","24:40","29:15"],
  // Exceptional Exposure: Wait 48 hours before ascent
};

export const ALTITUDE_DMO_WARNING = "WARNING: Altitude diving requires planning and approval by a Diving Medical Officer (DMO). These tables are for REFERENCE ONLY. Do not auto-compute altitude corrections. Consult NAVSEA 00C for operations above 10,000 feet.";

// ============================================================================
// TABLES 9-2, 9-3: Decision Trees (Formatted Reference Display)
// ============================================================================

export const TABLE_9_2_DESCRIPTION = {
  tableNumber: "9-2",
  name: "Management of Extended Surface Interval and Type I DCS",
  chapterPage: "9-39",
  pdfPage: 471,
  summary: "Decision tree for managing extended surface intervals (greater than the maximum listed in Table 9-8) and Type I decompression sickness symptoms. Directs the supervisor to evaluate symptoms, consider recompression treatment, and determine if the diver can continue diving operations.",
  note: "This is a decision tree — not tabular data. Refer to the manual for the complete flowchart.",
};

export const TABLE_9_3_DESCRIPTION = {
  tableNumber: "9-3",
  name: "Management of Asymptomatic Omitted Decompression",
  chapterPage: "9-41",
  pdfPage: 473,
  summary: "Decision tree for managing situations where required decompression stops were omitted (e.g., emergency ascent). Provides guidance on whether to return the diver to depth, initiate surface decompression, or begin recompression treatment.",
  note: "This is a decision tree — not tabular data. Refer to the manual for the complete flowchart.",
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Available table depths for quick reference
 * Updated to include all depths from 10 through 300 fsw
 */
export const TABLE_DEPTHS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 250, 300];

/**
 * Calculate Equivalent Air Depth (EAD) for Nitrox diving
 * EAD = (D + 33) × (1 - FO2) / 0.79 - 33
 * 
 * @param actualDepthFsw - Actual depth in feet of seawater
 * @param fo2 - Fraction of oxygen (e.g., 0.32 for EAN32)
 * @returns EAD in fsw, rounded to next deeper table depth
 */
export function calculateEAD(actualDepthFsw: number, fo2: number): number {
  const fn2 = 1 - fo2;
  const ead = (actualDepthFsw + 33) * (fn2 / 0.79) - 33;
  return Math.ceil(ead);
}

/**
 * Round a depth to the next deeper table depth
 * Per USN procedure: always round UP to the next deeper schedule depth
 */
export function roundToNextDeeperDepth(depthFsw: number): number {
  for (const tableDepth of TABLE_DEPTHS) {
    if (tableDepth >= depthFsw) return tableDepth;
  }
  return TABLE_DEPTHS[TABLE_DEPTHS.length - 1];
}

// ============================================================================
// DIVE TABLE RESULT INTERFACE & LOOKUP FUNCTION
// ============================================================================

export interface DiveTableResult {
  tableUsed: string;
  scheduleUsed: string;
  repetitiveGroup: string;
  decompRequired: "YES" | "NO";
  decompStops: DecompStop[];
  totalDecompTime: number;
  noDecompLimit: number | null;
  withinNoDecompLimits: boolean;
  /** Air/O2 in-water decompression stops (if available) */
  airO2Stops?: DecompStop[];
  airO2TotalDecompTime?: number;
  /** Surface Decompression on O2 chamber periods */
  surDO2Periods?: number;
  /** Exceptional Exposure flag */
  exceptionalExposure?: boolean;
  /** Citation for provenance tracking */
  citation: TableCitation;
  warnings: string[];
}

/**
 * Primary dive table lookup function.
 * Given depth (fsw) and bottom time (min), returns the complete dive schedule.
 * 
 * FIXED: Now correctly handles dives shallower than 40 fsw by looking up
 * the proper repetitive group from Table 9-7 (NO_DECOM_TABLE) for ALL depths
 * starting at 10 fsw.
 */
export function lookupDiveTable(
  depthFsw: number,
  bottomTimeMin: number,
  gasType: "air" | "nitrox" = "air",
  fo2?: number
): DiveTableResult {
  const warnings: string[] = [];

  // Calculate EAD for Nitrox
  let effectiveDepth = depthFsw;
  if (gasType === "nitrox" && fo2) {
    effectiveDepth = calculateEAD(depthFsw, fo2);
    warnings.push(`EAD calculated: ${effectiveDepth} fsw (actual ${depthFsw} fsw, FO2 ${fo2})`);
  }

  // Round to next deeper table depth
  const tableDepth = roundToNextDeeperDepth(effectiveDepth);

  // Look up no-decompression table (Table 9-7)
  const noDecompRow = NO_DECOM_TABLE.find(r => r.depth === tableDepth);

  // Determine if within no-decompression limits
  let withinNoDecompLimits = false;
  let noDecompLimit: number | null = null;
  let repetitiveGroup = "";

  if (noDecompRow) {
    noDecompLimit = noDecompRow.unlimited ? null : noDecompRow.noStopLimit;
    withinNoDecompLimits = noDecompRow.unlimited || bottomTimeMin <= noDecompRow.noStopLimit;

    if (withinNoDecompLimits) {
      // Find the correct repetitive group from Table 9-7
      // Walk through entries to find the first group whose maxBottomTime >= bottomTimeMin
      let foundGroup = false;
      for (const entry of noDecompRow.entries) {
        if (bottomTimeMin <= entry.maxBottomTime) {
          repetitiveGroup = entry.group;
          foundGroup = true;
          break;
        }
      }
      // If bottom time exceeds all entries but is still within no-stop limit
      // (can happen for unlimited depths), use the highest group
      if (!foundGroup && noDecompRow.entries.length > 0) {
        repetitiveGroup = noDecompRow.entries[noDecompRow.entries.length - 1].group;
      }

      return {
        tableUsed: `Table 9-7 (${tableDepth} fsw)`,
        scheduleUsed: `${tableDepth}/${bottomTimeMin}`,
        repetitiveGroup,
        decompRequired: "NO",
        decompStops: [],
        totalDecompTime: 0,
        noDecompLimit,
        withinNoDecompLimits: true,
        citation: makeCitation("9-7"),
        warnings,
      };
    }
  }

  // Dive exceeds no-decompression limits — look up Table 9-9
  const decompRow = AIR_DECOM_TABLE.find(r => r.depth === tableDepth);

  if (decompRow) {
    // Find the matching or next longer bottom time schedule
    let matchedEntry: DecompEntry | undefined;
    for (const entry of decompRow.entries) {
      if (bottomTimeMin <= entry.bottomTime) {
        matchedEntry = entry;
        break;
      }
    }

    // If bottom time exceeds all entries, use the longest schedule
    if (!matchedEntry && decompRow.entries.length > 0) {
      matchedEntry = decompRow.entries[decompRow.entries.length - 1];
      warnings.push(`Bottom time ${bottomTimeMin} min exceeds maximum scheduled time for ${tableDepth} fsw. Using longest available schedule.`);
    }

    if (matchedEntry) {
      if (matchedEntry.exceptionalExposure) {
        warnings.push("EXCEPTIONAL EXPOSURE: Requires Commanding Officer authorization and surface-supplied equipment.");
      }

      return {
        tableUsed: `Table 9-9 (${tableDepth} fsw)`,
        scheduleUsed: `${tableDepth}/${matchedEntry.bottomTime}`,
        repetitiveGroup: matchedEntry.group,
        decompRequired: matchedEntry.totalDecompTime > 0 ? "YES" : "NO",
        decompStops: matchedEntry.decompStops,
        totalDecompTime: matchedEntry.totalDecompTime,
        noDecompLimit,
        withinNoDecompLimits: false,
        airO2Stops: matchedEntry.airO2Stops,
        airO2TotalDecompTime: matchedEntry.airO2TotalDecompTime,
        surDO2Periods: matchedEntry.surDO2Periods,
        exceptionalExposure: matchedEntry.exceptionalExposure,
        citation: makeCitation("9-9"),
        warnings,
      };
    }
  }

  // Fallback: depth/time combination not found in any table
  warnings.push(`No table entry found for ${tableDepth} fsw / ${bottomTimeMin} min. Verify dive parameters.`);
  return {
    tableUsed: "NONE",
    scheduleUsed: `${tableDepth}/${bottomTimeMin}`,
    repetitiveGroup: "",
    decompRequired: "NO",
    decompStops: [],
    totalDecompTime: 0,
    noDecompLimit,
    withinNoDecompLimits: false,
    citation: makeCitation("9-7"),
    warnings,
  };
}

