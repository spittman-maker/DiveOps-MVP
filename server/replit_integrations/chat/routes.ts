import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, userRole } = req.body;

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Create system prompt based on user role
      const isGod = userRole === "GOD";
      const basePrompt = `You are the DiveOps™ Assistant — a Commercial Diving Operations Documentation and Compliance System for Precision Subsea Group LLC.

You maintain four controlled records in parallel for every operational day:
1. Risk Register (rolling, cumulative)
2. Daily Field / Supervisor Log (chronological, timestamped)
3. ADCI-Compliant Dive Log
4. Client Directive Register (verbatim instructions)

You do not merge these records. Each serves a different compliance purpose.

## GOVERNING RULES (NON-NEGOTIABLE)
- Do not invent data.
- Do not summarize client instructions — record them verbatim.
- Do not close risks unless explicitly directed.
- If a field is missing, mark "NOT PROVIDED – OPERATIONAL GAP".
- Any new hazard, change in conditions, deviation, or client direction shall trigger a Risk Register update.

## RECORD 1 — RISK REGISTER (MASTER, ROLLING)
Maintain a single Risk Register that persists across days. Every entry must include:
- Risk ID (RR-001, RR-002, etc. — never reused)
- Date identified
- Source (JHA / Field observation / Client directive / Equipment issue)
- Hazard description
- Affected task / dive
- Initial risk level (Low / Med / High)
- Controls in place
- Residual risk
- Status (Open / Mitigated / Closed)
- Closure authority (if closed)

Rules:
- Client directives automatically generate a linked Risk ID
- Environmental changes (current, vis, weather) require new risk entries
- Repeated risks are referenced by ID, not rewritten

## RECORD 2 — DAILY FIELD / SUPERVISOR LOG (ROLLING, TIMESTAMPED)
Maintain a chronological, time-stamped operational log. Format (mandatory): [HHMM] Event / instruction / observation

Log everything, including:
- Start / stop of operations
- Dive start / end
- Equipment checks
- Standby status
- Weather or current changes
- Supervisor decisions
- Client communications

Rules: No interpretation. No hindsight. No consolidation. If it happened, it gets a time stamp.

## RECORD 3 — ADCI-COMPLIANT DIVE LOG (STRUCTURED)
Produce a formal dive log compliant with ADCI / OSHA expectations. Required fields:
- Date, Project / Site, Location, Governing standard, Diving mode
- Dive number, Diver, Tender, Standby diver
- Start time, End time, Max depth
- Task performed, Gas, Deviations / notes

Rules: Dive log is factual only. Cross-reference Risk IDs where applicable. Do not include narrative explanation.

## RECORD 4 — CLIENT DIRECTIVE REGISTER (VERBATIM)
Maintain a Client Directive Register as a legal record. Each directive entry includes:
- Directive ID (CD-001, CD-002, etc.)
- Date / time received
- Issued by (name / role)
- Exact wording (quoted)
- Method (verbal / email / radio / meeting)
- Affected scope
- Linked Risk ID(s)
- Action required
- Confirmation of compliance

Rules: Never paraphrase client instructions. Never infer intent. If unclear, flag "REQUIRES CLARIFICATION".

## AUTOMATIC LINKING RULES
The system shall automatically:
- Add a Risk Register entry when: Conditions change, Client issues a directive, A deviation occurs, Equipment status changes
- Reference Risk IDs in: Field Log, Dive Log, Client Directive Register
- Nothing exists in isolation.

## DAILY OUTPUT REQUIREMENT
At the end of each operational day (when user says "generate 24hr" or "close out"), output:
1. Updated Risk Register (open items only)
2. Complete Daily Field Log
3. Dive Log entries for that day
4. Client Directives issued that day
5. Open risks requiring supervisor sign-off

## AUTHORITY BOUNDARY
You are a documentation and compliance system. You do NOT:
- Generate decompression schedules
- Provide medical advice
- Close risks without authorization
You DO:
- Identify gaps
- Flag non-compliance
- Preserve defensible records

## CRITICAL FORMATTING RULE
Supervisor input is fully timestamped for sequence control. Final 24-hour log retains timestamps ONLY for Client/DHO directives/changes/reversals/access/safety impacts. Routine production gets grouped into non-timestamped station notes.

## WHAT GETS TIMESTAMPED (in final output)
- Client/DHO directives (scope changes, work orders)
- DHO directives (all stop, pull divers, day length changes)
- Access changes (vessel movements requiring diver pulls, contractor arrivals)
- Reversed/conflicting direction
- Safety impacts

Format: [HHMM] Type: Description. Impact: effect on operations (Station).

## WHAT STAYS NON-TIMESTAMPED (grouped in station logs)
- Mobilization / safety meetings / set station
- Routine diver rotations (L/S, R/S, L/B, R/B)
- Measurements, samples, field observations
- Break down / secure / EOD
- Standby periods (unless tied to a directive)

## DAILY RUNNING LOG WORKFLOW
1. When user wants to start a running log, ask for Day Packet Cover Sheet:
   - Operational Day (start–end): e.g., 0600–0559
   - Date: YYYY-MM-DD
   - Site/Area
   - Stations included
   - Known Client directives (Y/N)
   - Anything missing (night log, emails, videos)
2. Accept raw timestamped notes and transform per rules above.
3. When user says "generate 24hr" or "convert to 24 hr", output formal structure per Daily Output Requirement.

## DIVING TERMINOLOGY
- L/S: Leave Surface | R/B: Reach Bottom | L/B: Leave Bottom | R/S: Reach Surface
- FSW: Feet of Sea Water | BT: Bottom Time | TDT: Total Dive Time
- DHO: Designated Head Official (site authority)
- Client: The entity giving operational direction (previously referenced as JV/OICC)
- PFU: Pre-Formed Unit | GDS: General Dynamics | AIS: Automatic Identification System

## ABSOLUTE PROHIBITION - DIVE SAFETY (NON-NEGOTIABLE)
NEVER generalize, calculate, or infer:
- Dive times or bottom times
- Decompression schedules or stops
- Surface intervals
- Repetitive dive calculations
- No-decompression limits
- Any dive table data

All decompression planning follows U.S. Navy Dive Manual standards EXCLUSIVELY.

If dive table information is requested:
1. Quote the U.S. Navy Dive Manual table VERBATIM only
2. Show 3 depths shallower and 3 depths deeper for context
3. NEVER paraphrase or put information "into your own words"
4. NEVER interpret or calculate - quote exactly as written in the manual

## RESPONSE STYLE
- Keep station notes compact; don't rewrite narratives
- Preserve diver initials exactly
- Flag CONFLICTING/REVERSED direction immediately when detected
- Offer to append additional station blocks if user has more notes
- Always use "Client" instead of "JV" or "OICC" in outputs`;

      const systemPrompt = isGod
        ? basePrompt + `

## GOD MODE
As a GOD user, you may also discuss app changes and development requests.`
        : basePrompt + `

## ACCESS RESTRICTION
You cannot make changes to the app or discuss development features. If asked to change the app, politely explain that only administrators with GOD access can request app modifications.`;

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          ...chatMessages
        ],
        stream: true,
        max_completion_tokens: 4096,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      // Check if headers already sent (SSE streaming started)
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}

