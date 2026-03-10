import Anthropic from "@anthropic-ai/sdk";
import type { JhaContent, SafetyMeetingAgenda } from "@shared/safety-schema";
import logger from "./logger";

const AI_MODEL = "claude-sonnet-4-20250514";

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

// ────────────────────────────────────────────────────────────────────────────
// AI JHA Generation
// ────────────────────────────────────────────────────────────────────────────

interface JhaGenerationInput {
  plannedOperations: string[];
  weatherConditions: string;
  diveDepth?: number;
  equipmentInUse: string[];
  location: string;
  historicalNearMisses: { title: string; description: string; severity: string }[];
}

export async function generateJhaWithAI(input: JhaGenerationInput): Promise<JhaContent> {
  const client = getAnthropicClient();
  const today = new Date().toISOString().split("T")[0];

  const nearMissContext = input.historicalNearMisses.length > 0
    ? `\n\nHistorical near-misses at this project (consider these when identifying hazards):\n${input.historicalNearMisses.map(nm => `- [${nm.severity.toUpperCase()}] ${nm.title}: ${nm.description}`).join("\n")}`
    : "";

  const prompt = `You are a commercial diving safety expert creating a Job Hazard Analysis (JHA) for a diving operation. Generate a comprehensive JHA based on the following information:

PLANNED OPERATIONS: ${input.plannedOperations.length > 0 ? input.plannedOperations.join(", ") : "General diving operations"}
WEATHER CONDITIONS: ${input.weatherConditions}
DIVE DEPTH: ${input.diveDepth ? `${input.diveDepth} feet` : "Not specified"}
EQUIPMENT IN USE: ${input.equipmentInUse.length > 0 ? input.equipmentInUse.join(", ") : "Standard surface-supplied diving equipment"}
LOCATION: ${input.location}
DATE: ${today}${nearMissContext}

Generate a thorough JHA following USACE EM 385-1-1 and Navy Dive Manual standards. Include at least 6-8 hazards with specific controls. Focus on real commercial diving hazards. Do NOT include any references to differential pressure hazards.

Respond ONLY with valid JSON matching this exact structure (no markdown, no code fences):
{
  "jobDescription": "string",
  "location": "string",
  "date": "string",
  "weatherConditions": "string",
  "diveDepth": number or null,
  "equipmentInUse": ["string"],
  "plannedOperations": ["string"],
  "hazards": [
    {
      "hazard": "string - specific hazard description",
      "riskLevel": "low" | "medium" | "high" | "critical",
      "controls": ["string - specific control measures"],
      "responsibleParty": "string - role responsible",
      "ppe": ["string - required PPE"]
    }
  ],
  "emergencyProcedures": ["string"],
  "additionalNotes": "string",
  "historicalIncidentsSummary": "string or null",
  "aiModel": "${AI_MODEL}",
  "aiPromptVersion": "1.0"
}`;

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: "You are a commercial diving safety expert with deep knowledge of USACE EM 385-1-1, Navy Dive Manual, OSHA 29 CFR 1926 Subpart Y, and ADCI consensus standards. Respond only with valid JSON. No markdown formatting, no code fences, no explanatory text.",
      messages: [
        { role: "user", content: prompt }
      ],
    });

    const textBlock = response.content.find(block => block.type === "text");
    const content = textBlock?.text?.trim();
    if (!content) throw new Error("Empty AI response");

    // Strip any markdown code fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonStr) as JhaContent;

    // Validate required fields
    if (!parsed.jobDescription || !parsed.hazards || !Array.isArray(parsed.hazards)) {
      throw new Error("AI response missing required JHA fields");
    }

    return parsed;
  } catch (err: any) {
    logger.error({ err }, "AI JHA generation failed");
    throw new Error(`AI JHA generation failed: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AI Safety Meeting Generation
// ────────────────────────────────────────────────────────────────────────────

interface MeetingGenerationInput {
  plannedOperations: string[];
  weatherConditions: string;
  supervisorNotes: string;
  recentNearMisses: { title: string; description: string; severity: string }[];
  previousMeetingNotes?: string;
}

export async function generateMeetingWithAI(input: MeetingGenerationInput): Promise<SafetyMeetingAgenda> {
  const client = getAnthropicClient();

  const nearMissContext = input.recentNearMisses.length > 0
    ? `\nRecent near-misses:\n${input.recentNearMisses.map(nm => `- [${nm.severity.toUpperCase()}] ${nm.title}: ${nm.description}`).join("\n")}`
    : "\nNo recent near-misses reported.";

  const previousContext = input.previousMeetingNotes
    ? `\nPrevious meeting notes: ${input.previousMeetingNotes}`
    : "";

  const prompt = `You are a commercial diving safety supervisor preparing a 10-minute morning safety meeting agenda. Generate a comprehensive meeting agenda based on:

PLANNED OPERATIONS: ${input.plannedOperations.length > 0 ? input.plannedOperations.join(", ") : "General diving operations for the day"}
WEATHER CONDITIONS: ${input.weatherConditions}
SUPERVISOR NOTES: ${input.supervisorNotes || "None provided"}${nearMissContext}${previousContext}

The meeting should cover:
1. Safety topic of the day (relevant to the planned operations)
2. Previous shift summary
3. Today's hazards and specific mitigation plans
4. Open discussion points for the crew
5. Questions for the supervisor about the day's operations and safety concerns

Respond ONLY with valid JSON matching this exact structure (no markdown, no code fences):
{
  "safetyTopicOfDay": "string - a focused safety topic relevant to today's work",
  "previousShiftSummary": {
    "workCompleted": ["string"],
    "issues": ["string"],
    "nearMisses": ["string"]
  },
  "todaysHazards": [
    {
      "hazard": "string - specific hazard",
      "mitigation": "string - specific mitigation plan"
    }
  ],
  "openDiscussionPoints": ["string - points for crew discussion"],
  "supervisorQuestions": [
    {
      "question": "string - question about ops or safety for the supervisor to address",
      "answer": ""
    }
  ],
  "weatherConditions": "string",
  "equipmentStatusFlags": ["string - any equipment items to check"],
  "plannedOperations": ["string"]
}`;

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 3000,
      system: "You are a commercial diving safety supervisor with extensive field experience. You understand the real hazards divers face and create practical, actionable safety meeting agendas — not generic corporate safety fluff. Respond only with valid JSON. No markdown formatting, no code fences, no explanatory text.",
      messages: [
        { role: "user", content: prompt }
      ],
    });

    const textBlock = response.content.find(block => block.type === "text");
    const content = textBlock?.text?.trim();
    if (!content) throw new Error("Empty AI response");

    const jsonStr = content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonStr) as SafetyMeetingAgenda;

    // Validate required fields
    if (!parsed.safetyTopicOfDay || !parsed.todaysHazards) {
      throw new Error("AI response missing required meeting agenda fields");
    }

    return parsed;
  } catch (err: any) {
    logger.error({ err }, "AI meeting generation failed");
    throw new Error(`AI meeting generation failed: ${err.message}`);
  }
}
