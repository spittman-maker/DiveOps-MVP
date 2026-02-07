/**
 * AI Drafting Service for LogEvent Rendering
 * 
 * Generates:
 * - Internal canvas line (cleaned, timestamped)
 * - Client-facing master log line (neutral, professional, defensible)
 * 
 * Uses OpenAI via Replit AI Integrations.
 * Falls back to deterministic rendering if AI fails.
 */

import OpenAI from "openai";
import { classifyEvent, extractData, renderInternalCanvasLine, getMasterLogSection, type EventCategory, type MasterLogSection } from "./extraction";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface AIAnnotation {
  type: "typo" | "missing_info" | "ambiguous" | "safety_flag" | "suggestion";
  message: string;
}

export interface AIRenderResult {
  internalCanvasLine: string;
  masterLogLine: string;
  section: MasterLogSection;
  status: "ok" | "failed" | "needs_review";
  model: string;
  promptVersion: string;
  annotations: AIAnnotation[];
}

const PROMPT_VERSION = "v1.0";
const MODEL = "gpt-5.2";

const INTERNAL_SYSTEM_PROMPT = `You are a diving operations log assistant. Your job is to create clean, professional internal log entries from raw supervisor input.

## ABSOLUTE PROHIBITION - DIVE SAFETY
NEVER generalize, calculate, or infer dive times, bottom times, decompression schedules, surface intervals, or any dive table data. Quote exactly what was entered. All decompression planning follows U.S. Navy Dive Manual standards exclusively.

Rules:
- Keep the entry concise but complete
- Preserve all factual information (times, names, depths, tasks) EXACTLY as written
- Clean up typos and informal language
- Add structure but don't invent information
- Format times consistently as HH:MM
- Use standard diving terminology
- Do NOT add information that wasn't in the original
- Do NOT calculate or infer any dive planning data`;

const MASTER_LOG_SYSTEM_PROMPT = `You are a diving operations documentation assistant creating client-facing log entries that are professional, neutral, and defensible.

## ABSOLUTE PROHIBITION - DIVE SAFETY
NEVER generalize, calculate, or infer:
- Dive times or bottom times
- Decompression schedules or stops
- Surface intervals
- Repetitive dive calculations
- No-decompression limits
- Any dive table data

If dive tables or decompression data is referenced, quote ONLY the exact input text. Do NOT interpret, calculate, or apply dive planning logic. All decompression planning follows U.S. Navy Dive Manual standards exclusively.

## CRITICAL: PRESERVE ALL DETAIL
DO NOT over-summarize. Preserve:
- ALL diver names and initials (e.g., "Zach Meador", "ZM", "Michael Meehan", "MM")
- ALL specific tasks and equipment (grinding, pressure washing, dredging, crane ops)
- ALL measurements and readings (depths, distances, quantities)
- ALL times in the original entry exactly as written
- Night shift vs day shift distinctions

## FORMAT
You are generating a SINGLE professional log line from a raw entry.
The event time is provided separately — use it for context but your output should be a plain text sentence.

For entries with important timestamps (directives, safety, access changes):
"At HH:MM, [action with full detail]."

For routine production entries (diver rotations, standard tasks, mobilization):
"[Diver name] [action with full detail]."

## OUTPUT
Return ONLY a single plain-text sentence. Do NOT return JSON. Do NOT return errors.
Never refuse to produce output. Always generate a professional log line from the input.

## RULES
- Keep ALL diver names/initials - this is critical for accountability
- Keep ALL task specifics - no generic descriptions like "performed tasks"
- Keep ALL equipment references (crane, dredge pump, grinder, etc.)
- Use formal language but do NOT lose operational detail
- For multi-part entries, preserve each part
- Use 24-hour time format (e.g., 14:30 not 2:30 PM)
- This is for client/regulatory review and QA`;

function generateDeterministicAnnotations(rawText: string, category: EventCategory): AIAnnotation[] {
  const annotations: AIAnnotation[] = [];
  const upper = rawText.toUpperCase();
  
  if (/\bL\/?S\b/.test(upper) && !/\d+\s*FSW/i.test(rawText)) {
    annotations.push({ type: "missing_info", message: "Dive start (L/S) detected but no depth (FSW) specified" });
  }
  
  if (/\bR\/?S\b/.test(upper) && !/\bL\/?S\b/.test(upper)) {
    annotations.push({ type: "ambiguous", message: "Diver surfaced (R/S) without a corresponding L/S in this entry" });
  }
  
  if (/\bL\/?S\b/.test(upper) || /\bR\/?B\b/.test(upper)) {
    const hasName = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(rawText) || /\b[A-Z]{2,3}\b/.test(rawText);
    if (!hasName) {
      annotations.push({ type: "missing_info", message: "Dive event without diver name or initials" });
    }
  }
  
  if (category === "safety" && rawText.length < 30) {
    annotations.push({ type: "missing_info", message: "Safety entry appears brief - consider adding details" });
  }
  
  if (/decomp|deco stop|decompression/i.test(rawText)) {
    annotations.push({ type: "safety_flag", message: "Decompression reference detected - verify against U.S. Navy Dive Manual" });
  }
  
  const commonTypos: Record<string, string> = {
    "presure": "pressure", "recieved": "received", "occured": "occurred",
    "equiptment": "equipment", "maintanence": "maintenance", "visability": "visibility",
    "saftey": "safety", "seperately": "separately", "completly": "completely",
    "deisel": "diesel", "gague": "gauge", "annode": "anode",
  };
  
  const lowerText = rawText.toLowerCase();
  for (const [typo, correction] of Object.entries(commonTypos)) {
    if (lowerText.includes(typo)) {
      annotations.push({ type: "typo", message: `"${typo}" → "${correction}"` });
    }
  }
  
  return annotations;
}

export async function generateAIRenders(
  rawText: string,
  eventTime: Date,
  category: EventCategory
): Promise<AIRenderResult> {
  const extracted = extractData(rawText);
  const section = getMasterLogSection(category);
  
  const deterministicInternal = renderInternalCanvasLine(rawText, eventTime, category, extracted);
  const deterministicAnnotations = generateDeterministicAnnotations(rawText, category);
  
  try {
    const [internalResponse, masterResponse] = await Promise.all([
      openai.chat.completions.create({
        model: MODEL,
        max_tokens: 300,
        messages: [
          { role: "system", content: INTERNAL_SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Raw log entry (${eventTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}): ${rawText}\n\nCategory: ${category}\n\nCreate a clean internal log line.`
          }
        ],
      }),
      openai.chat.completions.create({
        model: MODEL,
        max_tokens: 300,
        messages: [
          { role: "system", content: MASTER_LOG_SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Raw log entry (${eventTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}): ${rawText}\n\nCategory: ${category}\nSection: ${section}\n\nCreate a professional client-facing log line.`
          }
        ],
      }),
    ]);
    
    let internalLine = internalResponse.choices[0]?.message?.content?.trim() || deterministicInternal;
    let masterLine = masterResponse.choices[0]?.message?.content?.trim() || rawText;
    
    const isErrorResponse = (text: string) => {
      if (!text) return true;
      const lower = text.toLowerCase();
      if (lower.startsWith('{"error') || lower.startsWith('{ "error')) return true;
      if (lower.includes('"error"') && lower.includes('timestamp')) return true;
      return false;
    };
    
    if (isErrorResponse(internalLine)) {
      console.warn("AI returned error for internal line, using deterministic fallback");
      internalLine = deterministicInternal;
    }
    if (isErrorResponse(masterLine)) {
      console.warn("AI returned error for master line, using raw text fallback");
      masterLine = rawText;
    }
    
    return {
      internalCanvasLine: internalLine,
      masterLogLine: masterLine,
      section,
      status: "ok",
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      annotations: deterministicAnnotations,
    };
  } catch (error) {
    console.error("AI drafting failed:", error);
    
    return {
      internalCanvasLine: deterministicInternal,
      masterLogLine: rawText,
      section,
      status: "failed",
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      annotations: deterministicAnnotations,
    };
  }
}

/**
 * Regenerate AI renders for a log event.
 * Called when user requests retry after failure.
 */
export async function regenerateRenders(
  rawText: string,
  eventTime: Date,
  category: EventCategory
): Promise<AIRenderResult> {
  return generateAIRenders(rawText, eventTime, category);
}
