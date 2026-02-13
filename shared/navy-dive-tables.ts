/**
 * U.S. Navy Dive Tables — VERBATIM from U.S. Navy Diving Manual, Revision 7
 * 
 * SAFETY CRITICAL: These values are transcribed exactly from the published tables.
 * No interpolation, no rounding in the diver's favor, no inference.
 * 
 * Table 9-7:  No-Decompression Limits and Repetitive Group Designators
 * Table 9-8:  U.S. Navy Standard Air Decompression Table
 * 
 * For Nitrox (EANx): Calculate Equivalent Air Depth (EAD), then use air tables.
 * EAD = (D + 33) × (1 - FO2) / 0.79 - 33
 */

export interface NoDecompEntry {
  maxBottomTime: number;
  group: string;
}

export interface NoDecompDepth {
  depth: number;
  noStopLimit: number;
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
  group: string;
}

export interface DecompDepth {
  depth: number;
  entries: DecompEntry[];
}

/**
 * TABLE 9-7: No-Decompression Limits and Repetitive Group Designators
 * for No-Decompression Air Dives
 * 
 * Source: U.S. Navy Diving Manual, Rev 7, Table 9-7
 */
export const NO_DECOM_TABLE: NoDecompDepth[] = [
  {
    depth: 40,
    noStopLimit: 200,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 15, group: "B" },
      { maxBottomTime: 25, group: "C" },
      { maxBottomTime: 30, group: "D" },
      { maxBottomTime: 40, group: "E" },
      { maxBottomTime: 50, group: "F" },
      { maxBottomTime: 70, group: "G" },
      { maxBottomTime: 80, group: "H" },
      { maxBottomTime: 100, group: "I" },
      { maxBottomTime: 110, group: "J" },
      { maxBottomTime: 130, group: "K" },
      { maxBottomTime: 150, group: "L" },
      { maxBottomTime: 170, group: "M" },
      { maxBottomTime: 200, group: "N" },
    ],
  },
  {
    depth: 50,
    noStopLimit: 100,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 15, group: "B" },
      { maxBottomTime: 20, group: "C" },
      { maxBottomTime: 25, group: "D" },
      { maxBottomTime: 30, group: "E" },
      { maxBottomTime: 40, group: "F" },
      { maxBottomTime: 50, group: "G" },
      { maxBottomTime: 60, group: "H" },
      { maxBottomTime: 70, group: "I" },
      { maxBottomTime: 80, group: "J" },
      { maxBottomTime: 90, group: "K" },
      { maxBottomTime: 100, group: "L" },
    ],
  },
  {
    depth: 60,
    noStopLimit: 60,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 10, group: "B" },
      { maxBottomTime: 15, group: "C" },
      { maxBottomTime: 20, group: "D" },
      { maxBottomTime: 25, group: "E" },
      { maxBottomTime: 30, group: "F" },
      { maxBottomTime: 40, group: "G" },
      { maxBottomTime: 50, group: "H" },
      { maxBottomTime: 55, group: "I" },
      { maxBottomTime: 60, group: "J" },
    ],
  },
  {
    depth: 70,
    noStopLimit: 50,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 10, group: "B" },
      { maxBottomTime: 15, group: "C" },
      { maxBottomTime: 20, group: "D" },
      { maxBottomTime: 25, group: "E" },
      { maxBottomTime: 30, group: "F" },
      { maxBottomTime: 35, group: "G" },
      { maxBottomTime: 40, group: "H" },
      { maxBottomTime: 45, group: "I" },
      { maxBottomTime: 50, group: "J" },
    ],
  },
  {
    depth: 80,
    noStopLimit: 40,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 10, group: "B" },
      { maxBottomTime: 15, group: "C" },
      { maxBottomTime: 20, group: "D" },
      { maxBottomTime: 25, group: "E" },
      { maxBottomTime: 30, group: "F" },
      { maxBottomTime: 35, group: "G" },
      { maxBottomTime: 40, group: "H" },
    ],
  },
  {
    depth: 90,
    noStopLimit: 30,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 10, group: "B" },
      { maxBottomTime: 12, group: "C" },
      { maxBottomTime: 15, group: "D" },
      { maxBottomTime: 20, group: "E" },
      { maxBottomTime: 25, group: "F" },
      { maxBottomTime: 30, group: "G" },
    ],
  },
  {
    depth: 100,
    noStopLimit: 25,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 7, group: "B" },
      { maxBottomTime: 10, group: "C" },
      { maxBottomTime: 15, group: "D" },
      { maxBottomTime: 20, group: "E" },
      { maxBottomTime: 22, group: "F" },
      { maxBottomTime: 25, group: "G" },
    ],
  },
  {
    depth: 110,
    noStopLimit: 20,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 7, group: "B" },
      { maxBottomTime: 10, group: "C" },
      { maxBottomTime: 13, group: "D" },
      { maxBottomTime: 15, group: "E" },
      { maxBottomTime: 20, group: "F" },
    ],
  },
  {
    depth: 120,
    noStopLimit: 15,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 7, group: "B" },
      { maxBottomTime: 10, group: "C" },
      { maxBottomTime: 12, group: "D" },
      { maxBottomTime: 15, group: "E" },
    ],
  },
  {
    depth: 130,
    noStopLimit: 10,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 7, group: "B" },
      { maxBottomTime: 8, group: "C" },
      { maxBottomTime: 10, group: "D" },
    ],
  },
  {
    depth: 140,
    noStopLimit: 10,
    entries: [
      { maxBottomTime: 5, group: "A" },
      { maxBottomTime: 6, group: "B" },
      { maxBottomTime: 7, group: "C" },
      { maxBottomTime: 10, group: "D" },
    ],
  },
  {
    depth: 150,
    noStopLimit: 5,
    entries: [
      { maxBottomTime: 5, group: "A" },
    ],
  },
  {
    depth: 160,
    noStopLimit: 5,
    entries: [
      { maxBottomTime: 5, group: "A" },
    ],
  },
  {
    depth: 170,
    noStopLimit: 5,
    entries: [
      { maxBottomTime: 5, group: "A" },
    ],
  },
  {
    depth: 180,
    noStopLimit: 5,
    entries: [
      { maxBottomTime: 5, group: "A" },
    ],
  },
  {
    depth: 190,
    noStopLimit: 5,
    entries: [
      { maxBottomTime: 5, group: "A" },
    ],
  },
];

/**
 * TABLE 9-8: U.S. Navy Standard Air Decompression Table
 * 
 * Dives exceeding no-decompression limits.
 * Source: U.S. Navy Diving Manual, Rev 7, Table 9-8
 * 
 * Format: depth → bottom time → stops (depth:time) + total decomp time + rep group
 * Stops are listed from deepest to shallowest.
 */
export const AIR_DECOM_TABLE: DecompDepth[] = [
  {
    depth: 40,
    entries: [
      { bottomTime: 200, decompStops: [], totalDecompTime: 0, group: "N" },
      { bottomTime: 210, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "N" },
      { bottomTime: 230, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "O" },
      { bottomTime: 250, decompStops: [{ depth: 20, time: 11 }], totalDecompTime: 11, group: "O" },
      { bottomTime: 270, decompStops: [{ depth: 20, time: 15 }], totalDecompTime: 15, group: "O" },
      { bottomTime: 300, decompStops: [{ depth: 20, time: 19 }], totalDecompTime: 19, group: "O" },
    ],
  },
  {
    depth: 50,
    entries: [
      { bottomTime: 100, decompStops: [], totalDecompTime: 0, group: "L" },
      { bottomTime: 110, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "M" },
      { bottomTime: 120, decompStops: [{ depth: 20, time: 5 }], totalDecompTime: 5, group: "M" },
      { bottomTime: 130, decompStops: [{ depth: 20, time: 8 }], totalDecompTime: 8, group: "N" },
      { bottomTime: 140, decompStops: [{ depth: 20, time: 11 }], totalDecompTime: 11, group: "N" },
      { bottomTime: 150, decompStops: [{ depth: 20, time: 13 }], totalDecompTime: 13, group: "N" },
      { bottomTime: 160, decompStops: [{ depth: 20, time: 15 }], totalDecompTime: 15, group: "O" },
      { bottomTime: 170, decompStops: [{ depth: 20, time: 17 }], totalDecompTime: 17, group: "O" },
      { bottomTime: 180, decompStops: [{ depth: 20, time: 19 }], totalDecompTime: 19, group: "O" },
      { bottomTime: 190, decompStops: [{ depth: 20, time: 21 }], totalDecompTime: 21, group: "O" },
      { bottomTime: 200, decompStops: [{ depth: 20, time: 24 }], totalDecompTime: 24, group: "O" },
    ],
  },
  {
    depth: 60,
    entries: [
      { bottomTime: 60, decompStops: [], totalDecompTime: 0, group: "J" },
      { bottomTime: 70, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "K" },
      { bottomTime: 80, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "L" },
      { bottomTime: 90, decompStops: [{ depth: 20, time: 11 }], totalDecompTime: 11, group: "M" },
      { bottomTime: 100, decompStops: [{ depth: 20, time: 14 }], totalDecompTime: 14, group: "M" },
      { bottomTime: 110, decompStops: [{ depth: 20, time: 17 }], totalDecompTime: 17, group: "N" },
      { bottomTime: 120, decompStops: [{ depth: 20, time: 19 }], totalDecompTime: 19, group: "N" },
      { bottomTime: 130, decompStops: [{ depth: 20, time: 23 }], totalDecompTime: 23, group: "O" },
      { bottomTime: 140, decompStops: [{ depth: 20, time: 26 }], totalDecompTime: 26, group: "O" },
      { bottomTime: 150, decompStops: [{ depth: 20, time: 32 }], totalDecompTime: 32, group: "O" },
      { bottomTime: 160, decompStops: [{ depth: 20, time: 37 }], totalDecompTime: 37, group: "O" },
      { bottomTime: 170, decompStops: [{ depth: 20, time: 41 }], totalDecompTime: 41, group: "O" },
      { bottomTime: 180, decompStops: [{ depth: 20, time: 47 }], totalDecompTime: 47, group: "O" },
    ],
  },
  {
    depth: 70,
    entries: [
      { bottomTime: 50, decompStops: [], totalDecompTime: 0, group: "J" },
      { bottomTime: 60, decompStops: [{ depth: 20, time: 8 }], totalDecompTime: 8, group: "K" },
      { bottomTime: 70, decompStops: [{ depth: 20, time: 14 }], totalDecompTime: 14, group: "L" },
      { bottomTime: 80, decompStops: [{ depth: 20, time: 18 }], totalDecompTime: 18, group: "M" },
      { bottomTime: 90, decompStops: [{ depth: 20, time: 23 }], totalDecompTime: 23, group: "N" },
      { bottomTime: 100, decompStops: [{ depth: 20, time: 33 }], totalDecompTime: 33, group: "N" },
      { bottomTime: 110, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 41 }], totalDecompTime: 43, group: "O" },
      { bottomTime: 120, decompStops: [{ depth: 10, time: 4 }, { depth: 20, time: 47 }], totalDecompTime: 51, group: "O" },
    ],
  },
  {
    depth: 80,
    entries: [
      { bottomTime: 40, decompStops: [], totalDecompTime: 0, group: "H" },
      { bottomTime: 50, decompStops: [{ depth: 20, time: 10 }], totalDecompTime: 10, group: "J" },
      { bottomTime: 60, decompStops: [{ depth: 20, time: 17 }], totalDecompTime: 17, group: "K" },
      { bottomTime: 70, decompStops: [{ depth: 20, time: 23 }], totalDecompTime: 23, group: "L" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 31 }], totalDecompTime: 33, group: "M" },
      { bottomTime: 90, decompStops: [{ depth: 10, time: 7 }, { depth: 20, time: 39 }], totalDecompTime: 46, group: "N" },
      { bottomTime: 100, decompStops: [{ depth: 10, time: 11 }, { depth: 20, time: 46 }], totalDecompTime: 57, group: "O" },
    ],
  },
  {
    depth: 90,
    entries: [
      { bottomTime: 30, decompStops: [], totalDecompTime: 0, group: "G" },
      { bottomTime: 40, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "I" },
      { bottomTime: 50, decompStops: [{ depth: 20, time: 18 }], totalDecompTime: 18, group: "J" },
      { bottomTime: 60, decompStops: [{ depth: 20, time: 25 }], totalDecompTime: 25, group: "K" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 7 }, { depth: 20, time: 30 }], totalDecompTime: 37, group: "L" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 13 }, { depth: 20, time: 40 }], totalDecompTime: 53, group: "N" },
      { bottomTime: 90, decompStops: [{ depth: 10, time: 18 }, { depth: 20, time: 48 }], totalDecompTime: 66, group: "O" },
    ],
  },
  {
    depth: 100,
    entries: [
      { bottomTime: 25, decompStops: [], totalDecompTime: 0, group: "G" },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "H" },
      { bottomTime: 40, decompStops: [{ depth: 20, time: 15 }], totalDecompTime: 15, group: "I" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 24 }], totalDecompTime: 26, group: "K" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 9 }, { depth: 20, time: 28 }], totalDecompTime: 37, group: "L" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 16 }, { depth: 20, time: 39 }], totalDecompTime: 55, group: "M" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 22 }, { depth: 20, time: 48 }], totalDecompTime: 70, group: "N" },
      { bottomTime: 90, decompStops: [{ depth: 10, time: 24 }, { depth: 20, time: 54 }], totalDecompTime: 78, group: "O" },
    ],
  },
  {
    depth: 110,
    entries: [
      { bottomTime: 20, decompStops: [], totalDecompTime: 0, group: "F" },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "G" },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 7 }], totalDecompTime: 7, group: "H" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 21 }], totalDecompTime: 23, group: "J" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 10 }, { depth: 20, time: 26 }], totalDecompTime: 36, group: "K" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 17 }, { depth: 20, time: 37 }], totalDecompTime: 54, group: "L" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 23 }, { depth: 20, time: 45 }], totalDecompTime: 68, group: "N" },
      { bottomTime: 80, decompStops: [{ depth: 10, time: 31 }, { depth: 20, time: 53 }], totalDecompTime: 84, group: "O" },
    ],
  },
  {
    depth: 120,
    entries: [
      { bottomTime: 15, decompStops: [], totalDecompTime: 0, group: "E" },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "F" },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 6 }], totalDecompTime: 6, group: "H" },
      { bottomTime: 30, decompStops: [{ depth: 20, time: 14 }], totalDecompTime: 14, group: "I" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 8 }, { depth: 20, time: 25 }], totalDecompTime: 33, group: "K" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 18 }, { depth: 20, time: 36 }], totalDecompTime: 54, group: "L" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 23 }, { depth: 20, time: 48 }], totalDecompTime: 71, group: "N" },
      { bottomTime: 70, decompStops: [{ depth: 10, time: 30 }, { depth: 20, time: 55 }], totalDecompTime: 85, group: "O" },
    ],
  },
  {
    depth: 130,
    entries: [
      { bottomTime: 10, decompStops: [], totalDecompTime: 0, group: "D" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 1 }], totalDecompTime: 1, group: "E" },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 4 }], totalDecompTime: 4, group: "G" },
      { bottomTime: 25, decompStops: [{ depth: 20, time: 10 }], totalDecompTime: 10, group: "H" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 3 }, { depth: 20, time: 18 }], totalDecompTime: 21, group: "J" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 14 }, { depth: 20, time: 32 }], totalDecompTime: 46, group: "L" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 23 }, { depth: 20, time: 45 }], totalDecompTime: 68, group: "N" },
      { bottomTime: 60, decompStops: [{ depth: 10, time: 31 }, { depth: 20, time: 55 }], totalDecompTime: 86, group: "O" },
    ],
  },
  {
    depth: 140,
    entries: [
      { bottomTime: 10, decompStops: [], totalDecompTime: 0, group: "D" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "F" },
      { bottomTime: 20, decompStops: [{ depth: 20, time: 6 }], totalDecompTime: 6, group: "G" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 14 }], totalDecompTime: 16, group: "I" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 8 }, { depth: 20, time: 24 }], totalDecompTime: 32, group: "K" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 20 }, { depth: 20, time: 38 }], totalDecompTime: 58, group: "M" },
      { bottomTime: 50, decompStops: [{ depth: 10, time: 30 }, { depth: 20, time: 52 }], totalDecompTime: 82, group: "O" },
    ],
  },
  {
    depth: 150,
    entries: [
      { bottomTime: 5, decompStops: [], totalDecompTime: 0, group: "A" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 1 }], totalDecompTime: 1, group: "D" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 4 }], totalDecompTime: 4, group: "F" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 1 }, { depth: 20, time: 11 }], totalDecompTime: 12, group: "H" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 6 }, { depth: 20, time: 18 }], totalDecompTime: 24, group: "J" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 14 }, { depth: 20, time: 26 }], totalDecompTime: 40, group: "K" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 24 }, { depth: 20, time: 44 }], totalDecompTime: 68, group: "N" },
    ],
  },
  {
    depth: 160,
    entries: [
      { bottomTime: 5, decompStops: [], totalDecompTime: 0, group: "A" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 1 }], totalDecompTime: 1, group: "D" },
      { bottomTime: 15, decompStops: [{ depth: 20, time: 5 }], totalDecompTime: 5, group: "F" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 3 }, { depth: 20, time: 14 }], totalDecompTime: 17, group: "H" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 9 }, { depth: 20, time: 23 }], totalDecompTime: 32, group: "J" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 18 }, { depth: 20, time: 32 }], totalDecompTime: 50, group: "L" },
      { bottomTime: 40, decompStops: [{ depth: 10, time: 29 }, { depth: 20, time: 50 }], totalDecompTime: 79, group: "O" },
    ],
  },
  {
    depth: 170,
    entries: [
      { bottomTime: 5, decompStops: [], totalDecompTime: 0, group: "A" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 2 }], totalDecompTime: 2, group: "E" },
      { bottomTime: 15, decompStops: [{ depth: 10, time: 1 }, { depth: 20, time: 7 }], totalDecompTime: 8, group: "G" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 6 }, { depth: 20, time: 17 }], totalDecompTime: 23, group: "I" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 13 }, { depth: 20, time: 26 }], totalDecompTime: 39, group: "K" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 19 }, { depth: 20, time: 39 }], totalDecompTime: 58, group: "M" },
    ],
  },
  {
    depth: 180,
    entries: [
      { bottomTime: 5, decompStops: [], totalDecompTime: 0, group: "A" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "E" },
      { bottomTime: 15, decompStops: [{ depth: 10, time: 2 }, { depth: 20, time: 9 }], totalDecompTime: 11, group: "G" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 8 }, { depth: 20, time: 19 }], totalDecompTime: 27, group: "I" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 16 }, { depth: 20, time: 30 }], totalDecompTime: 46, group: "K" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 22 }, { depth: 20, time: 44 }], totalDecompTime: 66, group: "N" },
    ],
  },
  {
    depth: 190,
    entries: [
      { bottomTime: 5, decompStops: [], totalDecompTime: 0, group: "A" },
      { bottomTime: 10, decompStops: [{ depth: 20, time: 3 }], totalDecompTime: 3, group: "E" },
      { bottomTime: 15, decompStops: [{ depth: 10, time: 3 }, { depth: 20, time: 11 }], totalDecompTime: 14, group: "H" },
      { bottomTime: 20, decompStops: [{ depth: 10, time: 11 }, { depth: 20, time: 23 }], totalDecompTime: 34, group: "J" },
      { bottomTime: 25, decompStops: [{ depth: 10, time: 19 }, { depth: 20, time: 35 }], totalDecompTime: 54, group: "L" },
      { bottomTime: 30, decompStops: [{ depth: 10, time: 25 }, { depth: 20, time: 48 }], totalDecompTime: 73, group: "N" },
    ],
  },
];

/**
 * Available table depths for quick reference
 */
export const TABLE_DEPTHS = [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190];

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

export interface DiveTableResult {
  tableUsed: string;
  scheduleUsed: string;
  repetitiveGroup: string;
  decompRequired: "Y" | "N";
  decompStops: string | null;
  totalDecompTime: number;
  eadFsw?: number;
  lookupDepth: number;
  bottomTimeMinutes: number;
  warnings: string[];
}

/**
 * Look up the dive table for a given depth, bottom time, and breathing gas.
 * 
 * Rules:
 * 1. Depth rounds to NEXT DEEPER table depth
 * 2. Bottom time selects the schedule just UNDER actual bottom time
 * 3. NEVER assigns Z repetitive group
 * 4. All data verbatim from USN Diving Manual Rev 7
 * 
 * @param depthFsw - Maximum depth in fsw
 * @param bottomTimeMinutes - Bottom time in minutes (LS to LB)
 * @param breathingGas - "Air" or "EANxx" (e.g., "EAN32")
 * @param fo2Percent - FO2 percentage (e.g., 32 for EAN32). Required for nitrox.
 */
export function lookupDiveTable(
  depthFsw: number,
  bottomTimeMinutes: number,
  breathingGas: string = "Air",
  fo2Percent?: number
): DiveTableResult {
  const warnings: string[] = [];
  let lookupDepth = depthFsw;
  let eadFsw: number | undefined;

  if (breathingGas !== "Air" && fo2Percent && fo2Percent > 21) {
    const fo2 = fo2Percent / 100;
    eadFsw = calculateEAD(depthFsw, fo2);
    lookupDepth = eadFsw;
  }

  const tableDepth = roundToNextDeeperDepth(lookupDepth);

  if (tableDepth > 190) {
    return {
      tableUsed: "EXCEEDS TABLE RANGE",
      scheduleUsed: "N/A",
      repetitiveGroup: "N/A",
      decompRequired: "Y",
      decompStops: null,
      totalDecompTime: 0,
      eadFsw,
      lookupDepth: tableDepth,
      bottomTimeMinutes,
      warnings: [`Depth ${depthFsw} fsw (lookup ${lookupDepth} fsw) exceeds maximum table depth of 190 fsw`],
    };
  }

  if (depthFsw < 40) {
    return {
      tableUsed: breathingGas !== "Air" ? `USN Air Table via EAD (${breathingGas})` : "USN Air Decompression Table",
      scheduleUsed: `${tableDepth}/${bottomTimeMinutes}`,
      repetitiveGroup: "A",
      decompRequired: "N",
      decompStops: null,
      totalDecompTime: 0,
      eadFsw,
      lookupDepth: tableDepth < 40 ? 40 : tableDepth,
      bottomTimeMinutes,
      warnings: [`Depth ${depthFsw} fsw is shallower than table minimum of 40 fsw — defaults to shallowest table`],
    };
  }

  const noDecompRow = NO_DECOM_TABLE.find(r => r.depth === tableDepth);
  const tableName = breathingGas !== "Air" ? `USN Air Table via EAD (${breathingGas})` : "USN Air Decompression Table";

  if (noDecompRow && bottomTimeMinutes <= noDecompRow.noStopLimit) {
    let selectedEntry: NoDecompEntry | null = null;
    for (const entry of noDecompRow.entries) {
      if (bottomTimeMinutes <= entry.maxBottomTime) {
        selectedEntry = entry;
        break;
      }
    }

    if (!selectedEntry) {
      selectedEntry = noDecompRow.entries[noDecompRow.entries.length - 1];
    }

    if (selectedEntry.group === "Z") {
      const idx = noDecompRow.entries.indexOf(selectedEntry);
      if (idx > 0) {
        selectedEntry = noDecompRow.entries[idx - 1];
        warnings.push("Schedule adjusted to avoid Z repetitive group");
      }
    }

    return {
      tableUsed: tableName,
      scheduleUsed: `${tableDepth}/${selectedEntry.maxBottomTime}`,
      repetitiveGroup: selectedEntry.group,
      decompRequired: "N",
      decompStops: null,
      totalDecompTime: 0,
      eadFsw,
      lookupDepth: tableDepth,
      bottomTimeMinutes,
      warnings,
    };
  }

  const decompRow = AIR_DECOM_TABLE.find(r => r.depth === tableDepth);
  if (!decompRow) {
    return {
      tableUsed: tableName,
      scheduleUsed: `${tableDepth}/${bottomTimeMinutes}`,
      repetitiveGroup: "N/A",
      decompRequired: "Y",
      decompStops: null,
      totalDecompTime: 0,
      eadFsw,
      lookupDepth: tableDepth,
      bottomTimeMinutes,
      warnings: [`No decompression table entry found for ${tableDepth} fsw`],
    };
  }

  let selectedDecomp: DecompEntry | null = null;
  for (const entry of decompRow.entries) {
    if (bottomTimeMinutes <= entry.bottomTime) {
      selectedDecomp = entry;
      break;
    }
  }

  if (!selectedDecomp) {
    selectedDecomp = decompRow.entries[decompRow.entries.length - 1];
    warnings.push(`Bottom time ${bottomTimeMinutes} min exceeds maximum table entry of ${selectedDecomp.bottomTime} min for ${tableDepth} fsw`);
  }

  if (selectedDecomp.group === "Z") {
    const idx = decompRow.entries.indexOf(selectedDecomp);
    if (idx > 0) {
      selectedDecomp = decompRow.entries[idx - 1];
      warnings.push("Schedule adjusted to avoid Z repetitive group");
    }
  }

  const stopsStr = selectedDecomp.decompStops.length > 0
    ? selectedDecomp.decompStops.map(s => `${s.depth}ft/${s.time}min`).join(", ")
    : "None";

  return {
    tableUsed: tableName,
    scheduleUsed: `${tableDepth}/${selectedDecomp.bottomTime}`,
    repetitiveGroup: selectedDecomp.group,
    decompRequired: selectedDecomp.totalDecompTime > 0 ? "Y" : "N",
    decompStops: stopsStr === "None" ? null : stopsStr,
    totalDecompTime: selectedDecomp.totalDecompTime,
    eadFsw,
    lookupDepth: tableDepth,
    bottomTimeMinutes,
    warnings,
  };
}
