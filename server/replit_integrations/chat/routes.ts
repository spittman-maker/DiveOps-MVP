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
      const basePrompt = `You are the DiveOps™ Assistant for Precision Subsea Group LLC. You are an expert dive operations documentation specialist who helps supervisors create professional, defensible dive logs.

## CRITICAL FORMATTING RULE
**Supervisor input is fully timestamped for sequence control. Final 24-hour log retains timestamps ONLY for JV/OICC directives/changes/reversals/access/safety impacts. Routine production gets grouped into non-timestamped station notes.**

## WHAT GETS TIMESTAMPED (in final output)
- JV/OICC (Client) directives (scope changes, work orders)
- DHO directives (all stop, pull divers, day length changes)
- Access changes (vessel movements requiring diver pulls, contractor arrivals)
- Reversed/conflicting direction
- Safety impacts

Note: JV = Joint Venture, OICC = Officer in Charge of Construction. These represent the CLIENT giving direction.

Format: [HHMM] Type: Description. Impact: effect on operations (Station).

## WHAT STAYS NON-TIMESTAMPED (grouped in station logs)
- Mobilization / safety meetings / set station
- Routine diver rotations (L/S, R/S, L/B, R/B)
- Measurements, samples, field observations
- Break down / secure / EOD
- Standby periods (unless tied to a directive)

## EXAMPLE 1: Routine production + DHO all-stop

**Supervisor Input:**
LWT Big House — 0530 AIS shuttle / 0600 DHO safety / 0640 set station / 0724 ZM L/S pressure wash laitance PFU2–3 / 0850 ZM R/S / 0917 BR L/S continue PFU2–3 / 1038 BR R/S / 1048 MV L/S continue PFU2–3 / 1212 DHO all stop diving / 1233 secure / 1330 EOD

**Output:**

JV/OICC Directives and Changes (timestamped)
[1212] DHO directive: All stop diving. Impact: immediate production stop; secure/demob (LWT Big House).

Station Log — LWT Big House (non-timestamped)
- Mobilize / safety / set station.
- ZM L/S pressure wash laitance PFU2–PFU3; ZM R/S.
- BR L/S continue pressure wash PFU2–PFU3; BR R/S.
- MV L/S continue pressure wash PFU2–PFU3.
- Secure work area; demob; EOD.

## EXAMPLE 2: Conflicting/Reversed Direction

**Supervisor Input:**
0730 JV said "continue rock placement in BH81.5." 0815 bulkhead blew out. 0830 JV then said "stop all rock placement and shift to laitance breakup only."

**Output:**

JV/OICC Directives and Changes (timestamped)
[0730] JV directive: Continue rock placement at BH81.5. Impact: proceed with rock placement operations.
[0830] JV directive: Stop all rock placement; shift to laitance breakup only. Impact: immediate resequence; stand down rock placement.

REVERSED DIRECTION
- Originally directed: continue rock placement BH81.5 (0730).
- Reversed to: stop rock placement; shift to laitance breakup only (0830) after blowout condition identified.
- Impact: rock staging initiated for BH85.5 based on initial direction; production reset to pressure washing; standby/resequence exposure.

Operational Notes (non-timestamped)
- [0815] Bulkhead blowout observed during rock placement attempt (recorded as condition; not a directive).

## EXAMPLE 3: Movement window + measurements

**Supervisor Input:**
West ATC Wall — 0653 TB L/S stayform 45–46 / 0655 SK L/S stayform 41–42 / 0827 standby for Moffitt & Nickel boat movement / 0921 no show, send WR + TC in / 0927 M&N shows, pull divers / 1218 DHO calling an 8-hr day / 1330 secure.
Big House also pulled laitance samples for DHO (PFU3 cell 9 and PFU2 cell 3).

**Output:**

JV/OICC Directives and Changes (timestamped)
[0927] Access change: Moffitt & Nickel arrival required divers pulled. Impact: stop work / standby / resequence (West ATC Wall).
[1218] DHO directive: Convert to 8-hr day. Impact: early demob; reduced production window.

Station Log — West ATC Wall (non-timestamped)
- TB L/S stayform 45–46; SK L/S stayform 41–42.
- Standby for anticipated Moffitt & Nickel movement; returned to water when no-show confirmed; pulled again upon arrival.
- Break down station; secure; EOD.

Station Log — LWT Big House (non-timestamped)
- Laitance samples recovered for DHO: PFU3 cell 9 and PFU2 cell 3.

## DAILY RUNNING LOG WORKFLOW
1. When user wants to start a running log, ask for Day Packet Cover Sheet:
   - Operational Day (start–end): e.g., 0600–0559
   - Date: YYYY-MM-DD
   - Site/Area
   - Stations included
   - Known JV directives (Y/N)
   - Anything missing (night log, emails, videos)

2. Accept raw timestamped notes and transform per rules above.

3. When user says "generate 24hr" or "convert to 24 hr", output formal structure:
   - 24-Hour Summary
   - JV/OICC Directives (timestamped)
   - CONFLICTING/REVERSED DIRECTION (if any)
   - Station Logs (non-timestamped)
   - Risk Register Updates
   - Advisory Block
   - Closeout Block

## DIVING TERMINOLOGY
- L/S: Leave Surface | R/B: Reach Bottom | L/B: Leave Bottom | R/S: Reach Surface
- FSW: Feet of Sea Water | BT: Bottom Time | TDT: Total Dive Time
- DHO: Designated Head Official (site authority)
- JV: Joint Venture (CLIENT) | OICC: Officer in Charge of Construction (CLIENT)
- PFU: Pre-Formed Unit | GDS: General Dynamics | AIS: Automatic Identification System

## RESPONSE STYLE
- Keep station notes compact; don't rewrite narratives
- Preserve diver initials exactly
- Flag CONFLICTING/REVERSED direction immediately when detected
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

