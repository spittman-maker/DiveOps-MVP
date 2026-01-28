import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq, and, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User, InsertUser,
  Project, InsertProject,
  Day, InsertDay,
  LogEvent, InsertLogEvent,
  Dive, InsertDive,
  DiveConfirmation, InsertDiveConfirmation,
  RiskItem, InsertRiskItem,
  ClientComm, InsertClientComm,
  LogRender, InsertLogRender,
  DivePlan, InsertDivePlan,
  DirectoryFacility, InsertDirectoryFacility,
  ProjectDirectory, InsertProjectDirectory,
  ProjectMember, InsertProjectMember,
  UserPreferences, InsertUserPreferences,
  LibraryDocument, InsertLibraryDocument,
} from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle({ client: pool, schema, casing: "snake_case" });

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;

  // Projects
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined>;
  
  // Project Members
  addProjectMember(member: InsertProjectMember): Promise<ProjectMember>;
  getProjectMembers(projectId: string): Promise<ProjectMember[]>;
  getUserProjects(userId: string): Promise<Project[]>;
  
  // User Preferences
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  setActiveProject(userId: string, projectId: string): Promise<void>;

  // Days
  createDay(day: InsertDay): Promise<Day>;
  getDay(id: string): Promise<Day | undefined>;
  getDayByProjectAndDate(projectId: string, date: string): Promise<Day | undefined>;
  updateDay(id: string, updates: Partial<InsertDay>): Promise<Day | undefined>;
  closeDay(id: string, closedBy: string): Promise<Day | undefined>;

  // Log Events
  createLogEvent(event: InsertLogEvent): Promise<LogEvent>;
  getLogEvent(id: string): Promise<LogEvent | undefined>;
  getLogEventsByDay(dayId: string): Promise<LogEvent[]>;
  updateLogEvent(id: string, updates: Partial<InsertLogEvent>): Promise<LogEvent | undefined>;

  // Dives
  createDive(dive: InsertDive): Promise<Dive>;
  getDive(id: string): Promise<Dive | undefined>;
  getDivesByDay(dayId: string): Promise<Dive[]>;
  getDivesByDiver(diverId: string, dayId?: string): Promise<Dive[]>;
  updateDive(id: string, updates: Partial<InsertDive>): Promise<Dive | undefined>;

  // Dive Confirmations
  createDiveConfirmation(confirmation: InsertDiveConfirmation): Promise<DiveConfirmation>;
  getDiveConfirmation(diveId: string, diverId: string): Promise<DiveConfirmation | undefined>;

  // Risk Items
  createRiskItem(risk: InsertRiskItem): Promise<RiskItem>;
  getRiskItem(id: string): Promise<RiskItem | undefined>;
  getRiskItemsByDay(dayId: string): Promise<RiskItem[]>;
  updateRiskItem(id: string, updates: Partial<InsertRiskItem>): Promise<RiskItem | undefined>;

  // Client Comms
  createClientComm(comm: InsertClientComm): Promise<ClientComm>;
  getClientCommsByDay(dayId: string): Promise<ClientComm[]>;

  // Log Renders
  createLogRender(render: InsertLogRender): Promise<LogRender>;
  getLogRendersByEvent(logEventId: string): Promise<LogRender[]>;

  // Dive Plans
  createDivePlan(plan: InsertDivePlan): Promise<DivePlan>;
  getDivePlan(id: string): Promise<DivePlan | undefined>;
  getDivePlansByProject(projectId: string): Promise<DivePlan[]>;
  updateDivePlan(id: string, updates: Partial<InsertDivePlan>): Promise<DivePlan | undefined>;

  // Directory Facilities
  createDirectoryFacility(facility: InsertDirectoryFacility): Promise<DirectoryFacility>;
  getDirectoryFacility(id: string): Promise<DirectoryFacility | undefined>;
  getAllDirectoryFacilities(): Promise<DirectoryFacility[]>;
  updateDirectoryFacility(id: string, updates: Partial<InsertDirectoryFacility>): Promise<DirectoryFacility | undefined>;

  // Project Directory
  createProjectDirectory(directory: InsertProjectDirectory): Promise<ProjectDirectory>;
  getProjectDirectory(projectId: string): Promise<ProjectDirectory | undefined>;
  updateProjectDirectory(id: string, updates: Partial<InsertProjectDirectory>): Promise<ProjectDirectory | undefined>;

  // Library Documents
  createLibraryDocument(doc: InsertLibraryDocument): Promise<LibraryDocument>;
  getLibraryDocuments(projectId?: string): Promise<LibraryDocument[]>;
}

export class DbStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(schema.users).values(user as any).returning();
    return created!;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(schema.users)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.users.id, id))
      .returning();
    return updated;
  }

  // Projects
  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(schema.projects).values(project).returning();
    return created!;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
    return project;
  }

  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(schema.projects).orderBy(schema.projects.name);
  }

  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(schema.projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
      .returning();
    return updated;
  }

  // Project Members
  async addProjectMember(member: InsertProjectMember): Promise<ProjectMember> {
    const [created] = await db.insert(schema.projectMembers).values(member as any).returning();
    return created!;
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return await db.select().from(schema.projectMembers).where(eq(schema.projectMembers.projectId, projectId));
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    const memberships = await db.select({ projectId: schema.projectMembers.projectId })
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.userId, userId));
    
    const projectIds = memberships.map(m => m.projectId);
    if (projectIds.length === 0) return [];

    return await db.select().from(schema.projects).where(sql`${schema.projects.id} IN ${projectIds}`);
  }

  // User Preferences
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [prefs] = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, userId));
    return prefs;
  }

  async setActiveProject(userId: string, projectId: string): Promise<void> {
    await db.insert(schema.userPreferences)
      .values({ userId, activeProjectId: projectId })
      .onConflictDoUpdate({
        target: schema.userPreferences.userId,
        set: { activeProjectId: projectId },
      });
  }

  // Days
  async createDay(day: InsertDay): Promise<Day> {
    const [created] = await db.insert(schema.days).values(day as any).returning();
    return created!;
  }

  async getDay(id: string): Promise<Day | undefined> {
    const [day] = await db.select().from(schema.days).where(eq(schema.days.id, id));
    return day;
  }

  async getDayByProjectAndDate(projectId: string, date: string): Promise<Day | undefined> {
    const [day] = await db.select().from(schema.days)
      .where(and(eq(schema.days.projectId, projectId), eq(schema.days.date, date)));
    return day;
  }

  async updateDay(id: string, updates: Partial<InsertDay>): Promise<Day | undefined> {
    const [updated] = await db.update(schema.days)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.days.id, id))
      .returning();
    return updated;
  }

  async closeDay(id: string, closedBy: string): Promise<Day | undefined> {
    const [updated] = await db.update(schema.days)
      .set({ status: "CLOSED", closedBy, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.days.id, id))
      .returning();
    return updated;
  }

  // Log Events
  async createLogEvent(event: InsertLogEvent): Promise<LogEvent> {
    const [created] = await db.insert(schema.logEvents).values(event as any).returning();
    return created!;
  }

  async getLogEvent(id: string): Promise<LogEvent | undefined> {
    const [event] = await db.select().from(schema.logEvents).where(eq(schema.logEvents.id, id));
    return event;
  }

  async getLogEventsByDay(dayId: string): Promise<LogEvent[]> {
    return await db.select().from(schema.logEvents)
      .where(eq(schema.logEvents.dayId, dayId))
      .orderBy(schema.logEvents.eventTime, schema.logEvents.captureTime);
  }

  async updateLogEvent(id: string, updates: Partial<InsertLogEvent>): Promise<LogEvent | undefined> {
    const [updated] = await db.update(schema.logEvents)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.logEvents.id, id))
      .returning();
    return updated;
  }

  // Dives
  async createDive(dive: InsertDive): Promise<Dive> {
    const [created] = await db.insert(schema.dives).values(dive).returning();
    return created!;
  }

  async getDive(id: string): Promise<Dive | undefined> {
    const [dive] = await db.select().from(schema.dives).where(eq(schema.dives.id, id));
    return dive;
  }

  async getDivesByDay(dayId: string): Promise<Dive[]> {
    return await db.select().from(schema.dives)
      .where(eq(schema.dives.dayId, dayId))
      .orderBy(schema.dives.lsTime);
  }

  async getDivesByDiver(diverId: string, dayId?: string): Promise<Dive[]> {
    const conditions = dayId
      ? and(eq(schema.dives.diverId, diverId), eq(schema.dives.dayId, dayId))
      : eq(schema.dives.diverId, diverId);
    
    return await db.select().from(schema.dives)
      .where(conditions)
      .orderBy(desc(schema.dives.lsTime));
  }

  async updateDive(id: string, updates: Partial<InsertDive>): Promise<Dive | undefined> {
    const [updated] = await db.update(schema.dives)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.dives.id, id))
      .returning();
    return updated;
  }

  // Dive Confirmations
  async createDiveConfirmation(confirmation: InsertDiveConfirmation): Promise<DiveConfirmation> {
    const [created] = await db.insert(schema.diveConfirmations).values(confirmation as any).returning();
    return created!;
  }

  async getDiveConfirmation(diveId: string, diverId: string): Promise<DiveConfirmation | undefined> {
    const [confirmation] = await db.select().from(schema.diveConfirmations)
      .where(and(eq(schema.diveConfirmations.diveId, diveId), eq(schema.diveConfirmations.diverId, diverId)));
    return confirmation;
  }

  // Risk Items
  async createRiskItem(risk: InsertRiskItem): Promise<RiskItem> {
    const [created] = await db.insert(schema.riskItems).values(risk as any).returning();
    return created!;
  }

  async getRiskItem(id: string): Promise<RiskItem | undefined> {
    const [risk] = await db.select().from(schema.riskItems).where(eq(schema.riskItems.id, id));
    return risk;
  }

  async getRiskItemsByDay(dayId: string): Promise<RiskItem[]> {
    return await db.select().from(schema.riskItems)
      .where(eq(schema.riskItems.dayId, dayId))
      .orderBy(schema.riskItems.createdAt);
  }

  async updateRiskItem(id: string, updates: Partial<InsertRiskItem>): Promise<RiskItem | undefined> {
    const [updated] = await db.update(schema.riskItems)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.riskItems.id, id))
      .returning();
    return updated;
  }

  // Client Comms
  async createClientComm(comm: InsertClientComm): Promise<ClientComm> {
    const [created] = await db.insert(schema.clientComms).values(comm).returning();
    return created!;
  }

  async getClientCommsByDay(dayId: string): Promise<ClientComm[]> {
    return await db.select().from(schema.clientComms)
      .where(eq(schema.clientComms.dayId, dayId))
      .orderBy(schema.clientComms.createdAt);
  }

  // Log Renders
  async createLogRender(render: InsertLogRender): Promise<LogRender> {
    const [created] = await db.insert(schema.logRenders).values(render as any).returning();
    return created!;
  }

  async getLogRendersByEvent(logEventId: string): Promise<LogRender[]> {
    return await db.select().from(schema.logRenders)
      .where(eq(schema.logRenders.logEventId, logEventId))
      .orderBy(schema.logRenders.createdAt);
  }

  // Dive Plans
  async createDivePlan(plan: InsertDivePlan): Promise<DivePlan> {
    const [created] = await db.insert(schema.divePlans).values(plan as any).returning();
    return created!;
  }

  async getDivePlan(id: string): Promise<DivePlan | undefined> {
    const [plan] = await db.select().from(schema.divePlans).where(eq(schema.divePlans.id, id));
    return plan;
  }

  async getDivePlansByProject(projectId: string): Promise<DivePlan[]> {
    return await db.select().from(schema.divePlans)
      .where(eq(schema.divePlans.projectId, projectId))
      .orderBy(desc(schema.divePlans.createdAt));
  }

  async updateDivePlan(id: string, updates: Partial<InsertDivePlan>): Promise<DivePlan | undefined> {
    const [updated] = await db.update(schema.divePlans)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.divePlans.id, id))
      .returning();
    return updated;
  }

  // Directory Facilities
  async createDirectoryFacility(facility: InsertDirectoryFacility): Promise<DirectoryFacility> {
    const [created] = await db.insert(schema.directoryFacilities).values(facility as any).returning();
    return created!;
  }

  async getDirectoryFacility(id: string): Promise<DirectoryFacility | undefined> {
    const [facility] = await db.select().from(schema.directoryFacilities).where(eq(schema.directoryFacilities.id, id));
    return facility;
  }

  async getAllDirectoryFacilities(): Promise<DirectoryFacility[]> {
    return await db.select().from(schema.directoryFacilities).orderBy(schema.directoryFacilities.name);
  }

  async updateDirectoryFacility(id: string, updates: Partial<InsertDirectoryFacility>): Promise<DirectoryFacility | undefined> {
    const [updated] = await db.update(schema.directoryFacilities)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.directoryFacilities.id, id))
      .returning();
    return updated;
  }

  // Project Directory
  async createProjectDirectory(directory: InsertProjectDirectory): Promise<ProjectDirectory> {
    const [created] = await db.insert(schema.projectDirectory).values(directory as any).returning();
    return created!;
  }

  async getProjectDirectory(projectId: string): Promise<ProjectDirectory | undefined> {
    const [directory] = await db.select().from(schema.projectDirectory)
      .where(eq(schema.projectDirectory.projectId, projectId));
    return directory;
  }

  async updateProjectDirectory(id: string, updates: Partial<InsertProjectDirectory>): Promise<ProjectDirectory | undefined> {
    const [updated] = await db.update(schema.projectDirectory)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.projectDirectory.id, id))
      .returning();
    return updated;
  }

  // Library Documents
  async createLibraryDocument(doc: InsertLibraryDocument): Promise<LibraryDocument> {
    const [created] = await db.insert(schema.libraryDocuments).values(doc).returning();
    return created!;
  }

  async getLibraryDocuments(projectId?: string): Promise<LibraryDocument[]> {
    if (projectId) {
      return await db.select().from(schema.libraryDocuments)
        .where(eq(schema.libraryDocuments.projectId, projectId))
        .orderBy(schema.libraryDocuments.title);
    }
    return await db.select().from(schema.libraryDocuments)
      .where(sql`${schema.libraryDocuments.projectId} IS NULL`)
      .orderBy(schema.libraryDocuments.title);
  }
}

export const storage = new DbStorage();
