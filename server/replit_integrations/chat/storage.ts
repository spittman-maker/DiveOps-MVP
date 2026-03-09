import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc, and, isNull, or } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number, userId?: string): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(userId?: string): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string, userId?: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number, userId?: string) {
    if (userId) {
      // Return conversation only if it belongs to this user or has no user (legacy)
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, id),
            or(eq(conversations.userId, userId), isNull(conversations.userId))
          )
        );
      return conversation;
    }
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  },

  async getAllConversations(userId?: string) {
    if (userId) {
      // Return only conversations belonging to this user or with no user (legacy)
      return db
        .select()
        .from(conversations)
        .where(or(eq(conversations.userId, userId), isNull(conversations.userId)))
        .orderBy(desc(conversations.createdAt));
    }
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string, userId?: string) {
    const [conversation] = await db
      .insert(conversations)
      .values({ title, userId: userId || null })
      .returning();
    return conversation;
  },

  async deleteConversation(id: number) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },
};
