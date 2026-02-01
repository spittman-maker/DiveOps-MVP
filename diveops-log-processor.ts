/**
 * DiveOps™ Structured Log Processor Module
 * 
 * A standalone Node.js/TypeScript module for normalizing, classifying,
 * and validating dive operations log entries.
 * 
 * Usage:
 *   import { normalizeLines, classify, validatePayload, processStructuredLog } from './diveops-log-processor';
 * 
 * Dependencies:
 *   - openai (npm install openai)
 * 
 * Environment Variables:
 *   - AI_INTEGRATIONS_OPENAI_API_KEY: OpenAI API key
 *   - AI_INTEGRATIONS_OPENAI_BASE_URL: OpenAI base URL (optional)
 */

import OpenAI from "openai";

// ============================================================================
// TYPES
// ============================================================================

export type RawLine = { raw: string; time?: string | null };

export interface DirectiveEntry {
  time: string;
  text: string;
}

export interface StationLogEntry {
  text: string;
}

export interface RiskEntry {
  riskId: string;
  description: string;
  source: string;
}

export interface StructuredLogPayload {
  directives: DirectiveEntry[];
  station_logs: StationLogEntry[];
  risks: RiskEntry[];
}

export type Classified = {
  directives: RawLine[];
  station: RawLine[];
  questions: RawLine[];
};

export interface ProcessedLogResult {
  payload: StructuredLogPayload;
  rawInput: string;
  classified: Classified;
  validationPassed: boolean;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// NORMALIZER
// ============================================================================

const TIME_RE = /\[(\d{2}:\d{2})\]|\b(\d{2}:\d{2})\b/;

const GARBAGE_PATTERNS: RegExp[] = [
  /^\s*\d{4}\.?\s*$/i,
  /^\s*0:\d{3}\s*$/i,
  /^\s*rs\s*$/i,
  /^\s*ops(.*)?as scheduled\s*$/i,
  /^\s*operational activities continued as scheduled\s*$/i,
];

/**
 * Extract individual lines from raw text input with optional timestamps
 */
export function extractLines(text: string): RawLine[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(raw => {
      const m = raw.match(TIME_RE);
      const time = m ? (m[1] ?? m[2]) : null;
      return { raw, time };
    });
}

/**
 * Detect garbage/noise lines that should be filtered out
 */
export function isGarbage(line: string): boolean {
  const cleaned = line
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\b\d{2}:\d{2}\b/g, "")
    .trim();
  return GARBAGE_PATTERNS.some(re => re.test(cleaned));
}

/**
 * Remove duplicate lines (case-insensitive, whitespace-normalized)
 */
export function dedupe(lines: RawLine[]): RawLine[] {
  const seen = new Set<string>();
  const out: RawLine[] = [];
  for (const l of lines) {
    const key = l.raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(l);
    }
  }
  return out;
}

/**
 * Full normalization pipeline: extract -> filter garbage -> dedupe
 */
export function normalizeLines(text: string): RawLine[] {
  const lines = extractLines(text);
  const filtered = lines.filter(l => !isGarbage(l.raw));
  return dedupe(filtered);
}

// ============================================================================
// CLASSIFIER
// ============================================================================

const DIRECTIVE_KEYWORDS = [
  "directed", "requested", "instructed", "hold", "stop", "reduce", "edit directive",
  "client requested", "jv directed", "oicc", "navfac", "dho", "per client", "per pm"
];

const QUESTION_RE = /\?$/;

/**
 * Classify normalized lines into directives, station logs, and questions
 */
export function classify(lines: RawLine[]): Classified {
  const directives: RawLine[] = [];
  const station: RawLine[] = [];
  const questions: RawLine[] = [];

  for (const l of lines) {
    const s = l.raw.toLowerCase();

    if (QUESTION_RE.test(l.raw)) {
      questions.push(l);
      continue;
    }

    const isDirective = DIRECTIVE_KEYWORDS.some(k => s.includes(k));
    if (isDirective) directives.push(l);
    else station.push(l);
  }

  return { directives, station, questions };
}

// ============================================================================
// VALIDATORS
// ============================================================================

const TS_RE = /\b\d{1,2}:\d{2}\b|\[\d{1,2}:\d{2}\]/;

/**
 * Assert that station logs contain NO timestamps
 */
export function assertNoTimestampsInStation(stationLogs: StationLogEntry[]): void {
  const blob = JSON.stringify(stationLogs);
  if (TS_RE.test(blob)) {
    throw new Error("VALIDATION_FAIL: Timestamp detected inside station logs");
  }
}

/**
 * Assert that all directives have valid HH:MM timestamps
 */
export function assertDirectivesTimestamped(directives: DirectiveEntry[]): void {
  for (const d of directives) {
    if (!d.time || !/^\d{2}:\d{2}$/.test(d.time)) {
      throw new Error("VALIDATION_FAIL: Directive missing valid time");
    }
  }
}

/**
 * Assert no banned filler text is present
 */
export function assertNoFillerText(payloadJson: string): void {
  const banned = [
    "operations continued as scheduled",
    "operational activities continued as scheduled",
    "operational activities as scheduled",
  ];
  const lower = payloadJson.toLowerCase();
  for (const b of banned) {
    if (lower.includes(b)) throw new Error(`VALIDATION_FAIL: filler text "${b}"`);
  }
}

/**
 * Run all validation checks on a structured payload (throws on failure)
 */
export function validatePayload(payload: StructuredLogPayload): void {
  assertNoTimestampsInStation(payload.station_logs);
  assertDirectivesTimestamped(payload.directives);
  assertNoFillerText(JSON.stringify(payload));
}

/**
 * Validate payload and return result object (does not throw)
 */
export function validatePayloadSafe(payload: StructuredLogPayload): ValidationResult {
  const errors: string[] = [];
  
  try {
    assertNoTimestampsInStation(payload.station_logs);
  } catch (e: any) {
    errors.push(e.message);
  }
  
  try {
    assertDirectivesTimestamped(payload.directives);
  } catch (e: any) {
    errors.push(e.message);
  }
  
  try {
    assertNoFillerText(JSON.stringify(payload));
  } catch (e: any) {
    errors.push(e.message);
  }
  
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// LLM PROCESSOR
// ============================================================================

const STRUCTURED_LOG_PROMPT = `You are a dive operations log processor. Convert the classified inputs into structured JSON output.

## ABSOLUTE PROHIBITION - DIVE SAFETY
NEVER generalize, calculate, or infer dive times, decompression schedules, or dive table data.

## OUTPUT FORMAT (JSON only)
{
  "directives": [
    { "time": "HH:MM", "text": "description without timestamp in text" }
  ],
  "station_logs": [
    { "text": "description without any timestamp" }
  ],
  "risks": [
    { "riskId": "auto", "description": "risk description", "source": "directive text that triggered it" }
  ]
}

## CRITICAL RULES
1. DIRECTIVES: Must have valid "time" field in HH:MM format. Extract time from the input.
2. STATION_LOGS: Must NOT contain any timestamps. Remove all time references from text.
3. RISKS: Create a risk entry if a directive impacts crew safety, schedule, or scope.
4. If you cannot extract a valid time for a directive, use the time from the input if provided.
5. Preserve all diver names, initials, tasks, equipment, and measurements.
6. Do NOT add filler text like "operations continued as scheduled".

## VALIDATION
If you output any timestamps in station_logs, the output will be rejected.
If directives are missing valid times, the output will be rejected.

Return ONLY valid JSON, no markdown code blocks.`;

/**
 * Process raw log text through the full pipeline:
 * normalize -> classify -> LLM extraction -> validate
 * 
 * Requires OpenAI API configuration via environment variables.
 */
export async function processStructuredLog(
  rawText: string,
  options?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }
): Promise<ProcessedLogResult> {
  const openai = new OpenAI({
    apiKey: options?.apiKey || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: options?.baseURL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  
  const model = options?.model || "gpt-4.1-mini";
  
  const normalized = normalizeLines(rawText);
  const classified = classify(normalized);
  
  const directivesInput = classified.directives.map(d => 
    d.time ? `[${d.time}] ${d.raw}` : d.raw
  ).join("\n");
  
  const stationInput = classified.station.map(s => s.raw).join("\n");
  
  try {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 2000,
      messages: [
        { role: "system", content: STRUCTURED_LOG_PROMPT },
        { 
          role: "user", 
          content: `DIRECTIVE CANDIDATES:\n${directivesInput || "(none)"}\n\nSTATION CANDIDATES:\n${stationInput || "(none)"}\n\nProcess these into structured JSON.`
        }
      ],
    });
    
    const content = response.choices[0]?.message?.content?.trim() || "{}";
    
    let jsonStr = content;
    if (content.startsWith("```")) {
      jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    }
    
    const payload = JSON.parse(jsonStr) as StructuredLogPayload;
    
    payload.directives = payload.directives || [];
    payload.station_logs = payload.station_logs || [];
    payload.risks = payload.risks || [];
    
    validatePayload(payload);
    
    return {
      payload,
      rawInput: rawText,
      classified,
      validationPassed: true,
    };
  } catch (error: any) {
    console.error("Structured log processing failed:", error.message);
    
    return {
      payload: { directives: [], station_logs: [], risks: [] },
      rawInput: rawText,
      classified,
      validationPassed: false,
      error: error.message,
    };
  }
}

// ============================================================================
// RENDERERS
// ============================================================================

/**
 * Render a validated payload as formatted master log text
 */
export function renderMasterLogFromPayload(payload: StructuredLogPayload): string {
  const lines: string[] = [];
  
  if (payload.directives.length > 0) {
    lines.push("=== DIRECTIVES ===");
    for (const d of payload.directives) {
      lines.push(`[${d.time}] ${d.text}`);
    }
    lines.push("");
  }
  
  if (payload.station_logs.length > 0) {
    lines.push("=== STATION LOG (NON-TIMESTAMPED) ===");
    for (const s of payload.station_logs) {
      lines.push(`• ${s.text}`);
    }
    lines.push("");
  }
  
  if (payload.risks.length > 0) {
    lines.push("=== RISK REGISTER ===");
    for (const r of payload.risks) {
      lines.push(`[${r.riskId}] ${r.description}`);
      lines.push(`  Source: ${r.source}`);
    }
  }
  
  return lines.join("\n");
}

// ============================================================================
// STANDALONE USAGE EXAMPLE
// ============================================================================

/*
Example usage:

import { 
  normalizeLines, 
  classify, 
  validatePayload, 
  processStructuredLog,
  renderMasterLogFromPayload 
} from './diveops-log-processor';

// Option 1: Full pipeline with LLM
const result = await processStructuredLog(`
  [08:30] Client requested hold on pile driving due to weather
  Diver 1 completed inspection of north wall
  [09:15] JV directed shift to backup location
`);

if (result.validationPassed) {
  console.log(renderMasterLogFromPayload(result.payload));
}

// Option 2: Just normalization and classification (no LLM)
const lines = normalizeLines(rawText);
const classified = classify(lines);
console.log('Directives:', classified.directives);
console.log('Station logs:', classified.station);

// Option 3: Validate an existing payload
try {
  validatePayload(myPayload);
  console.log('Payload is valid');
} catch (e) {
  console.error('Validation failed:', e.message);
}
*/
