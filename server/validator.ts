/**
 * DiveOps™ Validator - Enforces Constitution Rules
 * 
 * All document generation and AI content must pass through this validator
 * before being accepted or exported.
 */

import {
  DIVE_TABLE_PROHIBITION,
  TIMESTAMP_REGEX,
  FORBIDDEN_IN_MASTER_LOG,
  FORBIDDEN_IN_STATIONS,
  REQUIRED_MASTER_LOG_KEYS,
  REQUIRED_SECTION_KEYS,
  TERMINOLOGY,
  AI_CONSTRAINTS,
} from "./constitution";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: "critical" | "error";
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
}

export interface MasterLogPayload {
  date: string;
  shift: string;
  projectName: string;
  sections: {
    ops: LogEntry[];
    dive: LogEntry[];
    directives: LogEntry[];
    safety: LogEntry[];
    risk: LogEntry[];
  };
  dives?: DiveEntry[];
  summary?: Record<string, any>;
}

export interface LogEntry {
  id: string;
  eventTime: string;
  rawText: string;
  masterLogLine: string;
  status: string;
}

export interface DiveEntry {
  id: string;
  diveNumber: number;
  diverId: string;
  diverName?: string;
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  maxDepthFsw?: number;
}

/**
 * Validates Master Log payload before document generation
 */
export function validateMasterLogPayload(payload: MasterLogPayload): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check required top-level keys
  for (const key of REQUIRED_MASTER_LOG_KEYS) {
    if (!(key in payload)) {
      errors.push({
        code: "MISSING_REQUIRED_KEY",
        message: `Missing required key: ${key}`,
        field: key,
        severity: "critical",
      });
    }
  }

  // Check required section keys
  if (payload.sections) {
    for (const key of REQUIRED_SECTION_KEYS) {
      if (!(key in payload.sections)) {
        errors.push({
          code: "MISSING_SECTION",
          message: `Missing required section: ${key}`,
          field: `sections.${key}`,
          severity: "error",
        });
      }
    }
  }

  // Validate each section
  if (payload.sections) {
    for (const [sectionName, entries] of Object.entries(payload.sections)) {
      for (const entry of entries as LogEntry[]) {
        const entryErrors = validateLogEntry(entry, sectionName);
        errors.push(...entryErrors);
      }
    }
  }

  // Validate dives
  if (payload.dives) {
    for (const dive of payload.dives) {
      const diveErrors = validateDiveEntry(dive);
      errors.push(...diveErrors);
    }
  }

  return {
    valid: errors.filter(e => e.severity === "critical").length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a single log entry
 */
function validateLogEntry(entry: LogEntry, section: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for forbidden patterns in master log line
  for (const forbidden of FORBIDDEN_IN_MASTER_LOG) {
    if (entry.masterLogLine?.toLowerCase().includes(forbidden.toLowerCase())) {
      errors.push({
        code: "FORBIDDEN_PATTERN",
        message: `Forbidden pattern "${forbidden}" found in master log line`,
        field: `${section}.${entry.id}.masterLogLine`,
        severity: "error",
      });
    }
  }

  // Check for dive table violations
  for (const pattern of DIVE_TABLE_PROHIBITION.prohibitedPatterns) {
    if (pattern.test(entry.masterLogLine || "")) {
      errors.push({
        code: "DIVE_TABLE_VIOLATION",
        message: `Potential dive table data found: ${DIVE_TABLE_PROHIBITION.message}`,
        field: `${section}.${entry.id}.masterLogLine`,
        severity: "critical",
      });
    }
  }

  return errors;
}

/**
 * Validates a dive entry
 */
function validateDiveEntry(dive: DiveEntry): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate timestamp format (should be 24-hour HHMM)
  const timeFields = ["lsTime", "rbTime", "lbTime", "rsTime"] as const;
  for (const field of timeFields) {
    const value = dive[field];
    if (value && !TIMESTAMP_REGEX.test(value)) {
      errors.push({
        code: "INVALID_TIMESTAMP_FORMAT",
        message: `Invalid timestamp format for ${field}: ${value}. Must be 24-hour HHMM format.`,
        field: `dive.${dive.id}.${field}`,
        severity: "error",
      });
    }
  }

  return errors;
}

/**
 * Validates AI-generated content before acceptance
 */
export function validateAIContent(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for dive table prohibition violations
  for (const pattern of DIVE_TABLE_PROHIBITION.prohibitedPatterns) {
    if (pattern.test(content)) {
      errors.push({
        code: "AI_DIVE_TABLE_VIOLATION",
        message: `AI generated prohibited dive table content. ${DIVE_TABLE_PROHIBITION.message}`,
        severity: "critical",
      });
    }
  }

  // Check for forbidden patterns
  for (const forbidden of FORBIDDEN_IN_MASTER_LOG) {
    if (content.toLowerCase().includes(forbidden.toLowerCase())) {
      warnings.push({
        code: "AI_FORBIDDEN_PATTERN",
        message: `AI content contains potentially forbidden pattern: "${forbidden}"`,
      });
    }
  }

  // Check for 12-hour time format (should be 24-hour)
  if (/\d{1,2}:\d{2}\s*(AM|PM|a\.m\.|p\.m\.)/i.test(content)) {
    errors.push({
      code: "INVALID_TIME_FORMAT",
      message: "AI content uses 12-hour time format. Must use 24-hour format (HHMM).",
      severity: "error",
    });
  }

  return {
    valid: errors.filter(e => e.severity === "critical").length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates raw log text before processing
 */
export function validateRawLogText(text: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for timestamp at start of entry
  const lines = text.trim().split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !TIMESTAMP_REGEX.test(trimmed.substring(0, 4))) {
      warnings.push({
        code: "MISSING_TIMESTAMP",
        message: `Log entry may be missing timestamp: "${trimmed.substring(0, 30)}..."`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Sanitizes content by replacing forbidden patterns
 */
export function sanitizeForMasterLog(content: string): string {
  let sanitized = content;

  // Replace JV/OICC with Client
  // Bug fix #6: Escape special regex characters and handle compound terms first
  for (const term of TERMINOLOGY.clientTerms.alternatives) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedTerm, 'gi');
    sanitized = sanitized.replace(regex, TERMINOLOGY.clientTerms.preferred);
  }
  
  // Fix multiple "Client" replacements (e.g., "JV/OICC" -> "Client/Client")
  sanitized = sanitized.replace(/Client\/Client/g, 'Client');

  // Convert 12-hour to 24-hour time
  // Bug fix #7 & #9: Handle AM/PM, a.m./p.m., and proper conversion
  sanitized = sanitized.replace(
    /(\d{1,2}):(\d{2})\s*(AM|PM|a\.m\.|p\.m\.)/gi,
    (match, hour, min, ampm) => {
      let h = parseInt(hour, 10);
      const upperAmpm = ampm.toUpperCase().replace(/\./g, '');
      if (upperAmpm === 'PM' && h !== 12) h += 12;
      if (upperAmpm === 'AM' && h === 12) h = 0;
      return `${h.toString().padStart(2, '0')}${min}`;
    }
  );

  return sanitized;
}

/**
 * Validates a timestamp string in ISO 8601 format
 * @param timestamp - Timestamp string to validate
 * @returns true if valid ISO 8601 timestamp, false otherwise
 */
export function validateTimestamp(timestamp: any): boolean {
  if (typeof timestamp !== 'string') return false;
  if (!timestamp || timestamp.trim() === '') return false;

  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (!iso8601Regex.test(timestamp)) return false;

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return false;

  // Validate month and day ranges
  const [year, month, day] = timestamp.split('T')[0].split('-').map(Number);
  const [hour, minute, second] = timestamp.split('T')[1].split(':').map(Number);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;

  return true;
}

/**
 * Formats a 12-hour time string to 24-hour format
 * @param time12 - Time in 12-hour format (e.g., "10:30 AM", "02:45 p.m.")
 * @returns Time in 24-hour format (e.g., "10:30", "14:45") or original if invalid
 */
export function formatTimeTo24Hour(time12: string): string {
  if (!time12 || typeof time12 !== 'string') return time12;
  if (time12.trim() === '') return time12;

  const time12Regex = /^(\d{1,2}):(\d{2})\s*(AM|PM|a\.m\.|p\.m\.)$/i;
  const match = time12.match(time12Regex);

  if (!match) return time12;

  let [, hourStr, minuteStr, ampm] = match;
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr;
  const upperAmpm = ampm.toUpperCase().replace(/\./g, '');

  if (upperAmpm === 'PM' && hour !== 12) {
    hour += 12;
  } else if (upperAmpm === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${hour.toString().padStart(2, '0')}:${minute}`;
}
