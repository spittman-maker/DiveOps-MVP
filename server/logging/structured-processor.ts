/**
 * Structured Log Processor - Wired with log_pipeline_guard
 * 
 * Uses the new normalizer + validators before/after LLM calls.
 * Hard-fails if constitution is violated - nothing persisted.
 */

import OpenAI from "openai";
import {
  normalizeAndClassifyRawNotes,
  buildModelInputPacket,
  validateModelOutputOrThrow,
  autoCreateRisksFromDirectives,
  type PrepBuckets,
  type ModelInputPacket,
  type DailyLogModelOutput,
  type DirectiveOut,
  type StationLogOut,
  type RiskOut,
} from "./log_pipeline_guard";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-5.2";

const STRUCTURED_LOG_PROMPT = `You are a dive operations log processor. Convert the classified inputs into structured JSON output.

## ABSOLUTE PROHIBITION - DIVE SAFETY
NEVER generalize, calculate, or infer dive times, decompression schedules, or dive table data.

## OUTPUT FORMAT (JSON only)
{
  "date": "YYYY-MM-DD",
  "day_window": "0600–0559",
  "summary": {
    "work_executed": ["description of work 1", "description of work 2"],
    "primary_constraints": ["constraint 1"],
    "qaqc_posture": ["qaqc item 1"],
    "carryover": ["carryover item 1"]
  },
  "directives": [
    { "time": "HH:MM", "what": "description without timestamp in text", "who": "Client/JV/OICC", "impact": "impact if any" }
  ],
  "station_logs": [
    { "station": "Dive Station 1", "crew": "Diver names", "scope_worked": "description", "production": "measurements" }
  ],
  "risks": []
}

## RULES
1. DIRECTIVES: Must have valid "time" field in HH:MM format. Extract time from the input.
2. STATION_LOGS: Summarize what happened at each station. Focus on crew, scope, and production. Time references should be in directives, not station_logs.
3. DO NOT CREATE RISKS. Return risks: [] always. Risk creation is handled separately.
4. Preserve all diver names, initials, tasks, equipment, and measurements.
5. Do NOT add filler text like "operations continued as scheduled".
6. ALWAYS produce valid output. Never return errors or refuse to generate output.

Output JSON only.`;

// Legacy types for backward compatibility
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

export interface ProcessedLogResult {
  payload: StructuredLogPayload;
  rawInput: string;
  prep: PrepBuckets;
  modelInput: ModelInputPacket;
  fullModelOutput?: DailyLogModelOutput;
  validationPassed: boolean;
  error?: string;
}

/**
 * Convert new DailyLogModelOutput to legacy StructuredLogPayload format
 */
function convertToLegacyPayload(modelOut: DailyLogModelOutput): StructuredLogPayload {
  return {
    directives: modelOut.directives.map(d => ({
      time: d.time,
      text: d.what,
    })),
    station_logs: modelOut.station_logs.map(s => ({
      text: [s.station, s.crew, s.scope_worked, s.production, s.findings]
        .filter(Boolean)
        .join(" - "),
    })),
    risks: (modelOut.risks || []).map(r => ({
      riskId: r.risk_id,
      description: r.impact,
      source: r.trigger,
    })),
  };
}

/**
 * Process raw log text through the full pipeline:
 * 1. Normalize + classify raw notes
 * 2. Build deterministic LLM input packet
 * 3. Call LLM (JSON ONLY)
 * 4. HARD FAIL if constitution violated
 * 
 * If any step throws, nothing is persisted.
 */
export async function processStructuredLog(
  rawText: string,
  meta?: { date?: string; window?: string }
): Promise<ProcessedLogResult> {
  // 1) Normalize + classify raw notes
  const prep = normalizeAndClassifyRawNotes(rawText);
  
  // 2) Build deterministic LLM input
  const today = meta?.date || new Date().toISOString().split("T")[0];
  const window = meta?.window || "0600–0559";
  const modelInput = buildModelInputPacket(prep, { date: today, window });
  
  try {
    // 3) Call LLM (JSON ONLY)
    const response = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        { role: "system", content: STRUCTURED_LOG_PROMPT },
        { 
          role: "user", 
          content: JSON.stringify(modelInput, null, 2)
        }
      ],
    });
    
    const content = response.choices[0]?.message?.content?.trim() || "{}";
    
    // Strip markdown code blocks if present
    let jsonStr = content;
    if (content.startsWith("```")) {
      jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    }
    
    const modelJson = JSON.parse(jsonStr) as DailyLogModelOutput;
    
    // Ensure required arrays exist
    modelJson.directives = modelJson.directives || [];
    modelJson.station_logs = modelJson.station_logs || [];
    // Force LLM risks empty - only deterministic auto-risk creation allowed
    (modelJson as any).risks = [];
    modelJson.summary = modelJson.summary || {
      work_executed: [],
      primary_constraints: [],
      qaqc_posture: [],
      carryover: [],
    };
    modelJson.date = modelJson.date || today;
    modelJson.day_window = modelJson.day_window || window;
    
    // 4) HARD FAIL if constitution violated
    validateModelOutputOrThrow(modelJson);
    
    // 5) Auto-create risks from directive language (deterministic, deduped)
    const withRisks = autoCreateRisksFromDirectives(modelJson);
    
    // Convert to legacy format for backward compatibility
    const payload = convertToLegacyPayload(withRisks);
    
    return {
      payload,
      rawInput: rawText,
      prep,
      modelInput,
      fullModelOutput: withRisks,
      validationPassed: true,
    };
  } catch (error: any) {
    console.error("Structured log processing failed:", error.message);
    
    // HARD FAIL - return error, do not persist
    return {
      payload: { directives: [], station_logs: [], risks: [] },
      rawInput: rawText,
      prep,
      modelInput,
      validationPassed: false,
      error: error.message,
    };
  }
}

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

/**
 * Render full DailyLogModelOutput for DOCX generation
 */
export function renderDailyLogFromModelOutput(modelOut: DailyLogModelOutput): string {
  const lines: string[] = [];
  
  lines.push(`DAILY LOG - ${modelOut.date}`);
  lines.push(`Reporting Window: ${modelOut.day_window}`);
  lines.push("");
  
  if (modelOut.summary) {
    lines.push("=== SUMMARY ===");
    if (modelOut.summary.work_executed.length > 0) {
      lines.push("Work Executed:");
      modelOut.summary.work_executed.forEach(w => lines.push(`  • ${w}`));
    }
    if (modelOut.summary.primary_constraints.length > 0) {
      lines.push("Constraints:");
      modelOut.summary.primary_constraints.forEach(c => lines.push(`  • ${c}`));
    }
    lines.push("");
  }
  
  if (modelOut.directives.length > 0) {
    lines.push("=== DIRECTIVES ===");
    for (const d of modelOut.directives) {
      lines.push(`[${d.time}] ${d.who ? `(${d.who}) ` : ""}${d.what}`);
      if (d.impact) lines.push(`  Impact: ${d.impact}`);
    }
    lines.push("");
  }
  
  if (modelOut.station_logs.length > 0) {
    lines.push("=== STATION LOGS ===");
    for (const s of modelOut.station_logs) {
      lines.push(`${s.station}${s.crew ? ` - ${s.crew}` : ""}`);
      if (s.scope_worked) lines.push(`  Scope: ${s.scope_worked}`);
      if (s.production) lines.push(`  Production: ${s.production}`);
      if (s.findings) lines.push(`  Findings: ${s.findings}`);
    }
    lines.push("");
  }
  
  if (modelOut.risks && modelOut.risks.length > 0) {
    lines.push("=== RISKS ===");
    for (const r of modelOut.risks) {
      lines.push(`[${r.risk_id}] ${r.trigger} → ${r.impact} (${r.status})`);
    }
  }
  
  return lines.join("\n");
}
