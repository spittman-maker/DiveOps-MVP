import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, index, primaryKey, serial, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// COMPANIES (multi-tenant support)
// ────────────────────────────────────────────────────────────────────────────

export const companies = pgTable("companies", {
  companyId: uuid("company_id").defaultRandom().primaryKey(),
  companyName: text("company_name").notNull(),
  logoAssetKey: text("logo_asset_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  companyNameUnique: uniqueIndex("uq_companies_name").on(t.companyName),
}));

export const insertCompanySchema = createInsertSchema(companies).omit({ companyId: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// WORK LIBRARY ITEMS (global shared task library)
// ────────────────────────────────────────────────────────────────────────────

export const workLibraryItems = pgTable("work_library_items", {
  workItemId: uuid("work_item_id").defaultRandom().primaryKey(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  categoryLabelUnique: uniqueIndex("uq_work_library_category_label").on(t.category, t.label),
}));

export const insertWorkLibraryItemSchema = createInsertSchema(workLibraryItems).omit({ workItemId: true, createdAt: true });
export type InsertWorkLibraryItem = z.infer<typeof insertWorkLibraryItemSchema>;
export type WorkLibraryItem = typeof workLibraryItems.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// COMPANY ROLES (per tenant, ordered)
// ────────────────────────────────────────────────────────────────────────────

export const companyRoles = pgTable("company_roles", {
  roleId: uuid("role_id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.companyId, { onDelete: "cascade" }),
  roleName: text("role_name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
}, (t) => ({
  companyRoleUnique: uniqueIndex("uq_company_roles_company_role").on(t.companyId, t.roleName),
}));

export const insertCompanyRoleSchema = createInsertSchema(companyRoles).omit({ roleId: true });
export type InsertCompanyRole = z.infer<typeof insertCompanyRoleSchema>;
export type CompanyRole = typeof companyRoles.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// COMPANY CONTACTS DEFAULTS (fallback contacts per role)
// ────────────────────────────────────────────────────────────────────────────

export const companyContactsDefaults = pgTable("company_contacts_defaults", {
  companyId: uuid("company_id").notNull().references(() => companies.companyId, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => companyRoles.roleId, { onDelete: "cascade" }),
  defaultName: text("default_name").notNull().default("TBD"),
  defaultPhone: text("default_phone").notNull().default("TBD"),
  defaultEmail: text("default_email").notNull().default("TBD"),
}, (t) => ({
  pk: primaryKey({ columns: [t.companyId, t.roleId] }),
}));

export const insertCompanyContactsDefaultSchema = createInsertSchema(companyContactsDefaults);
export type InsertCompanyContactsDefault = z.infer<typeof insertCompanyContactsDefaultSchema>;
export type CompanyContactsDefault = typeof companyContactsDefaults.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// PROJECT WORK SELECTIONS (links project to work library items)
// ────────────────────────────────────────────────────────────────────────────

export const projectWorkSelections = pgTable("project_work_selections", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  workItemId: uuid("work_item_id").notNull().references(() => workLibraryItems.workItemId, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectWorkUnique: uniqueIndex("uq_project_work_selection").on(t.projectId, t.workItemId),
}));

export const insertProjectWorkSelectionSchema = createInsertSchema(projectWorkSelections).omit({ id: true, createdAt: true });
export type InsertProjectWorkSelection = z.infer<typeof insertProjectWorkSelectionSchema>;
export type ProjectWorkSelection = typeof projectWorkSelections.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// PROJECT CONTACTS (overrides for specific project)
// ────────────────────────────────────────────────────────────────────────────

export const projectContacts = pgTable("project_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => companyRoles.roleId, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectRoleUnique: uniqueIndex("uq_project_contact_role").on(t.projectId, t.roleId),
}));

export const insertProjectContactSchema = createInsertSchema(projectContacts).omit({ id: true, createdAt: true });
export type InsertProjectContact = z.infer<typeof insertProjectContactSchema>;
export type ProjectContact = typeof projectContacts.$inferSelect;

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
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DIVER CERTIFICATIONS
// ────────────────────────────────────────────────────────────────────────────

export const diverCertifications = pgTable("diver_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  certType: text("cert_type").notNull(),
  certNumber: text("cert_number"),
  issuedDate: timestamp("issued_date"),
  expirationDate: timestamp("expiration_date"),
  status: text("status").notNull().default("active"),
  documentUrl: text("document_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDiverCertificationSchema = createInsertSchema(diverCertifications).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDiverCertification = z.infer<typeof insertDiverCertificationSchema>;
export type DiverCertification = typeof diverCertifications.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// EQUIPMENT CERTIFICATIONS
// ────────────────────────────────────────────────────────────────────────────

export const equipmentCertifications = pgTable("equipment_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  equipmentName: text("equipment_name").notNull(),
  equipmentCategory: text("equipment_category").notNull(),
  serialNumber: text("serial_number"),
  certType: text("cert_type").notNull(),
  certNumber: text("cert_number"),
  issuedDate: timestamp("issued_date"),
  expirationDate: timestamp("expiration_date"),
  status: text("status").notNull().default("active"),
  documentUrl: text("document_url"),
  notes: text("notes"),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEquipmentCertificationSchema = createInsertSchema(equipmentCertifications).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEquipmentCertification = z.infer<typeof insertEquipmentCertificationSchema>;
export type EquipmentCertification = typeof equipmentCertifications.$inferSelect;

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
// DAY (Operational Day 0600–0600 rolling; night work after midnight logged under prior day)
// ────────────────────────────────────────────────────────────────────────────

export const dayStatusEnum = z.enum(["DRAFT", "ACTIVE", "CLOSED"]);
export type DayStatus = z.infer<typeof dayStatusEnum>;

export interface QCCloseoutData {
  scopeStatus: "complete" | "incomplete";
  documentationStatus: "complete" | "incomplete";
  exceptions: string;
  advisedFor: string;
  advisedAgainst: string;
  advisoryOutcome: string;
  standingRisks: Array<{ riskId: string; status: string }>;
  deviations: string;
  outstandingIssues: string;
  plannedNextShift: string;
}

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
  closeoutData: jsonb("closeout_data").$type<QCCloseoutData>(),
  defaultBreathingGas: text("default_breathing_gas"),
  defaultFo2Percent: integer("default_fo2_percent"),
  version: integer("version").notNull().default(1),
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
  station: text("station"),
  captureTime: timestamp("capture_time").notNull().defaultNow(),
  eventTime: timestamp("event_time").notNull(),
  rawText: text("raw_text").notNull(),
  category: text("category").$type<"dive_op" | "directive" | "safety" | "ops" | "general">(),
  extractedJson: jsonb("extracted_json").$type<Record<string, any>>(),
  structuredPayload: jsonb("structured_payload").$type<{
    directives: Array<{ time: string; text: string }>;
    station_logs: Array<{ text: string }>;
    risks: Array<{ riskId: string; description: string; source: string }>;
  }>(),
  aiAnnotations: jsonb("ai_annotations").$type<Array<{ type: string; message: string }>>(),
  validationPassed: boolean("validation_passed"),
  editReason: text("edit_reason"),
  version: integer("version").notNull().default(1),
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
  diverId: varchar("diver_id").references(() => users.id),
  diverDisplayName: text("diver_display_name"),
  diverBadgeId: text("diver_badge_id"),
  diveNumber: integer("dive_number").notNull(),
  station: text("station"),
  workLocation: text("work_location"),
  lsTime: timestamp("ls_time"),
  rbTime: timestamp("rb_time"),
  lbTime: timestamp("lb_time"),
  rsTime: timestamp("rs_time"),
  maxDepthFsw: integer("max_depth_fsw"),
  taskSummary: text("task_summary"),
  toolsEquipment: text("tools_equipment"),
  installMaterialIds: text("install_material_ids"),
  qcDisposition: text("qc_disposition").$type<"Pass" | "Rework" | "Hold" | "Not Stated">(),
  verifier: text("verifier"),
  breathingGas: text("breathing_gas"),
  fo2Percent: integer("fo2_percent"),
  breathingGasOverride: boolean("breathing_gas_override").default(false),
  eadFsw: integer("ead_fsw"),
  tableUsed: text("table_used"),
  scheduleUsed: text("schedule_used"),
  repetitiveGroup: text("repetitive_group"),
  decompRequired: text("decomp_required").$type<"Y" | "N" | "UNKNOWN">(),
  decompMethod: text("decomp_method"),
  decompStops: text("decomp_stops"),
  tableCitation: text("table_citation"),
  postDiveStatus: text("post_dive_status"),
  photoVideoRefs: text("photo_video_refs"),
  supervisorInitials: text("supervisor_initials"),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
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
// DIVER ROSTER (project-level initials → full name mapping)
// ────────────────────────────────────────────────────────────────────────────

export const diverRoster = pgTable("diver_roster", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  initials: text("initials").notNull(),
  fullName: text("full_name").notNull(),
  badgeId: text("badge_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  projectInitialsUnique: uniqueIndex("uq_diver_roster_project_initials").on(t.projectId, t.initials),
}));

export const insertDiverRosterSchema = createInsertSchema(diverRoster).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDiverRoster = z.infer<typeof insertDiverRosterSchema>;
export type DiverRoster = typeof diverRoster.$inferSelect;

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
  source: text("source").$type<"jha" | "field_observation" | "client_directive" | "equipment_issue" | "supervisor_entry" | "manual">(),
  description: text("description").notNull(),
  affectedTask: text("affected_task"),
  initialRiskLevel: text("initial_risk_level").$type<"low" | "med" | "high">(),
  residualRisk: text("residual_risk"),
  status: text("status").notNull().$type<"open" | "mitigated" | "closed">().default("open"),
  owner: text("owner"),
  mitigation: text("mitigation"),
  closureAuthority: text("closure_authority"),
  linkedDirectiveId: text("linked_directive_id"),
  editReason: text("edit_reason"),
  version: integer("version").notNull().default(1),
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

// ────────────────────────────────────────────────────────────────────────────
// PROJECT SOPS (Standard Operating Procedures for AI guidance)
// ────────────────────────────────────────────────────────────────────────────

export const projectSops = pgTable("project_sops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("project_sops_project_idx").on(t.projectId),
}));

export const insertProjectSopSchema = createInsertSchema(projectSops).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectSop = z.infer<typeof insertProjectSopSchema>;
export type ProjectSop = typeof projectSops.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// LIBRARY EXPORTS (Generated shift documents)
// ────────────────────────────────────────────────────────────────────────────

export const libraryExports = pgTable("library_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  dayId: varchar("day_id").notNull().references(() => days.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull().$type<"docx" | "xlsx">(),
  docCategory: text("doc_category").notNull().$type<"raw_notes" | "daily_log" | "master_log" | "dive_log" | "risk_register">(),
  fileData: text("file_data").notNull(),
  exportedBy: varchar("exported_by").notNull().references(() => users.id),
  exportedAt: timestamp("exported_at").notNull().defaultNow(),
}, (t) => ({
  projectDayIdx: index("library_exports_project_day_idx").on(t.projectId, t.dayId),
  dayFileUnique: uniqueIndex("uq_library_exports_day_file").on(t.dayId, t.fileName),
}));

export const insertLibraryExportSchema = createInsertSchema(libraryExports).omit({ id: true, exportedAt: true });
export type InsertLibraryExport = z.infer<typeof insertLibraryExportSchema>;
export type LibraryExport = typeof libraryExports.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// STATIONS (Work locations within a dive plan)
// ────────────────────────────────────────────────────────────────────────────

export interface StationCrew {
  supervisor: string;
  divers: string[];
  tender?: string;
}

export const stations = pgTable("stations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  divePlanId: varchar("dive_plan_id").notNull().references(() => divePlans.id, { onDelete: "cascade" }),
  stationId: text("station_id").notNull(),
  plannedDives: integer("planned_dives").notNull().default(1),
  plannedTasks: jsonb("planned_tasks").$type<string[]>().default([]),
  targetDepthFsw: integer("target_depth_fsw"),
  plannedBottomTimeMin: integer("planned_bottom_time_min"),
  crew: jsonb("crew").$type<StationCrew>(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStationSchema = createInsertSchema(stations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStation = z.infer<typeof insertStationSchema>;
export type Station = typeof stations.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DIVE LOG DETAILS (Enhanced dive tracking with QA)
// ────────────────────────────────────────────────────────────────────────────

export const diveLogDetails = pgTable("dive_log_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  diveId: varchar("dive_id").notNull().references(() => dives.id, { onDelete: "cascade" }),
  stationId: varchar("station_id").references(() => stations.id, { onDelete: "set null" }),
  taskPerformed: text("task_performed"),
  issues: jsonb("issues").$type<string[]>().default([]),
  qaNotes: text("qa_notes"),
  equipmentUsed: jsonb("equipment_used").$type<string[]>(),
  visibility: text("visibility"),
  waterTemp: integer("water_temp"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDiveLogDetailsSchema = createInsertSchema(diveLogDetails).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDiveLogDetails = z.infer<typeof insertDiveLogDetailsSchema>;
export type DiveLogDetails = typeof diveLogDetails.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DAILY SUMMARY (Aggregated daily summary with references)
// ────────────────────────────────────────────────────────────────────────────

export const dailySummaries = pgTable("daily_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayId: varchar("day_id").notNull().references(() => days.id, { onDelete: "cascade" }).unique(),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  workExecuted: jsonb("work_executed").$type<string[]>().default([]),
  divePlanRefs: jsonb("dive_plan_refs").$type<string[]>().default([]),
  diveLogRefs: jsonb("dive_log_refs").$type<string[]>().default([]),
  weather: text("weather"),
  personnelCount: integer("personnel_count"),
  hoursWorked: integer("hours_worked"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDailySummarySchema = createInsertSchema(dailySummaries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailySummary = z.infer<typeof insertDailySummarySchema>;
export type DailySummary = typeof dailySummaries.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DIVE PLAN TEMPLATES (Locked document templates like DD5)
// ────────────────────────────────────────────────────────────────────────────

export const divePlanTemplates = pgTable("dive_plan_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  templateType: text("template_type").notNull().$type<"DD5" | "COMPANY" | "CLIENT">().default("DD5"),
  templateData: text("template_data").notNull(),
  placeholders: jsonb("placeholders").$type<string[]>().notNull().default([]),
  isLocked: boolean("is_locked").notNull().default(true),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDivePlanTemplateSchema = createInsertSchema(divePlanTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDivePlanTemplate = z.infer<typeof insertDivePlanTemplateSchema>;
export type DivePlanTemplate = typeof divePlanTemplates.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// PROJECT DIVE PLANS (Project-level document with revisions)
// ────────────────────────────────────────────────────────────────────────────

export const projectDivePlanStatusEnum = z.enum(["Draft", "Submitted", "Approved", "Superseded"]);
export type ProjectDivePlanStatus = z.infer<typeof projectDivePlanStatusEnum>;

// DD5 Dive Plan - CONTROLLED FILL ZONES ONLY
// LOCKED SECTIONS (never modified): 2.5, 2.12, 4.9-4.18, Section 5, all EM385/USN tables
export interface DD5CoverPage {
  companyName: string;
  companyLogo?: string;
  projectTitle: string;
  jobNumber: string;
  client: string;
  siteLocation: string;
  submissionDate: string;
  revisionNumber: number;
}

export interface DD5Contact {
  name: string;
  role: string;
  phone: string;
  email?: string;
}

export interface DD5ProjectContacts {
  primeContractor: string;
  siteAddress?: string;
  keyContacts: DD5Contact[];
}

// Section 2.9 - Nature of Work (selected from controlled task library, no freewriting)
export interface DD5NatureOfWork {
  selectedTasks: string[];  // From controlled task library only
}

// Revision tracker entry
export interface DD5RevisionEntry {
  revision: number;
  date: string;
  description: string;
  section: string;
  changedBy: string;
}

export interface ProjectDivePlanData {
  coverPage: DD5CoverPage;
  projectContacts: DD5ProjectContacts;
  natureOfWork: DD5NatureOfWork;
  revisionHistory: DD5RevisionEntry[];
  previousPayloadHash?: string;
  scopeOfWork?: string;
  divingMode?: string;
  maxDepth?: string;
  estimatedDuration?: string;
  personnelCount?: string;
  equipmentNotes?: string;
  siteConditions?: string;
  hazardNotes?: string;
  additionalNotes?: string;
  decompressionSchedules?: string;
}

// Controlled task library for Section 2.9 Nature of Work
export const DD5_CONTROLLED_TASK_LIBRARY = [
  "Underwater inspection",
  "Hull cleaning",
  "Underwater welding",
  "Underwater cutting",
  "Pipeline inspection",
  "Pipeline repair",
  "Debris removal",
  "Salvage operations",
  "Underwater photography/video",
  "Cathodic protection survey",
  "Anode installation/replacement",
  "Structural inspection",
  "NDT (Non-Destructive Testing)",
  "Concrete repair",
  "Jacket leg inspection",
  "Riser inspection",
  "Pile inspection",
  "Mooring inspection",
  "Anchor handling",
  "Subsea equipment installation",
  "Subsea equipment recovery",
  "Valve operation",
  "Flange connection/disconnection",
  "Hot tap operations",
  "Cold tap operations",
  "Hydro-jetting",
  "Marine growth removal",
  "Sacrificial anode survey",
  "Confined space entry",
  "Search and recovery",
] as const;

// Deterministic revision description mapping
export const DD5_REVISION_MAPPING: Record<string, { description: string; section: string }> = {
  "coverPage.companyName": { description: "Updated company name", section: "Cover" },
  "coverPage.projectTitle": { description: "Updated project title", section: "Cover" },
  "coverPage.jobNumber": { description: "Updated job number", section: "Cover" },
  "coverPage.client": { description: "Updated client", section: "Cover" },
  "coverPage.siteLocation": { description: "Updated site location", section: "Cover" },
  "coverPage.submissionDate": { description: "Updated submission date", section: "Cover" },
  "projectContacts.primeContractor": { description: "Updated prime contractor", section: "2.13-2.14" },
  "projectContacts.keyContacts": { description: "Updated contact list", section: "2.13-2.14" },
  "projectContacts.siteAddress": { description: "Updated site address", section: "2.13-2.14" },
  "natureOfWork.selectedTasks": { description: "Updated scope of diver tasks", section: "2.9" },
};

export const projectDivePlans = pgTable("project_dive_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").references(() => divePlanTemplates.id),
  revision: integer("revision").notNull().default(0),
  status: text("status").notNull().$type<ProjectDivePlanStatus>().default("Draft"),
  planData: jsonb("plan_data").$type<ProjectDivePlanData>().notNull(),
  renderedDocx: text("rendered_docx"),
  submittedBy: varchar("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  supersededBy: varchar("superseded_by"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  projectRevisionIdx: index("project_dive_plans_project_revision_idx").on(t.projectId, t.revision),
}));

export const insertProjectDivePlanSchema = createInsertSchema(projectDivePlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectDivePlan = z.infer<typeof insertProjectDivePlanSchema>;
export type ProjectDivePlan = typeof projectDivePlans.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// DASHBOARD WIDGETS (customizable dashboard layouts per user)
// ────────────────────────────────────────────────────────────────────────────

export type WidgetType = 
  | "daily_summary" 
  | "active_dives" 
  | "recent_logs" 
  | "safety_incidents" 
  | "risk_register" 
  | "project_status"
  | "dive_stats"
  | "weather"
  | "live_dive_board"
  | "live_log_feed"
  | "station_overview";

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, any>;
}

export interface DashboardLayout {
  widgets: WidgetConfig[];
  version: number;
}

export const dashboardLayouts = pgTable("dashboard_layouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  layoutData: jsonb("layout_data").$type<DashboardLayout>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  userIdUnique: uniqueIndex("uq_dashboard_layouts_user").on(t.userId),
}));

export const insertDashboardLayoutSchema = createInsertSchema(dashboardLayouts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDashboardLayout = z.infer<typeof insertDashboardLayoutSchema>;
export type DashboardLayoutRecord = typeof dashboardLayouts.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// AUDIT EVENTS (Append-only compliance audit trail)
// ────────────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "log_event.create" | "log_event.update" | "log_event.delete"
  | "risk.create" | "risk.update"
  | "dive.create" | "dive.update"
  | "day.create" | "day.activate" | "day.close" | "day.close_override" | "day.reopen"
  | "export.generate"
  | "user.create" | "user.update";

export const auditEvents = pgTable("audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  correlationId: text("correlation_id").notNull(),
  action: text("action").notNull().$type<AuditAction>(),
  userId: varchar("user_id").references(() => users.id),
  userRole: text("user_role").$type<UserRole>(),
  projectId: varchar("project_id").references(() => projects.id),
  dayId: varchar("day_id").references(() => days.id),
  targetId: text("target_id"),
  targetType: text("target_type"),
  before: jsonb("before").$type<Record<string, any>>(),
  after: jsonb("after").$type<Record<string, any>>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  correlationIdx: index("audit_events_correlation_idx").on(t.correlationId),
  actionIdx: index("audit_events_action_idx").on(t.action),
  userIdx: index("audit_events_user_idx").on(t.userId),
  timestampIdx: index("audit_events_timestamp_idx").on(t.timestamp),
  targetIdx: index("audit_events_target_idx").on(t.targetType, t.targetId),
}));

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, timestamp: true });
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// ML EXPORT LOG (Tracks when data is exported for ML training)
// ────────────────────────────────────────────────────────────────────────────

export const mlExportLog = pgTable("ml_export_log", {
  id: serial("id").primaryKey(),
  exportType: text("export_type").notNull().$type<"conversations" | "log-training" | "full-bundle">(),
  exportedBy: varchar("exported_by").notNull().references(() => users.id),
  recordCount: integer("record_count").notNull().default(0),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMlExportLogSchema = createInsertSchema(mlExportLog).omit({ id: true, exportedAt: true });
export type InsertMlExportLog = z.infer<typeof insertMlExportLogSchema>;
export type MlExportLog = typeof mlExportLog.$inferSelect;

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: varchar("key").primaryKey(),
  route: text("route").notNull(),
  responseStatus: integer("response_status").notNull().default(0),
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ════════════════════════════════════════════════════════════════════
// PARSED DOCUMENTS (Document ingestion pipeline)
// ════════════════════════════════════════════════════════════════════

export type ParseStatus = "pending" | "processing" | "completed" | "failed";

export const parsedDocuments = pgTable("parsed_documents", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id").references(() => projects.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  blobUrl: text("blob_url"),
  status: text("status").notNull().$type<ParseStatus>().default("pending"),
  extractedText: text("extracted_text"),
  structuredData: jsonb("structured_data"),
  pageCount: integer("page_count"),
  errorMessage: text("error_message"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("parsed_docs_project_idx").on(t.projectId),
  statusIdx: index("parsed_docs_status_idx").on(t.status),
}));

export const insertParsedDocumentSchema = createInsertSchema(parsedDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParsedDocument = z.infer<typeof insertParsedDocumentSchema>;
export type ParsedDocument = typeof parsedDocuments.$inferSelect;

// ════════════════════════════════════════════════════════════════════
// ANALYTICS SNAPSHOTS (Daily aggregated metrics)
// ════════════════════════════════════════════════════════════════════

export interface AnalyticsMetrics {
  totalDives: number;
  avgBottomTimeMin: number | null;
  maxDepthFsw: number | null;
  avgDepthFsw: number | null;
  decompDivesCount: number;
  uniqueDivers: number;
  totalLogEvents: number;
  safetyEventCount: number;
  directiveCount: number;
  riskItemsOpened: number;
  riskItemsClosed: number;
  riskItemsOpen: number;
  hoursWorked: number | null;
  personnelCount: number | null;
  divesPerDiver: Record<string, number>;
  weatherSummary: string | null;
}

export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  dayId: varchar("day_id").references(() => days.id),
  snapshotDate: text("snapshot_date").notNull(),
  metrics: jsonb("metrics").notNull().$type<AnalyticsMetrics>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectDateIdx: index("analytics_project_date_idx").on(t.projectId, t.snapshotDate),
}));

export const insertAnalyticsSnapshotSchema = createInsertSchema(analyticsSnapshots).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnalyticsSnapshot = z.infer<typeof insertAnalyticsSnapshotSchema>;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;

// ════════════════════════════════════════════════════════════════════
// ANOMALY FLAGS (Statistical anomaly detection)
// ════════════════════════════════════════════════════════════════════

export type AnomalySourceType = "dive" | "log_event" | "risk" | "analytics";
export type AnomalyType = "depth_spike" | "dive_count_anomaly" | "risk_density" | "safety_escalation" | "missing_data" | "equipment_issue";
export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyStatus = "open" | "acknowledged" | "resolved" | "false_positive";

export const anomalyFlags = pgTable("anomaly_flags", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  dayId: varchar("day_id").references(() => days.id),
  sourceType: text("source_type").notNull().$type<AnomalySourceType>(),
  anomalyType: text("anomaly_type").notNull().$type<AnomalyType>(),
  severity: text("severity").notNull().$type<AnomalySeverity>(),
  status: text("status").notNull().$type<AnomalyStatus>().default("open"),
  description: text("description").notNull(),
  details: jsonb("details"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: varchar("resolved_by").references(() => users.id),
}, (t) => ({
  projectIdx: index("anomaly_project_idx").on(t.projectId),
  statusIdx: index("anomaly_status_idx").on(t.status),
  severityIdx: index("anomaly_severity_idx").on(t.severity),
}));

export const insertAnomalyFlagSchema = createInsertSchema(anomalyFlags).omit({ id: true, detectedAt: true });
export type InsertAnomalyFlag = z.infer<typeof insertAnomalyFlagSchema>;
export type AnomalyFlag = typeof anomalyFlags.$inferSelect;

// ════════════════════════════════════════════════════════════════════
// ML PREDICTIONS (AI-powered risk & delay predictions)
// ════════════════════════════════════════════════════════════════════

export type PredictionType = "risk" | "delay" | "crew_utilization" | "safety";

export interface MlPredictionResult {
  riskLevel?: string;
  confidence?: number;
  factors?: string[];
  recommendations?: string[];
  predictedDelay?: number;
  delayReasons?: string[];
  crewUtilization?: number;
  rawResponse?: string;
}

export const mlPredictions = pgTable("ml_predictions", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  predictionType: text("prediction_type").notNull().$type<PredictionType>(),
  result: jsonb("result").notNull().$type<MlPredictionResult>(),
  modelVersion: text("model_version"),
  inputHash: text("input_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => ({
  projectTypeIdx: index("ml_pred_project_type_idx").on(t.projectId, t.predictionType),
}));

export const insertMlPredictionSchema = createInsertSchema(mlPredictions).omit({ id: true, createdAt: true });
export type InsertMlPrediction = z.infer<typeof insertMlPredictionSchema>;
export type MlPrediction = typeof mlPredictions.$inferSelect;
