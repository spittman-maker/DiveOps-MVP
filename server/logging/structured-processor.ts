import OpenAI from "openai";
import { normalizeLines, type RawLine } from "./normalize";
import { classify, type Classified } from "./classify";
import { validatePayload, type StructuredLogPayload, type DirectiveEntry, type StationLogEntry, type RiskEntry } from "./validate";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-4.1-mini";

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

export interface ProcessedLogResult {
  payload: StructuredLogPayload;
  rawInput: string;
  classified: Classified;
  validationPassed: boolean;
  error?: string;
}

export async function processStructuredLog(rawText: string): Promise<ProcessedLogResult> {
  const normalized = normalizeLines(rawText);
  const classified = classify(normalized);
  
  const directivesInput = classified.directives.map(d => 
    d.time ? `[${d.time}] ${d.raw}` : d.raw
  ).join("\n");
  
  const stationInput = classified.station.map(s => s.raw).join("\n");
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
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
    
    const fallbackPayload: StructuredLogPayload = {
      directives: classified.directives
        .filter(d => d.time)
        .map(d => ({
          time: d.time!,
          text: d.raw.replace(/\[?\d{2}:\d{2}\]?\s*/g, "").trim(),
        })),
      station_logs: classified.station.map(s => ({
        text: s.raw.replace(/\[?\d{2}:\d{2}\]?\s*/g, "").trim(),
      })),
      risks: [],
    };
    
    return {
      payload: fallbackPayload,
      rawInput: rawText,
      classified,
      validationPassed: false,
      error: error.message,
    };
  }
}

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
