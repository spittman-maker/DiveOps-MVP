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
  Station, InsertStation,
  DiveLogDetails, InsertDiveLogDetails,
  DailySummary, InsertDailySummary,
  DivePlanTemplate, InsertDivePlanTemplate,
  ProjectDivePlan, InsertProjectDivePlan,
  DirectoryFacility, InsertDirectoryFacility,
  ProjectDirectory, InsertProjectDirectory,
  ProjectMember, InsertProjectMember,
  UserPreferences, InsertUserPreferences,
  LibraryDocument, InsertLibraryDocument,
  LibraryExport, InsertLibraryExport,
  Company, InsertCompany,
  WorkLibraryItem, InsertWorkLibraryItem,
  CompanyRole, InsertCompanyRole,
  CompanyContactsDefault, InsertCompanyContactsDefault,
  ProjectWorkSelection, InsertProjectWorkSelection,
  ProjectContact, InsertProjectContact,
} from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle({ client: pool, schema, casing: "snake_case" });

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByInitials(initials: string, projectId: string): Promise<User | undefined>;
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
  getMostRecentDayByProject(projectId: string): Promise<Day | undefined>;
  getShiftCountForDate(projectId: string, date: string): Promise<number>;
  updateDay(id: string, updates: Partial<InsertDay>): Promise<Day | undefined>;
  closeDay(id: string, closedBy: string): Promise<Day | undefined>;
  reopenDay(id: string): Promise<Day | undefined>;

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
  updateDive(id: string, updates: Record<string, any>): Promise<Dive | undefined>;
  getOrCreateDiveForDiver(dayId: string, projectId: string, diverId: string): Promise<Dive>;
  getOrCreateDiveByDisplayName(dayId: string, projectId: string, displayName: string, station?: string): Promise<Dive>;
  updateDiveTimes(diveId: string, field: 'lsTime' | 'rbTime' | 'lbTime' | 'rsTime', time: Date, depthFsw?: number): Promise<Dive | undefined>;

  // Dive Confirmations
  createDiveConfirmation(confirmation: InsertDiveConfirmation): Promise<DiveConfirmation>;
  getDiveConfirmation(diveId: string, diverId: string): Promise<DiveConfirmation | undefined>;

  // Risk Items
  createRiskItem(risk: InsertRiskItem): Promise<RiskItem>;
  getRiskItem(id: string): Promise<RiskItem | undefined>;
  getRiskItemsByDay(dayId: string): Promise<RiskItem[]>;
  getRiskItemsByProject(projectId: string): Promise<RiskItem[]>;
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
  getDivePlanByDay(dayId: string): Promise<DivePlan | undefined>;
  updateDivePlan(id: string, updates: Partial<InsertDivePlan>): Promise<DivePlan | undefined>;

  // Stations
  createStation(station: InsertStation): Promise<Station>;
  getStation(id: string): Promise<Station | undefined>;
  getStationsByDivePlan(divePlanId: string): Promise<Station[]>;
  updateStation(id: string, updates: Partial<InsertStation>): Promise<Station | undefined>;
  deleteStation(id: string): Promise<boolean>;

  // Dive Log Details
  createDiveLogDetails(details: InsertDiveLogDetails): Promise<DiveLogDetails>;
  getDiveLogDetails(diveId: string): Promise<DiveLogDetails | undefined>;
  updateDiveLogDetails(id: string, updates: Partial<InsertDiveLogDetails>): Promise<DiveLogDetails | undefined>;

  // Daily Summaries
  getDailySummary(dayId: string): Promise<DailySummary | undefined>;
  createOrUpdateDailySummary(summary: InsertDailySummary): Promise<DailySummary>;

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

  // Library Exports
  createLibraryExport(exportData: InsertLibraryExport): Promise<LibraryExport>;
  getLibraryExports(projectId: string): Promise<LibraryExport[]>;
  getLibraryExportsByDay(dayId: string): Promise<LibraryExport[]>;
  getLibraryExport(id: string): Promise<LibraryExport | undefined>;

  // Dive Plan Templates
  createDivePlanTemplate(template: InsertDivePlanTemplate): Promise<DivePlanTemplate>;
  getDivePlanTemplate(id: string): Promise<DivePlanTemplate | undefined>;
  getDivePlanTemplates(): Promise<DivePlanTemplate[]>;

  // Project Dive Plans
  createProjectDivePlan(plan: InsertProjectDivePlan): Promise<ProjectDivePlan>;
  getProjectDivePlan(id: string): Promise<ProjectDivePlan | undefined>;
  getProjectDivePlansByProject(projectId: string): Promise<ProjectDivePlan[]>;
  getActiveProjectDivePlan(projectId: string): Promise<ProjectDivePlan | undefined>;
  getLatestProjectDivePlanRevision(projectId: string): Promise<number>;
  updateProjectDivePlan(id: string, updates: Partial<InsertProjectDivePlan>): Promise<ProjectDivePlan | undefined>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  getAllCompanies(): Promise<Company[]>;

  // Work Library
  getAllWorkLibraryItems(): Promise<WorkLibraryItem[]>;
  getActiveWorkLibraryItems(): Promise<WorkLibraryItem[]>;

  // Company Roles
  getCompanyRoles(companyId: string): Promise<CompanyRole[]>;

  // Company Contact Defaults
  getCompanyContactsDefaults(companyId: string): Promise<(CompanyContactsDefault & { roleName: string; sortOrder: number })[]>;

  // Project Work Selections
  getProjectWorkSelections(projectId: string): Promise<(ProjectWorkSelection & { category: string; label: string })[]>;
  setProjectWorkSelections(projectId: string, workItemIds: string[]): Promise<void>;

  // Project Contacts
  getProjectContacts(projectId: string): Promise<(ProjectContact & { roleName: string; sortOrder: number })[]>;
  setProjectContact(projectId: string, roleId: string, name: string, phone: string, email?: string): Promise<ProjectContact>;

  // Dashboard Layouts
  getDashboardLayout(userId: string): Promise<schema.DashboardLayoutRecord | undefined>;
  saveDashboardLayout(userId: string, layoutData: schema.DashboardLayout): Promise<schema.DashboardLayoutRecord>;
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

  async getUserByInitials(initials: string, projectId: string): Promise<User | undefined> {
    // Find user by initials within project members
    const members = await db.select({ user: schema.users })
      .from(schema.projectMembers)
      .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
      .where(eq(schema.projectMembers.projectId, projectId));
    
    const upperInitials = initials.toUpperCase().trim();
    
    for (const { user } of members) {
      // Priority 1: Check explicit initials field (stored on user record)
      if (user.initials && user.initials.toUpperCase().trim() === upperInitials) {
        return user;
      }
    }
    
    for (const { user } of members) {
      // Priority 2: Check username matches initials
      if (user.username.toUpperCase().trim() === upperInitials) return user;
      
      // Priority 3: Check full name initials
      if (user.fullName) {
        const nameInitials = user.fullName.split(' ')
          .map(n => n.charAt(0).toUpperCase())
          .join('');
        if (nameInitials === upperInitials) return user;
      }
    }
    return undefined;
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

  async getMostRecentDayByProject(projectId: string): Promise<Day | undefined> {
    const [day] = await db.select().from(schema.days)
      .where(eq(schema.days.projectId, projectId))
      .orderBy(desc(schema.days.createdAt))
      .limit(1);
    return day;
  }

  async getShiftCountForDate(projectId: string, date: string): Promise<number> {
    const days = await db.select().from(schema.days)
      .where(and(eq(schema.days.projectId, projectId), eq(schema.days.date, date)));
    return days.length;
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

  async reopenDay(id: string): Promise<Day | undefined> {
    const [updated] = await db.update(schema.days)
      .set({ status: "ACTIVE", closedBy: null, closedAt: null, updatedAt: new Date() })
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
    const [created] = await db.insert(schema.dives).values(dive as any).returning();
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

  async updateDive(id: string, updates: Record<string, any>): Promise<Dive | undefined> {
    const [updated] = await db.update(schema.dives)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.dives.id, id))
      .returning();
    return updated;
  }

  async getOrCreateDiveForDiver(dayId: string, projectId: string, diverId: string): Promise<Dive> {
    // Find existing dive for this diver on this day that doesn't have all times filled
    const existingDives = await db.select().from(schema.dives)
      .where(and(eq(schema.dives.dayId, dayId), eq(schema.dives.diverId, diverId)))
      .orderBy(desc(schema.dives.diveNumber));
    
    // Find a dive that is incomplete (missing rsTime means dive in progress)
    const incompleteDive = existingDives.find(d => !d.rsTime);
    if (incompleteDive) return incompleteDive;
    
    // Create new dive
    const nextNumber = existingDives.length > 0 ? existingDives[0].diveNumber + 1 : 1;
    const [created] = await db.insert(schema.dives).values({
      dayId,
      projectId,
      diverId,
      diveNumber: nextNumber,
    }).returning();
    return created!;
  }

  async getOrCreateDiveByDisplayName(dayId: string, projectId: string, displayName: string, station?: string): Promise<Dive> {
    const allDayDives = await db.select().from(schema.dives)
      .where(eq(schema.dives.dayId, dayId))
      .orderBy(desc(schema.dives.diveNumber));

    const isInitials = displayName.length <= 3 && /^[A-Z]{2,3}$/.test(displayName);

    function deriveInitials(name: string): string {
      const parts = name.split(/[\s.]+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return name.toUpperCase();
    }

    const matchingDives = allDayDives.filter(d => {
      const dn = d.diverDisplayName || "";
      if (dn === displayName) return true;
      if (isInitials && dn.length > 3) {
        return deriveInitials(dn) === displayName;
      }
      if (!isInitials && displayName.length > 3 && dn.length <= 3) {
        return deriveInitials(displayName) === dn;
      }
      return false;
    });

    const incompleteDive = matchingDives.find(d => !d.rsTime);
    if (incompleteDive) return incompleteDive;

    if (matchingDives.length > 0) {
      const latest = matchingDives.sort((a, b) => b.diveNumber - a.diveNumber)[0];
      if (latest.rsTime) {
        const nextNumber = allDayDives.length > 0 ? allDayDives[0].diveNumber + 1 : 1;
        const useName = latest.diverDisplayName && latest.diverDisplayName.length > 3
          ? latest.diverDisplayName : displayName;
        const [created] = await db.insert(schema.dives).values({
          dayId,
          projectId,
          diverDisplayName: useName,
          station: station || latest.station || null,
          diveNumber: nextNumber,
        } as any).returning();
        return created!;
      }
    }

    const nextNumber = allDayDives.length > 0 ? allDayDives[0].diveNumber + 1 : 1;
    const [created] = await db.insert(schema.dives).values({
      dayId,
      projectId,
      diverDisplayName: displayName,
      station: station || null,
      diveNumber: nextNumber,
    } as any).returning();
    return created!;
  }

  async updateDiveTimes(diveId: string, field: 'lsTime' | 'rbTime' | 'lbTime' | 'rsTime', time: Date, depthFsw?: number): Promise<Dive | undefined> {
    const updates: any = { [field]: time, updatedAt: new Date() };
    if (depthFsw) updates.maxDepthFsw = depthFsw;
    
    const [updated] = await db.update(schema.dives)
      .set(updates)
      .where(eq(schema.dives.id, diveId))
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

  async getRiskItemsByProject(projectId: string): Promise<RiskItem[]> {
    return await db.select().from(schema.riskItems)
      .where(eq(schema.riskItems.projectId, projectId))
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

  async getDivePlanByDay(dayId: string): Promise<DivePlan | undefined> {
    const [plan] = await db.select().from(schema.divePlans)
      .where(eq(schema.divePlans.dayId, dayId));
    return plan;
  }

  // Stations
  async createStation(station: InsertStation): Promise<Station> {
    const [created] = await db.insert(schema.stations).values(station as any).returning();
    return created!;
  }

  async getStation(id: string): Promise<Station | undefined> {
    const [station] = await db.select().from(schema.stations).where(eq(schema.stations.id, id));
    return station;
  }

  async getStationsByDivePlan(divePlanId: string): Promise<Station[]> {
    return await db.select().from(schema.stations)
      .where(eq(schema.stations.divePlanId, divePlanId))
      .orderBy(schema.stations.stationId);
  }

  async updateStation(id: string, updates: Partial<InsertStation>): Promise<Station | undefined> {
    const [updated] = await db.update(schema.stations)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.stations.id, id))
      .returning();
    return updated;
  }

  async deleteStation(id: string): Promise<boolean> {
    const result = await db.delete(schema.stations).where(eq(schema.stations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Dive Log Details
  async createDiveLogDetails(details: InsertDiveLogDetails): Promise<DiveLogDetails> {
    const [created] = await db.insert(schema.diveLogDetails).values(details as any).returning();
    return created!;
  }

  async getDiveLogDetails(diveId: string): Promise<DiveLogDetails | undefined> {
    const [details] = await db.select().from(schema.diveLogDetails)
      .where(eq(schema.diveLogDetails.diveId, diveId));
    return details;
  }

  async updateDiveLogDetails(id: string, updates: Partial<InsertDiveLogDetails>): Promise<DiveLogDetails | undefined> {
    const [updated] = await db.update(schema.diveLogDetails)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.diveLogDetails.id, id))
      .returning();
    return updated;
  }

  // Daily Summaries
  async getDailySummary(dayId: string): Promise<DailySummary | undefined> {
    const [summary] = await db.select().from(schema.dailySummaries)
      .where(eq(schema.dailySummaries.dayId, dayId));
    return summary;
  }

  async createOrUpdateDailySummary(summary: InsertDailySummary): Promise<DailySummary> {
    const existing = await this.getDailySummary(summary.dayId);
    if (existing) {
      const [updated] = await db.update(schema.dailySummaries)
        .set({ ...summary, updatedAt: new Date() } as any)
        .where(eq(schema.dailySummaries.id, existing.id))
        .returning();
      return updated!;
    }
    const [created] = await db.insert(schema.dailySummaries).values(summary as any).returning();
    return created!;
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
    const [created] = await db.insert(schema.libraryDocuments).values(doc as any).returning();
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

  // Library Exports
  async createLibraryExport(exportData: InsertLibraryExport): Promise<LibraryExport> {
    const [created] = await db.insert(schema.libraryExports).values(exportData as any).returning();
    return created!;
  }

  async getLibraryExports(projectId: string): Promise<LibraryExport[]> {
    return await db.select().from(schema.libraryExports)
      .where(eq(schema.libraryExports.projectId, projectId))
      .orderBy(desc(schema.libraryExports.exportedAt));
  }

  async getLibraryExportsByDay(dayId: string): Promise<LibraryExport[]> {
    return await db.select().from(schema.libraryExports)
      .where(eq(schema.libraryExports.dayId, dayId))
      .orderBy(schema.libraryExports.fileName);
  }

  async getLibraryExport(id: string): Promise<LibraryExport | undefined> {
    const [exportDoc] = await db.select().from(schema.libraryExports)
      .where(eq(schema.libraryExports.id, id));
    return exportDoc;
  }

  // Dive Plan Templates
  async createDivePlanTemplate(template: InsertDivePlanTemplate): Promise<DivePlanTemplate> {
    const [created] = await db.insert(schema.divePlanTemplates).values(template as any).returning();
    return created!;
  }

  async getDivePlanTemplate(id: string): Promise<DivePlanTemplate | undefined> {
    const [template] = await db.select().from(schema.divePlanTemplates)
      .where(eq(schema.divePlanTemplates.id, id));
    return template;
  }

  async getDivePlanTemplates(): Promise<DivePlanTemplate[]> {
    return await db.select().from(schema.divePlanTemplates)
      .orderBy(schema.divePlanTemplates.name);
  }

  // Project Dive Plans
  async createProjectDivePlan(plan: InsertProjectDivePlan): Promise<ProjectDivePlan> {
    const [created] = await db.insert(schema.projectDivePlans).values(plan as any).returning();
    return created!;
  }

  async getProjectDivePlan(id: string): Promise<ProjectDivePlan | undefined> {
    const [plan] = await db.select().from(schema.projectDivePlans)
      .where(eq(schema.projectDivePlans.id, id));
    return plan;
  }

  async getProjectDivePlansByProject(projectId: string): Promise<ProjectDivePlan[]> {
    return await db.select().from(schema.projectDivePlans)
      .where(eq(schema.projectDivePlans.projectId, projectId))
      .orderBy(desc(schema.projectDivePlans.revision));
  }

  async getActiveProjectDivePlan(projectId: string): Promise<ProjectDivePlan | undefined> {
    const [plan] = await db.select().from(schema.projectDivePlans)
      .where(and(
        eq(schema.projectDivePlans.projectId, projectId),
        eq(schema.projectDivePlans.status, "Approved")
      ))
      .orderBy(desc(schema.projectDivePlans.revision));
    return plan;
  }

  async getLatestProjectDivePlanRevision(projectId: string): Promise<number> {
    const [result] = await db.select({ maxRevision: sql<number>`COALESCE(MAX(${schema.projectDivePlans.revision}), -1)` })
      .from(schema.projectDivePlans)
      .where(eq(schema.projectDivePlans.projectId, projectId));
    return result?.maxRevision ?? -1;
  }

  async updateProjectDivePlan(id: string, updates: Partial<InsertProjectDivePlan>): Promise<ProjectDivePlan | undefined> {
    const [updated] = await db.update(schema.projectDivePlans)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(schema.projectDivePlans.id, id))
      .returning();
    return updated;
  }

  // Companies
  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(schema.companies)
      .where(eq(schema.companies.companyId, id));
    return company;
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(schema.companies);
  }

  // Work Library
  async getAllWorkLibraryItems(): Promise<WorkLibraryItem[]> {
    return await db.select().from(schema.workLibraryItems)
      .orderBy(schema.workLibraryItems.category, schema.workLibraryItems.label);
  }

  async getActiveWorkLibraryItems(): Promise<WorkLibraryItem[]> {
    return await db.select().from(schema.workLibraryItems)
      .where(eq(schema.workLibraryItems.isActive, true))
      .orderBy(schema.workLibraryItems.category, schema.workLibraryItems.label);
  }

  // Company Roles
  async getCompanyRoles(companyId: string): Promise<CompanyRole[]> {
    return await db.select().from(schema.companyRoles)
      .where(eq(schema.companyRoles.companyId, companyId))
      .orderBy(schema.companyRoles.sortOrder);
  }

  // Company Contact Defaults
  async getCompanyContactsDefaults(companyId: string): Promise<(CompanyContactsDefault & { roleName: string; sortOrder: number })[]> {
    const results = await db.select({
      companyId: schema.companyContactsDefaults.companyId,
      roleId: schema.companyContactsDefaults.roleId,
      defaultName: schema.companyContactsDefaults.defaultName,
      defaultPhone: schema.companyContactsDefaults.defaultPhone,
      defaultEmail: schema.companyContactsDefaults.defaultEmail,
      roleName: schema.companyRoles.roleName,
      sortOrder: schema.companyRoles.sortOrder,
    })
      .from(schema.companyContactsDefaults)
      .innerJoin(schema.companyRoles, eq(schema.companyContactsDefaults.roleId, schema.companyRoles.roleId))
      .where(eq(schema.companyContactsDefaults.companyId, companyId))
      .orderBy(schema.companyRoles.sortOrder);
    return results;
  }

  // Project Work Selections
  async getProjectWorkSelections(projectId: string): Promise<(ProjectWorkSelection & { category: string; label: string })[]> {
    const results = await db.select({
      id: schema.projectWorkSelections.id,
      projectId: schema.projectWorkSelections.projectId,
      workItemId: schema.projectWorkSelections.workItemId,
      sortOrder: schema.projectWorkSelections.sortOrder,
      createdAt: schema.projectWorkSelections.createdAt,
      category: schema.workLibraryItems.category,
      label: schema.workLibraryItems.label,
    })
      .from(schema.projectWorkSelections)
      .innerJoin(schema.workLibraryItems, eq(schema.projectWorkSelections.workItemId, schema.workLibraryItems.workItemId))
      .where(eq(schema.projectWorkSelections.projectId, projectId))
      .orderBy(schema.projectWorkSelections.sortOrder);
    return results;
  }

  async setProjectWorkSelections(projectId: string, workItemIds: string[]): Promise<void> {
    await db.delete(schema.projectWorkSelections)
      .where(eq(schema.projectWorkSelections.projectId, projectId));
    
    if (workItemIds.length > 0) {
      await db.insert(schema.projectWorkSelections).values(
        workItemIds.map((workItemId, idx) => ({
          projectId,
          workItemId,
          sortOrder: idx,
        }))
      );
    }
  }

  // Project Contacts
  async getProjectContacts(projectId: string): Promise<(ProjectContact & { roleName: string; sortOrder: number })[]> {
    const results = await db.select({
      id: schema.projectContacts.id,
      projectId: schema.projectContacts.projectId,
      roleId: schema.projectContacts.roleId,
      contactName: schema.projectContacts.contactName,
      contactPhone: schema.projectContacts.contactPhone,
      contactEmail: schema.projectContacts.contactEmail,
      createdAt: schema.projectContacts.createdAt,
      roleName: schema.companyRoles.roleName,
      sortOrder: schema.companyRoles.sortOrder,
    })
      .from(schema.projectContacts)
      .innerJoin(schema.companyRoles, eq(schema.projectContacts.roleId, schema.companyRoles.roleId))
      .where(eq(schema.projectContacts.projectId, projectId))
      .orderBy(schema.companyRoles.sortOrder);
    return results;
  }

  async setProjectContact(projectId: string, roleId: string, name: string, phone: string, email?: string): Promise<ProjectContact> {
    const existing = await db.select().from(schema.projectContacts)
      .where(and(
        eq(schema.projectContacts.projectId, projectId),
        eq(schema.projectContacts.roleId, roleId)
      ));
    
    if (existing.length > 0) {
      const [updated] = await db.update(schema.projectContacts)
        .set({ contactName: name, contactPhone: phone, contactEmail: email })
        .where(eq(schema.projectContacts.id, existing[0].id))
        .returning();
      return updated!;
    } else {
      const [created] = await db.insert(schema.projectContacts)
        .values({ projectId, roleId, contactName: name, contactPhone: phone, contactEmail: email })
        .returning();
      return created!;
    }
  }

  // Dashboard Layouts
  async getDashboardLayout(userId: string): Promise<schema.DashboardLayoutRecord | undefined> {
    const [layout] = await db.select().from(schema.dashboardLayouts)
      .where(eq(schema.dashboardLayouts.userId, userId));
    return layout;
  }

  async saveDashboardLayout(userId: string, layoutData: schema.DashboardLayout): Promise<schema.DashboardLayoutRecord> {
    const existing = await this.getDashboardLayout(userId);
    
    if (existing) {
      const [updated] = await db.update(schema.dashboardLayouts)
        .set({ layoutData, updatedAt: new Date() })
        .where(eq(schema.dashboardLayouts.userId, userId))
        .returning();
      return updated!;
    } else {
      const [created] = await db.insert(schema.dashboardLayouts)
        .values({ userId, layoutData })
        .returning();
      return created!;
    }
  }
}

export const storage = new DbStorage();
