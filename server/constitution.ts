/**
 * DiveOps™ Constitution - Hard Rules for Document Generation
 * 
 * These rules are NON-NEGOTIABLE and must be enforced before any document
 * is generated or AI content is accepted.
 */

// ────────────────────────────────────────────────────────────────────────────
// DIVE TABLE PROHIBITION (CRITICAL SAFETY)
// ────────────────────────────────────────────────────────────────────────────

export const DIVE_TABLE_PROHIBITION = {
  description: "AI must NEVER calculate, generalize, or infer dive-related data",
  prohibitedPatterns: [
    /no[- ]?decompression limit/i,
    /NDL/i,
    /bottom time/i,
    /surface interval/i,
    /repetitive dive/i,
    /decompression stop/i,
    /decompression schedule/i,
    /dive table/i,
    /\d+\s*minutes?\s*(at|@)\s*\d+\s*(ft|feet|fsw|msw)/i,
  ],
  allowedSources: ["U.S. Navy Dive Manual"],
  message: "Dive table data must only be quoted VERBATIM from U.S. Navy Dive Manual",
};

// ────────────────────────────────────────────────────────────────────────────
// TIMESTAMP RULES
// ────────────────────────────────────────────────────────────────────────────

// Bug fix #8: TIMESTAMP_REGEX matches standalone 24-hour timestamps (HHMM)
// Word boundaries ensure we don't match timestamps embedded in words
export const TIMESTAMP_REGEX = /\b([01]\d|2[0-3])[0-5]\d\b/;

export const TIMESTAMP_RULES = {
  supervisorLog: {
    required: true,
    description: "Every supervisor log entry MUST have a 24-hour timestamp",
  },
  masterLog: {
    timestampedSections: ["directives", "safety", "jv_oicc"],
    groupedSections: ["ops", "dive"],
    description: "Master log timestamps ONLY for JV/OICC directives, changes, reversals, access, safety",
  },
};

// ────────────────────────────────────────────────────────────────────────────
// FORBIDDEN PATTERNS IN GENERATED CONTENT
// ────────────────────────────────────────────────────────────────────────────

export const FORBIDDEN_IN_MASTER_LOG = [
  "AM",
  "PM", 
  "a.m.",
  "p.m.",
  "[PLACEHOLDER]",
  "[TODO]",
  "[TBD]",
  "lorem ipsum",
];

export const FORBIDDEN_IN_STATIONS = [
  "[",
  "]",
  "AM",
  "PM",
];

// ────────────────────────────────────────────────────────────────────────────
// REQUIRED STRUCTURE FOR MASTER LOG EXPORT
// ────────────────────────────────────────────────────────────────────────────

export const REQUIRED_MASTER_LOG_KEYS = [
  "date",
  "shift",
  "projectName",
  "sections",
] as const;

export const REQUIRED_SECTION_KEYS = [
  "ops",
  "dive", 
  "directives",
  "safety",
  "risk",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// TERMINOLOGY RULES
// ────────────────────────────────────────────────────────────────────────────

export const TERMINOLOGY = {
  clientTerms: {
    preferred: "Client",
    alternatives: ["JV", "OICC", "JV/OICC", "Joint Venture", "Officer in Charge of Construction"],
    description: "Always refer to JV/OICC as 'Client' in master log",
  },
  diveTimestamps: {
    ls: "Left Surface",
    rb: "Reached Bottom",
    lb: "Left Bottom",
    rs: "Reached Surface",
  },
};

// ────────────────────────────────────────────────────────────────────────────
// AI GENERATION CONSTRAINTS
// ────────────────────────────────────────────────────────────────────────────

export const AI_CONSTRAINTS = {
  mustPreserve: [
    "diver names",
    "diver initials",
    "equipment names",
    "measurements",
    "depths",
    "times",
    "task descriptions",
  ],
  mustNotGenerate: [
    "dive times",
    "bottom times", 
    "decompression schedules",
    "surface intervals",
    "repetitive dive calculations",
    "no-decompression limits",
  ],
  mustNotParaphrase: [
    "dive table data",
    "U.S. Navy Dive Manual content",
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// DOCUMENT FORMAT RULES
// ────────────────────────────────────────────────────────────────────────────

export const DOCUMENT_FORMAT = {
  timeFormat: "24-hour (HHMM)",
  dateFormat: "YYYY-MM-DD",
  depthUnit: "fsw",
  forbiddenTimeFormats: ["AM", "PM", "a.m.", "p.m.", "12-hour"],
};
