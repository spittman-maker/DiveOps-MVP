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

export interface AIRenderResult {
  internalCanvasLine: string;
  masterLogLine: string;
  section: MasterLogSection;
  status: "ok" | "failed" | "needs_review";
  model: string;
  promptVersion: string;
}

const PROMPT_VERSION = "v1.0";
const MODEL = "gpt-4.1-mini";

const INTERNAL_SYSTEM_PROMPT = `You are a diving operations log assistant. Your job is to create clean, professional internal log entries from raw supervisor input.

Rules:
- Keep the entry concise but complete
- Preserve all factual information (times, names, depths, tasks)
- Clean up typos and informal language
- Add structure but don't invent information
- Format times consistently as HH:MM
- Use standard diving terminology
- Do NOT add information that wasn't in the original`;

const MASTER_LOG_SYSTEM_PROMPT = `You are a diving operations documentation assistant creating client-facing log entries that are professional, neutral, and defensible.

## CRITICAL: PRESERVE ALL DETAIL
DO NOT over-summarize. Preserve:
- ALL diver names and initials (e.g., "Zach Meador", "ZM", "Michael Meehan", "MM")
- ALL specific tasks and equipment (grinding, pressure washing, dredging, crane ops)
- ALL measurements and readings (depths, distances, quantities)
- ALL times in the original entry
- Night shift vs day shift distinctions

## TIMESTAMP RULES
Timestamps are REQUIRED for:
- Client/JV/OICC directives (scope changes, work orders)
- DHO directives (all stop, pull divers)
- Access changes (vessel movements)
- Safety impacts and incidents

Timestamps are OPTIONAL for routine production:
- Diver rotations (L/S, R/S, L/B, R/B)
- Standard tasks (pressure washing, measurements)
- Mobilization and demobilization

## FORMAT
For timestamped: "At HH:MM, [action with full detail]."
For non-timestamped: "[Action with full detail]."

## RULES
- Keep ALL diver names/initials - this is critical for accountability
- Keep ALL task specifics - no generic descriptions like "performed tasks"
- Keep ALL equipment references (crane, dredge pump, grinder, etc.)
- Use formal language but do NOT lose operational detail
- For multi-part entries, preserve each part
- This is for client/regulatory review and QA`;

export async function generateAIRenders(
  rawText: string,
  eventTime: Date,
  category: EventCategory
): Promise<AIRenderResult> {
  const extracted = extractData(rawText);
  const section = getMasterLogSection(category);
  
  // Generate deterministic fallback
  const deterministicInternal = renderInternalCanvasLine(rawText, eventTime, category, extracted);
  
  try {
    // Generate both renders in parallel
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
    
    const internalLine = internalResponse.choices[0]?.message?.content?.trim() || deterministicInternal;
    const masterLine = masterResponse.choices[0]?.message?.content?.trim() || rawText;
    
    return {
      internalCanvasLine: internalLine,
      masterLogLine: masterLine,
      section,
      status: "ok",
      model: MODEL,
      promptVersion: PROMPT_VERSION,
    };
  } catch (error) {
    console.error("AI drafting failed:", error);
    
    // Return deterministic fallback
    return {
      internalCanvasLine: deterministicInternal,
      masterLogLine: rawText, // Raw text as fallback for master
      section,
      status: "failed",
      model: MODEL,
      promptVersion: PROMPT_VERSION,
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
