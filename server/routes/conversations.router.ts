import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, isGod } from "../auth";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api
// ────────────────────────────────────────────────────────────────────────────

export const conversationsRouter = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// CONVERSATION / AI CHAT ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

conversationsRouter.post("/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const { conversations } = await import("@shared/schema");
    const title = req.body.title || "DiveOps Assistant";
    const user = getUser(req);
    const [conv] = await db.insert(conversations).values({ title, userId: user.id }).returning();
    res.status(201).json(conv);
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ message: "Failed to create conversation" });
  }
});

// BUG-08 FIX: GET /api/conversations — list conversations scoped to the authenticated user
conversationsRouter.get("/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const { conversations } = await import("@shared/schema");
    const { eq, desc, isNull, or } = await import("drizzle-orm");
    const user = getUser(req);
    let convs;
    if (isGod(user.role)) {
      convs = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
    } else {
      convs = await db.select().from(conversations)
        .where(or(eq(conversations.userId, user.id), isNull(conversations.userId)))
        .orderBy(desc(conversations.createdAt));
    }
    res.json(convs);
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ message: "Failed to list conversations" });
  }
});

// BUG-08 FIX: GET /api/conversations/:id — verify conversation belongs to user
conversationsRouter.get("/conversations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const { conversations, messages: messagesTable } = await import("@shared/schema");
    const { eq, asc } = await import("drizzle-orm");
    const id = parseInt(p(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid conversation ID" });

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return res.status(404).json({ message: "Conversation not found" });
    // BUG-08: Verify conversation belongs to user (GOD bypasses)
    const user = getUser(req);
    if (!isGod(user.role) && conv.userId && conv.userId !== user.id) {
      return res.status(403).json({ message: "Forbidden: conversation belongs to another user" });
    }

    const msgs = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));

    res.json({ ...conv, messages: msgs });
  } catch (error) {
    console.error("Get conversation error:", error);
    res.status(500).json({ message: "Failed to get conversation" });
  }
});

conversationsRouter.post("/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const { conversations, messages: messagesTable, logEvents, riskItems } = await import("@shared/schema");
    const { eq, desc, asc, count } = await import("drizzle-orm");
    const id = parseInt(p(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid conversation ID" });

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return res.status(404).json({ message: "Conversation not found" });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Message content required" });

    await db.insert(messagesTable).values({
      conversationId: id,
      role: "user",
      content: content.trim(),
    });

    const priorMessages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));

    const recentLogs = await db.select().from(logEvents)
      .orderBy(desc(logEvents.createdAt))
      .limit(20);

    const openRisks = await db.select().from(riskItems)
      .where(eq(riskItems.status, "open"))
      .limit(10);

    const contextSummary = [
      `Recent log entries (${recentLogs.length}):`,
      ...recentLogs.slice(0, 10).map(e => `  ${e.eventTime ? new Date(e.eventTime).toISOString().substring(11, 16) : '??:??'} [${e.category}] ${e.rawText?.substring(0, 100)}`),
      `\nOpen risks (${openRisks.length}):`,
      ...openRisks.map(r => `  ${r.riskId}: ${r.description?.substring(0, 100)}`),
    ].join("\n");

    try {
      const openai = new (await import("openai")).default({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });

      const chatMessages = [
        {
          role: "system" as const,
          content: `You are the DiveOps™ AI Assistant for Precision Subsea Group. You help supervisors with dive operations questions, safety protocols, documentation, and operational guidance. You follow U.S. Navy Dive Manual standards. You NEVER calculate or infer dive tables or decompression data — only quote verbatim from the manual if asked. Be concise and operationally focused.\n\nCurrent operational context:\n${contextSummary}`,
        },
        ...priorMessages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 1000,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content_chunk = chunk.choices[0]?.delta?.content;
        if (content_chunk) {
          fullResponse += content_chunk;
          res.write(`data: ${JSON.stringify({ content: content_chunk })}\n\n`);
        }
      }

      await db.insert(messagesTable).values({
        conversationId: id,
        role: "assistant",
        content: fullResponse,
      });

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (aiErr: any) {
      console.error("AI chat error:", aiErr);
      const fallback = "I'm sorry, I'm having trouble connecting to the AI service right now. Please try again in a moment.";
      await db.insert(messagesTable).values({
        conversationId: id,
        role: "assistant",
        content: fallback,
      });
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error("Send message error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to send message" });
    }
  }
});
