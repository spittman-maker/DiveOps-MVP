import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, index, primaryKey, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// CHAT (for AI integration support)
// ────────────────────────────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// USERS & ROLES
// ────────────────────────────────────────────────────────────────────────────

export const userRoleEnum = z.enum(["GOD", "ADMIN", "SUPERVISOR", "DIVER"]);
export type UserRole = z.infer<typeof userRoleEnum>;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().$type<UserRole>(),
  fullName: text("full_name"),
  initials: text("initials"),
  email: text("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// PROJECTS & CLIENTS
// ────────────────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  clientName: text("client_name"),
  jobsiteName: text("jobsite_name"),
  jobsiteAddress: text("jobsite_address"),
  jobsiteLat: text("jobsite_lat"),
  jobsiteLng: text("jobsite_lng"),
  timezone: text("timezone").default("America/New_York"),
  emergencyContacts: jsonb("emergency_contacts").$type<{ name: string; role: string; phone: string }[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const projectMembers = pgTable("project_members", {
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<UserRole>(),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.userId] }),
}));

export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({ addedAt: true });
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembers.$inferSelect;

export const userPreferences = pgTable("user_preferences", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  activeProjectId: varchar("active_project_id").references(() => projects.id, { onDelete: "set null" }),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences);
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DIRECTORY FACILITIES (Admin-verified registry)
// ────────────────────────────────────────────────────────────────────────────

export const directoryFacilities = pgTable("directory_facilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityType: text("facility_type").notNull().$type<"chamber" | "emergency_room" | "urgent_care">(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  lat: text("lat").notNull(),
  lng: text("lng").notNull(),
  phone: text("phone"),
  hours: text("hours"),
  notes: text("notes"),
  lastVerifiedAt: timestamp("last_verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDirectoryFacilitySchema = createInsertSchema(directoryFacilities).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDirectoryFacility = z.infer<typeof insertDirectoryFacilitySchema>;
export type DirectoryFacility = typeof directoryFacilities.$inferSelect;

export const projectDirectory = pgTable("project_directory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  chamberId: varchar("chamber_id").references(() => directoryFacilities.id),
  emergencyRoomId: varchar("emergency_room_id").references(() => directoryFacilities.id),
  urgentCareId: varchar("urgent_care_id").references(() => directoryFacilities.id),
  status: text("status").notNull().$type<"VERIFIED" | "NEEDS_VERIFICATION">().default("NEEDS_VERIFICATION"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectDirectorySchema = createInsertSchema(projectDirectory).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectDirectory = z.infer<typeof insertProjectDirectorySchema>;
export type ProjectDirectory = typeof projectDirectory.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DAY (Calendar day 00:00–23:59 local)
// ────────────────────────────────────────────────────────────────────────────

export const dayStatusEnum = z.enum(["DRAFT", "ACTIVE", "CLOSED"]);
export type DayStatus = z.infer<typeof dayStatusEnum>;

export const days = pgTable("days", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  shift: text("shift"),
  status: text("status").notNull().$type<DayStatus>().default("DRAFT"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedBy: varchar("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
}, (t) => ({
  projectDateIdx: index("days_project_date_idx").on(t.projectId, t.date),
}));

export const insertDaySchema = createInsertSchema(days).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDay = z.infer<typeof insertDaySchema>;
export type Day = typeof days.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// LOG EVENT (Raw immutable truth; event sourcing)
// ────────────────────────────────────────────────────────────────────────────

export const logEvents = pgTable("log_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayId: varchar("day_id").notNull().references(() => days.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  captureTime: timestamp("capture_time").notNull().defaultNow(),
  eventTime: timestamp("event_time").notNull(),
  rawText: text("raw_text").notNull(),
  category: text("category").$type<"dive_op" | "directive" | "safety" | "ops" | "general">(),
  extractedJson: jsonb("extracted_json").$type<Record<string, any>>(),
  editReason: text("edit_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  dayIdIdx: index("log_events_day_id_idx").on(t.dayId),
  eventTimeIdx: index("log_events_event_time_idx").on(t.eventTime),
}));

export const insertLogEventSchema = createInsertSchema(logEvents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLogEvent = z.infer<typeof insertLogEventSchema>;
export type LogEvent = typeof logEvents.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DIVE (Derived from LogEvents)
// ────────────────────────────────────────────────────────────────────────────

export const dives = pgTable("dives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayId: varchar("day_id").notNull().references(() => days.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  diverId: varchar("diver_id").notNull().references(() => users.id),
  diveNumber: integer("dive_number").notNull(),
  lsTime: timestamp("ls_time"),
  rbTime: timestamp("rb_time"),
  lbTime: timestamp("lb_time"),
  rsTime: timestamp("rs_time"),
  maxDepthFsw: integer("max_depth_fsw"),
  taskSummary: text("task_summary"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  dayDiverIdx: index("dives_day_diver_idx").on(t.dayId, t.diverId),
}));

export const insertDiveSchema = createInsertSchema(dives).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDive = z.infer<typeof insertDiveSchema>;
export type Dive = typeof dives.$inferSelect;

export const diveConfirmations = pgTable("dive_confirmations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  diveId: varchar("dive_id").notNull().references(() => dives.id, { onDelete: "cascade" }),
  diverId: varchar("diver_id").notNull().references(() => users.id),
  status: text("status").notNull().$type<"confirmed" | "flagged">(),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
  note: text("note"),
});

export const insertDiveConfirmationSchema = createInsertSchema(diveConfirmations).omit({ id: true, confirmedAt: true });
export type InsertDiveConfirmation = z.infer<typeof insertDiveConfirmationSchema>;
export type DiveConfirmation = typeof diveConfirmations.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// RISK ITEM (Derived + supervisor editable with audit)
// ────────────────────────────────────────────────────────────────────────────

export const riskItems = pgTable("risk_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayId: varchar("day_id").notNull().references(() => days.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  riskId: text("risk_id").notNull().unique(),
  triggerEventId: varchar("trigger_event_id").references(() => logEvents.id),
  category: text("category"),
  description: text("description").notNull(),
  status: text("status").notNull().$type<"open" | "mitigated" | "closed">().default("open"),
  owner: text("owner"),
  mitigation: text("mitigation"),
  editReason: text("edit_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRiskItemSchema = createInsertSchema(riskItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRiskItem = z.infer<typeof insertRiskItemSchema>;
export type RiskItem = typeof riskItems.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// CLIENT COMM (Verbatim + summary linkage)
// ────────────────────────────────────────────────────────────────────────────

export const clientComms = pgTable("client_comms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayId: varchar("day_id").notNull().references(() => days.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  verbatimText: text("verbatim_text"),
  attachmentPointer: text("attachment_pointer"),
  summaryText: text("summary_text"),
  referencedEventIds: jsonb("referenced_event_ids").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientCommSchema = createInsertSchema(clientComms).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClientComm = z.infer<typeof insertClientCommSchema>;
export type ClientComm = typeof clientComms.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// LOG RENDER (AI drafts; regeneratable)
// ────────────────────────────────────────────────────────────────────────────

export const logRenders = pgTable("log_renders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  logEventId: varchar("log_event_id").notNull().references(() => logEvents.id, { onDelete: "cascade" }),
  renderType: text("render_type").notNull().$type<"internal_canvas_line" | "master_log_line">(),
  renderText: text("render_text").notNull(),
  section: text("section").$type<"ops" | "dive" | "directives" | "safety" | "risk">(),
  model: text("model"),
  promptVersion: text("prompt_version"),
  status: text("status").notNull().$type<"ok" | "failed" | "needs_review">().default("ok"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  logEventIdIdx: index("log_renders_log_event_id_idx").on(t.logEventId),
}));

export const insertLogRenderSchema = createInsertSchema(logRenders).omit({ id: true, createdAt: true });
export type InsertLogRender = z.infer<typeof insertLogRenderSchema>;
export type LogRender = typeof logRenders.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DIVE PLAN (Structured plan; seeds defaults)
// ────────────────────────────────────────────────────────────────────────────

export const divePlans = pgTable("dive_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  dayId: varchar("day_id").references(() => days.id, { onDelete: "set null" }),
  status: text("status").notNull().$type<"Draft" | "Active" | "Closed">().default("Draft"),
  planVersion: integer("plan_version").notNull().default(1),
  planJson: jsonb("plan_json").$type<Record<string, any>>().notNull().default({}),
  cachedRenders: jsonb("cached_renders").$type<{ pdf?: string; html?: string }>(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedBy: varchar("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
});

export const insertDivePlanSchema = createInsertSchema(divePlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDivePlan = z.infer<typeof insertDivePlanSchema>;
export type DivePlan = typeof divePlans.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// LIBRARY DOCUMENTS (Navy Manual, EM 385-1-1, etc.)
// ────────────────────────────────────────────────────────────────────────────

export const libraryDocuments = pgTable("library_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  docType: text("doc_type").notNull().$type<"navy_diving_manual" | "em_385" | "company_manual" | "project_doc">(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }),
  content: text("content"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  locked: boolean("locked").default(false),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertLibraryDocumentSchema = createInsertSchema(libraryDocuments).omit({ id: true, uploadedAt: true });
export type InsertLibraryDocument = z.infer<typeof insertLibraryDocumentSchema>;
export type LibraryDocument = typeof libraryDocuments.$inferSelect;
