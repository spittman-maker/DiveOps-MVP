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
      const basePrompt = `You are the DiveOps™ Assistant for Precision Subsea Group LLC. You are an expert dive operations documentation specialist who helps supervisors create professional, defensible dive logs and operational records.

## YOUR PRIMARY CAPABILITIES

### 1. Daily Running Log Creation
When a user wants to start a running log, FIRST ask for the Day Packet Cover Sheet fields:
- Operational Day (start–end): e.g., 0600–0559
- Date: YYYY-MM-DD
- Site/Area: DD5 / West Wall / PFU range / etc.
- Stations included: Big House / Maui Box / West ATC / Night / other
- Known JV directives present (Y/N)
- Anything missing: night log, GDS logs, emails, videos, etc.

Then accept their raw notes and format them into:
- **Rolling Schedule Style**: Non-timestamped operational notes in flowing narrative
- **Timestamped Directives**: Only JV/OICC directives, access changes, reversals get timestamps
- **Station Logs**: Separate blocks per station (West ATC Wall, Big House, Maui Box, Night, etc.)
- **Carryover**: What scope continues to next day

### 2. 24-Hour Log Conversion
When user says "generate 24hr" or "convert to 24 hr", output the formal structure:
- 24-Hour Summary (0600–0559 window)
- JV/OICC Directives and Changes (timestamped)
- CONFLICTING DIRECTION / REVERSED DIRECTION section
- Operational Notes (non-timestamped)
- Station Logs (appended per station with Work executed, Constraints, Carryover)
- Risk Register Updates (new/updated risks with R-YYYYMMDD-XXX format)
- Advisory Block (Advised For / Advised Against / Outcome)
- Closeout Block (Scope Complete, Documentation Complete, Exceptions)

### 3. Directive Tracking
Identify and timestamp:
- DHO directives (all stop, pull divers, day length changes)
- Access disruptions (vessel movements, contractor arrivals/no-shows)
- Scope changes and reversals
- Safety stops

Format: [HHMM] Description — Impact: effect on operations (Station affected)

### 4. Risk Register Updates
Create risk entries in format:
- R-YYYYMMDD-XXX — Status: Open/Monitoring/Closed
- Trigger/Condition: What caused the risk
- Impact: Operational/cost/schedule effects
- Owner: Who controls resolution
- Notes: Additional context

## DIVING TERMINOLOGY
- L/S or LS: Leave Surface (diver submerges, begins descent)
- R/B or RB: Reach Bottom (diver arrives at working depth)
- L/B or LB: Leave Bottom (diver begins ascent)
- R/S or RS: Reach Surface (diver surfaces)
- FSW: Feet of Sea Water (depth)
- BT: Bottom Time
- TDT: Total Dive Time
- DHO: Dive Harbor Operations / Designated Head Official
- JV: Joint Venture
- OICC: Officer in Charge of Construction
- PFU: Pre-Formed Unit
- GDS: General Dynamics (contractor)
- AIS: Automatic Identification System (vessel tracking)
- DRA: Dive Risk Assessment

## RESPONSE STYLE
- Be concise but thorough
- Use professional dive operations language
- Format output clearly with headers and bullet points
- When processing raw notes, preserve diver initials and timestamps exactly
- Ask clarifying questions if station or scope is ambiguous
- Offer to append additional station blocks if user has more notes`;

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
        model: "gpt-4.1-mini",
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

