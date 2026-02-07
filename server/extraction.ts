/**
 * Deterministic Classification & Extraction for LogEvents
 * 
 * Classification rules:
 * - LS/LB/RS keywords => dive_op
 * - directive/client/OICC/NAVFAC/stop work/hold => directive
 * - incident/injury/near miss/shock/explosion/hydrogen => safety
 * - else => ops/general
 * 
 * Extraction rules:
 * - Parse diver initials
 * - Parse LS/LB/RS times with common synonyms/typos
 * - Parse depth formats (40 fsw/40 ft/40 FSW)
 */

export type EventCategory = "dive_op" | "directive" | "safety" | "ops" | "general";

export interface ExtractedData {
  diverInitials?: string[];
  diverNames?: string[];
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  depthFsw?: number;
  diveOperation?: "ls" | "rb" | "lb" | "rs";
  taskSummary?: string;
  taskDescription?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Classification Rules
// ────────────────────────────────────────────────────────────────────────────

const DIVE_OP_PATTERNS = [
  /\bLS\b/i,
  /\bLB\b/i,
  /\bRS\b/i,
  /\bRB\b/i,
  /\bL\/S\b/i,
  /\bL\/B\b/i,
  /\bR\/S\b/i,
  /\bR\/B\b/i,
  /\bleave\s*surface/i,
  /\bleft\s*surface/i,
  /\bon\s*bottom/i,
  /\bleaving\s*bottom/i,
  /\bleft\s*bottom/i,
  /\breached?\s*bottom/i,
  /\breached?\s*surface/i,
  /\bsurfaced?\b/i,
  /\bmark\s*time/i,
  /\bdiver\s*(up|down)/i,
  /\bdiving/i,
  /\bdive\s*#?\d*/i,
];

const DIRECTIVE_PATTERNS = [
  /\bdirective\b/i,
  /\bclient\b/i,
  /\bOICC\b/i,
  /\bNAVFAC\b/i,
  /\bstop\s*work/i,
  /\bhold\b/i,
  /\bstanddown/i,
  /\bstand\s*down/i,
  /\border\b/i,
  /\brequested\s*by/i,
  /\bper\s+(client|PM|supervisor)/i,
];

const SAFETY_PATTERNS = [
  /\bincident\b/i,
  /\binjury\b/i,
  /\bnear\s*miss/i,
  /\bshock\b/i,
  /\bexplosion\b/i,
  /\bhydrogen\b/i,
  /\bemergency\b/i,
  /\baccident\b/i,
  /\bhazard\b/i,
  /\bunsafe\b/i,
  /\bDCS\b/i,
  /\bdecompression\s*sickness/i,
  /\bbarotrauma/i,
  /\bmedical\b/i,
  /\bfirst\s*aid/i,
];

export function classifyEvent(rawText: string): EventCategory {
  // Check in priority order: safety > directive > dive_op > ops
  for (const pattern of SAFETY_PATTERNS) {
    if (pattern.test(rawText)) return "safety";
  }
  
  for (const pattern of DIRECTIVE_PATTERNS) {
    if (pattern.test(rawText)) return "directive";
  }
  
  for (const pattern of DIVE_OP_PATTERNS) {
    if (pattern.test(rawText)) return "dive_op";
  }
  
  return "ops";
}

// ────────────────────────────────────────────────────────────────────────────
// Extraction Rules
// ────────────────────────────────────────────────────────────────────────────

// Common initials pattern: 2-3 uppercase letters
const INITIALS_PATTERN = /\b([A-Z]{2,3})\b/g;

// Time patterns: HHMM or HH:MM
const TIME_PATTERN = /(\d{1,2}):?(\d{2})/g;

// LS/RB/LB/RS synonyms
const LS_SYNONYMS = [/\bLS\b/i, /\bL\/S\b/i, /\bleave\s*surface/i, /\bleft\s*surface/i, /\bdiver\s*down/i, /\bsubmerg/i];
const RB_SYNONYMS = [/\bRB\b/i, /\bR\/B\b/i, /\bon\s*bottom/i, /\breached?\s*bottom/i];
const LB_SYNONYMS = [/\bLB\b/i, /\bL\/B\b/i, /\bleaving\s*bottom/i, /\bleft?\s*bottom/i, /\bascending/i];
const RS_SYNONYMS = [/\bRS\b/i, /\bR\/S\b/i, /\bsurfaced?\b/i, /\bon\s*surface/i, /\breached?\s*surface/i, /\bdiver\s*up/i];

// Depth patterns: 40 fsw, 40 ft, 40 feet, 40'
const DEPTH_PATTERN = /(\d+)\s*(?:fsw|ft|feet|'|foot)/i;

const NON_INITIALS = new Set(["LS", "LB", "RS", "RB", "AM", "PM", "FSW", "PSI", "DCS", "AIS", "DRA", "LWT", "PFU", "QC", "QA", "ID", "OK", "TBD", "GDS", "ATC"]);

const DIVER_NAME_PATTERNS = [
  /(?:Diver\s+)?([A-Z])\.\s*([A-Z][a-z]+)/g,
  /(?:Diver\s+)?([A-Z][a-z]+)\s+([A-Z][a-z]+)/g,
];

function extractDiverNames(rawText: string): { names: string[]; initials: string[] } {
  const names: string[] = [];
  const initials: string[] = [];
  
  for (const pattern of DIVER_NAME_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(rawText)) !== null) {
      const fullMatch = match[0];
      if (/^(Diver\s+)?[A-Z]\.\s*[A-Z][a-z]+/.test(fullMatch)) {
        const first = match[1];
        const last = match[2];
        const name = `${first}.${last}`;
        if (!names.includes(name)) {
          names.push(name);
          const init = `${first}${last[0]}`.toUpperCase();
          if (!initials.includes(init)) initials.push(init);
        }
      } else if (/^(Diver\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+/.test(fullMatch)) {
        const first = match[1];
        const last = match[2];
        const name = `${first} ${last}`;
        if (!names.includes(name) && !["Diver RS", "Diver LS", "Diver LB", "Diver RB"].some(s => fullMatch.includes(s))) {
          names.push(name);
          const init = `${first[0]}${last[0]}`.toUpperCase();
          if (!initials.includes(init)) initials.push(init);
        }
      }
    }
  }
  
  const standaloneInitials = rawText.match(INITIALS_PATTERN);
  if (standaloneInitials) {
    for (const m of standaloneInitials) {
      const upper = m.toUpperCase();
      if (!NON_INITIALS.has(upper) && !initials.includes(upper)) {
        initials.push(upper);
      }
    }
  }
  
  return { names, initials };
}

function extractTaskDescription(rawText: string): string | undefined {
  const diveOpStripped = rawText
    .replace(/^\d{3,4}\s*/, '')
    .replace(/\b(?:Diver\s+)?(?:[A-Z]\.\s*[A-Z][a-z]+|[A-Z][a-z]+\s+[A-Z][a-z]+|[A-Z]{2,3})\s+(?:L\/?S|R\/?S|L\/?B|R\/?B)\b/gi, '')
    .replace(/\s+to\s+/, ' ')
    .trim();
  
  if (diveOpStripped.length > 5) {
    return diveOpStripped;
  }
  return undefined;
}

export function extractData(rawText: string): ExtractedData {
  const extracted: ExtractedData = {};
  
  const { names, initials } = extractDiverNames(rawText);
  if (names.length > 0) extracted.diverNames = names;
  if (initials.length > 0) extracted.diverInitials = initials;
  
  for (const pattern of LS_SYNONYMS) {
    if (pattern.test(rawText)) {
      extracted.diveOperation = "ls";
      break;
    }
  }
  if (!extracted.diveOperation) {
    for (const pattern of RB_SYNONYMS) {
      if (pattern.test(rawText)) {
        extracted.diveOperation = "rb";
        break;
      }
    }
  }
  if (!extracted.diveOperation) {
    for (const pattern of LB_SYNONYMS) {
      if (pattern.test(rawText)) {
        extracted.diveOperation = "lb";
        break;
      }
    }
  }
  if (!extracted.diveOperation) {
    for (const pattern of RS_SYNONYMS) {
      if (pattern.test(rawText)) {
        extracted.diveOperation = "rs";
        break;
      }
    }
  }
  
  if (/\bL\/?S\b/i.test(rawText) && !extracted.diveOperation) {
    extracted.diveOperation = "ls";
  }
  if (/\bR\/?B\b/i.test(rawText) && !extracted.diveOperation) {
    extracted.diveOperation = "rb";
  }
  if (/\bL\/?B\b/i.test(rawText) && !extracted.diveOperation) {
    extracted.diveOperation = "lb";
  }
  if (/\bR\/?S\b/i.test(rawText) && !extracted.diveOperation) {
    extracted.diveOperation = "rs";
  }
  
  const timeMatches = Array.from(rawText.matchAll(TIME_PATTERN));
  if (timeMatches.length > 0) {
    const firstTime = timeMatches[0];
    const timeStr = `${firstTime[1].padStart(2, '0')}:${firstTime[2]}`;
    
    switch (extracted.diveOperation) {
      case "ls": extracted.lsTime = timeStr; break;
      case "rb": extracted.rbTime = timeStr; break;
      case "lb": extracted.lbTime = timeStr; break;
      case "rs": extracted.rsTime = timeStr; break;
    }
  }
  
  const depthMatch = rawText.match(DEPTH_PATTERN);
  if (depthMatch) {
    extracted.depthFsw = parseInt(depthMatch[1], 10);
  }
  
  if (extracted.diveOperation) {
    extracted.taskDescription = extractTaskDescription(rawText);
  }
  
  return extracted;
}

// ────────────────────────────────────────────────────────────────────────────
// Parse HHMM from raw text for eventTime derivation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse typed HHMM from raw text.
 * Returns Date if found, null otherwise.
 * The date portion comes from the current day context.
 */
export function parseEventTime(rawText: string, dayDate: string): Date | null {
  // Look for explicit HHMM at the start of the text or after common prefixes
  // Patterns: "0830", "08:30", "0830:", "@0830", "at 0830"
  const explicitTimePattern = /(?:^|@|at\s+)(\d{1,2}):?(\d{2})\b/i;
  const match = rawText.match(explicitTimePattern);
  
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const [year, month, day] = dayDate.split('-').map(Number);
      return new Date(year, month - 1, day, hours, minutes, 0);
    }
  }
  
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Risk ID generation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate risk ID in format RR-###
 * Per compliance framework: Risk IDs use RR-001, RR-002, etc. — never reused
 */
export function generateRiskId(date: string, sequence: number): string {
  const seqStr = sequence.toString().padStart(3, '0');
  return `RR-${seqStr}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Master Log Section Classification
// ────────────────────────────────────────────────────────────────────────────

export type MasterLogSection = "ops" | "dive" | "directives" | "safety" | "risk";

export function getMasterLogSection(category: EventCategory): MasterLogSection {
  switch (category) {
    case "dive_op":
      return "dive";
    case "directive":
      return "directives";
    case "safety":
      return "safety";
    default:
      return "ops";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic Internal Canvas Line Rendering
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic internal canvas line from a LogEvent.
 * This always works even if AI fails.
 */
export function renderInternalCanvasLine(
  rawText: string,
  eventTime: Date,
  category: EventCategory,
  extracted: ExtractedData
): string {
  const timeStr = eventTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  // Add category tag
  const categoryTag = `[${category.toUpperCase()}]`;
  
  // Build the line
  let line = `${timeStr} ${categoryTag} ${rawText.trim()}`;
  
  // Add extracted info if available
  const extras: string[] = [];
  if (extracted.diverInitials?.length) {
    extras.push(`Diver: ${extracted.diverInitials.join(', ')}`);
  }
  if (extracted.depthFsw) {
    extras.push(`${extracted.depthFsw} fsw`);
  }
  
  if (extras.length > 0) {
    line += ` [${extras.join(' | ')}]`;
  }
  
  return line;
}
