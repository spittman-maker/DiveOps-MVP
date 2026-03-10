import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./storage";
import * as safetySchema from "@shared/safety-schema";
import type {
  SafetyChecklist, InsertSafetyChecklist,
  ChecklistItem, InsertChecklistItem,
  ChecklistCompletion, InsertChecklistCompletion,
  JhaRecord, InsertJhaRecord,
  SafetyMeeting, InsertSafetyMeeting,
  NearMissReport, InsertNearMissReport,
  SafetyTopic, InsertSafetyTopic,
  JhaHazard, InsertJhaHazard,
} from "@shared/safety-schema";

export class SafetyStorage {
  // ── Safety Checklists ──────────────────────────────────────────────────

  async createChecklist(checklist: InsertSafetyChecklist): Promise<SafetyChecklist> {
    const [created] = await db.insert(safetySchema.safetyChecklists)
      .values(checklist as any).returning();
    return created!;
  }

  async getChecklist(id: string): Promise<SafetyChecklist | undefined> {
    const [checklist] = await db.select().from(safetySchema.safetyChecklists)
      .where(eq(safetySchema.safetyChecklists.id, id));
    return checklist;
  }

  async getChecklistsByProject(projectId: string, type?: string): Promise<SafetyChecklist[]> {
    if (type) {
      return await db.select().from(safetySchema.safetyChecklists)
        .where(and(
          eq(safetySchema.safetyChecklists.projectId, projectId),
          eq(safetySchema.safetyChecklists.checklistType, type as any),
          eq(safetySchema.safetyChecklists.isActive, true),
        ))
        .orderBy(safetySchema.safetyChecklists.createdAt);
    }
    return await db.select().from(safetySchema.safetyChecklists)
      .where(and(
        eq(safetySchema.safetyChecklists.projectId, projectId),
        eq(safetySchema.safetyChecklists.isActive, true),
      ))
      .orderBy(safetySchema.safetyChecklists.createdAt);
  }

  async updateChecklist(id: string, updates: Partial<InsertSafetyChecklist>): Promise<SafetyChecklist | undefined> {
    const [updated] = await db.update(safetySchema.safetyChecklists)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(safetySchema.safetyChecklists.id, id))
      .returning();
    return updated;
  }

  async deleteChecklist(id: string): Promise<boolean> {
    const result = await db.update(safetySchema.safetyChecklists)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(safetySchema.safetyChecklists.id, id));
    return true;
  }

  // ── Checklist Items ────────────────────────────────────────────────────

  async createChecklistItem(item: InsertChecklistItem): Promise<ChecklistItem> {
    const [created] = await db.insert(safetySchema.checklistItems)
      .values(item as any).returning();
    return created!;
  }

  async getChecklistItems(checklistId: string): Promise<ChecklistItem[]> {
    return await db.select().from(safetySchema.checklistItems)
      .where(eq(safetySchema.checklistItems.checklistId, checklistId))
      .orderBy(safetySchema.checklistItems.sortOrder);
  }

  async updateChecklistItem(id: string, updates: Partial<InsertChecklistItem>): Promise<ChecklistItem | undefined> {
    const [updated] = await db.update(safetySchema.checklistItems)
      .set(updates as any)
      .where(eq(safetySchema.checklistItems.id, id))
      .returning();
    return updated;
  }

  async deleteChecklistItem(id: string): Promise<boolean> {
    await db.delete(safetySchema.checklistItems)
      .where(eq(safetySchema.checklistItems.id, id));
    return true;
  }

  async bulkCreateChecklistItems(items: InsertChecklistItem[]): Promise<ChecklistItem[]> {
    if (items.length === 0) return [];
    const created = await db.insert(safetySchema.checklistItems)
      .values(items as any[]).returning();
    return created;
  }

  // ── Checklist Completions ──────────────────────────────────────────────

  async createCompletion(completion: InsertChecklistCompletion): Promise<ChecklistCompletion> {
    const [created] = await db.insert(safetySchema.checklistCompletions)
      .values(completion as any).returning();
    return created!;
  }

  async getCompletion(id: string): Promise<ChecklistCompletion | undefined> {
    const [completion] = await db.select().from(safetySchema.checklistCompletions)
      .where(eq(safetySchema.checklistCompletions.id, id));
    return completion;
  }

  async getCompletionsByProject(projectId: string): Promise<ChecklistCompletion[]> {
    return await db.select().from(safetySchema.checklistCompletions)
      .where(eq(safetySchema.checklistCompletions.projectId, projectId))
      .orderBy(desc(safetySchema.checklistCompletions.createdAt));
  }

  async getCompletionsByDay(dayId: string): Promise<ChecklistCompletion[]> {
    return await db.select().from(safetySchema.checklistCompletions)
      .where(eq(safetySchema.checklistCompletions.dayId, dayId))
      .orderBy(desc(safetySchema.checklistCompletions.createdAt));
  }

  async updateCompletion(id: string, updates: Partial<InsertChecklistCompletion>): Promise<ChecklistCompletion | undefined> {
    const [updated] = await db.update(safetySchema.checklistCompletions)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(safetySchema.checklistCompletions.id, id))
      .returning();
    return updated;
  }

  // ── JHA Records ────────────────────────────────────────────────────────

  async createJha(jha: InsertJhaRecord): Promise<JhaRecord> {
    const [created] = await db.insert(safetySchema.jhaRecords)
      .values(jha as any).returning();
    return created!;
  }

  async getJha(id: string): Promise<JhaRecord | undefined> {
    const [jha] = await db.select().from(safetySchema.jhaRecords)
      .where(eq(safetySchema.jhaRecords.id, id));
    return jha;
  }

  async getJhasByProject(projectId: string): Promise<JhaRecord[]> {
    return await db.select().from(safetySchema.jhaRecords)
      .where(eq(safetySchema.jhaRecords.projectId, projectId))
      .orderBy(desc(safetySchema.jhaRecords.createdAt));
  }

  async getJhasByDay(dayId: string): Promise<JhaRecord[]> {
    return await db.select().from(safetySchema.jhaRecords)
      .where(eq(safetySchema.jhaRecords.dayId, dayId))
      .orderBy(desc(safetySchema.jhaRecords.createdAt));
  }

  async updateJha(id: string, updates: Partial<InsertJhaRecord>): Promise<JhaRecord | undefined> {
    const [updated] = await db.update(safetySchema.jhaRecords)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(safetySchema.jhaRecords.id, id))
      .returning();
    return updated;
  }

  // ── Safety Meetings ────────────────────────────────────────────────────

  async createMeeting(meeting: InsertSafetyMeeting): Promise<SafetyMeeting> {
    const [created] = await db.insert(safetySchema.safetyMeetings)
      .values(meeting as any).returning();
    return created!;
  }

  async getMeeting(id: string): Promise<SafetyMeeting | undefined> {
    const [meeting] = await db.select().from(safetySchema.safetyMeetings)
      .where(eq(safetySchema.safetyMeetings.id, id));
    return meeting;
  }

  async getMeetingsByProject(projectId: string): Promise<SafetyMeeting[]> {
    return await db.select().from(safetySchema.safetyMeetings)
      .where(eq(safetySchema.safetyMeetings.projectId, projectId))
      .orderBy(desc(safetySchema.safetyMeetings.createdAt));
  }

  async getMeetingsByDay(dayId: string): Promise<SafetyMeeting[]> {
    return await db.select().from(safetySchema.safetyMeetings)
      .where(eq(safetySchema.safetyMeetings.dayId, dayId))
      .orderBy(desc(safetySchema.safetyMeetings.createdAt));
  }

  async updateMeeting(id: string, updates: Partial<InsertSafetyMeeting>): Promise<SafetyMeeting | undefined> {
    const [updated] = await db.update(safetySchema.safetyMeetings)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(safetySchema.safetyMeetings.id, id))
      .returning();
    return updated;
  }

  // ── Near-Miss Reports ──────────────────────────────────────────────────

  async createNearMiss(report: InsertNearMissReport): Promise<NearMissReport> {
    const [created] = await db.insert(safetySchema.nearMissReports)
      .values(report as any).returning();
    return created!;
  }

  async getNearMiss(id: string): Promise<NearMissReport | undefined> {
    const [report] = await db.select().from(safetySchema.nearMissReports)
      .where(eq(safetySchema.nearMissReports.id, id));
    return report;
  }

  async getNearMissesByProject(projectId: string): Promise<NearMissReport[]> {
    return await db.select().from(safetySchema.nearMissReports)
      .where(eq(safetySchema.nearMissReports.projectId, projectId))
      .orderBy(desc(safetySchema.nearMissReports.createdAt));
  }

  async getNearMissesByDay(dayId: string): Promise<NearMissReport[]> {
    return await db.select().from(safetySchema.nearMissReports)
      .where(eq(safetySchema.nearMissReports.dayId, dayId))
      .orderBy(desc(safetySchema.nearMissReports.createdAt));
  }

  async updateNearMiss(id: string, updates: Partial<InsertNearMissReport>): Promise<NearMissReport | undefined> {
    const [updated] = await db.update(safetySchema.nearMissReports)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(safetySchema.nearMissReports.id, id))
      .returning();
    return updated;
  }

  // ── Safety Topic Library ───────────────────────────────────────────────

  async getSafetyTopics(category?: string): Promise<SafetyTopic[]> {
    if (category) {
      return await db.select().from(safetySchema.safetyTopicLibrary)
        .where(and(
          eq(safetySchema.safetyTopicLibrary.category, category as any),
          eq(safetySchema.safetyTopicLibrary.isActive, true),
        ))
        .orderBy(safetySchema.safetyTopicLibrary.title);
    }
    return await db.select().from(safetySchema.safetyTopicLibrary)
      .where(eq(safetySchema.safetyTopicLibrary.isActive, true))
      .orderBy(safetySchema.safetyTopicLibrary.title);
  }

  async getSafetyTopicCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.safetyTopicLibrary);
    return Number(result?.count ?? 0);
  }

  async bulkCreateSafetyTopics(topics: InsertSafetyTopic[]): Promise<SafetyTopic[]> {
    if (topics.length === 0) return [];
    const created = await db.insert(safetySchema.safetyTopicLibrary)
      .values(topics as any[]).returning();
    return created;
  }

  // ── JHA Hazard Library ────────────────────────────────────────────────

  async getJhaHazards(category?: string): Promise<JhaHazard[]> {
    if (category) {
      return await db.select().from(safetySchema.jhaHazardLibrary)
        .where(and(
          eq(safetySchema.jhaHazardLibrary.category, category as any),
          eq(safetySchema.jhaHazardLibrary.isActive, true),
        ))
        .orderBy(safetySchema.jhaHazardLibrary.hazard);
    }
    return await db.select().from(safetySchema.jhaHazardLibrary)
      .where(eq(safetySchema.jhaHazardLibrary.isActive, true))
      .orderBy(safetySchema.jhaHazardLibrary.hazard);
  }

  async getJhaHazardCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.jhaHazardLibrary);
    return Number(result?.count ?? 0);
  }

  async bulkCreateJhaHazards(hazards: InsertJhaHazard[]): Promise<JhaHazard[]> {
    if (hazards.length === 0) return [];
    const created = await db.insert(safetySchema.jhaHazardLibrary)
      .values(hazards as any[]).returning();
    return created;
  }

  // ── Safety Metrics ─────────────────────────────────────────────────────

  async getSafetyMetrics(projectId: string): Promise<{
    totalChecklists: number;
    completedToday: number;
    openNearMisses: number;
    totalNearMisses: number;
    activeJhas: number;
    meetingsThisWeek: number;
  }> {
    const today = new Date().toISOString().split("T")[0];

    const [checklistCount] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.checklistCompletions)
      .where(eq(safetySchema.checklistCompletions.projectId, projectId));

    const [completedToday] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.checklistCompletions)
      .where(and(
        eq(safetySchema.checklistCompletions.projectId, projectId),
        sql`DATE(${safetySchema.checklistCompletions.createdAt}) = ${today}`,
      ));

    const [openNearMisses] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.nearMissReports)
      .where(and(
        eq(safetySchema.nearMissReports.projectId, projectId),
        sql`${safetySchema.nearMissReports.status} IN ('reported', 'under_review')`,
      ));

    const [totalNearMisses] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.nearMissReports)
      .where(eq(safetySchema.nearMissReports.projectId, projectId));

    const [activeJhas] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.jhaRecords)
      .where(and(
        eq(safetySchema.jhaRecords.projectId, projectId),
        sql`${safetySchema.jhaRecords.status} IN ('draft', 'pending_review', 'approved')`,
      ));

    const [meetingsThisWeek] = await db.select({ count: sql<number>`count(*)` })
      .from(safetySchema.safetyMeetings)
      .where(and(
        eq(safetySchema.safetyMeetings.projectId, projectId),
        sql`${safetySchema.safetyMeetings.createdAt} >= NOW() - INTERVAL '7 days'`,
      ));

    return {
      totalChecklists: Number(checklistCount?.count ?? 0),
      completedToday: Number(completedToday?.count ?? 0),
      openNearMisses: Number(openNearMisses?.count ?? 0),
      totalNearMisses: Number(totalNearMisses?.count ?? 0),
      activeJhas: Number(activeJhas?.count ?? 0),
      meetingsThisWeek: Number(meetingsThisWeek?.count ?? 0),
    };
  }
}

export const safetyStorage = new SafetyStorage();
