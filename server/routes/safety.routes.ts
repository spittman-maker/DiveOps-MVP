import type { Express, Request, Response } from "express";
import { getUser, getParam, getQuery, validateBody, getTodayDate } from "./_helpers";
import { requireAuth, requireRole } from "../auth";
import { requireProjectAccess } from "../authz";
import { isEnabled } from "../feature-flags";
import { db, pool } from "../storage";
import { storage } from "../storage";
import { sql, eq, and, desc, asc } from "drizzle-orm";
import * as schema from "@shared/schema";
import { z } from "zod";
import { getAnthropicClient, AI_MODEL } from "../ai-client";
import { generateCorrelationId, emitAuditEvent, type AuditContext } from "../audit";

// ────────────────────────────────────────────────────────────────────────────
// Feature-flag guard middleware
// ────────────────────────────────────────────────────────────────────────────
function requireSafetyFlag(_req: Request, res: Response, next: Function) {
  if (!isEnabled("safetyTab")) {
    return res.status(404).json({ message: "Safety tab is not enabled" });
  }
  next();
}

// ────────────────────────────────────────────────────────────────────────────
// Role helpers
// ────────────────────────────────────────────────────────────────────────────
function canManageSafety(role: string): boolean {
  return ["GOD", "ADMIN", "SUPERVISOR"].includes(role);
}

// ────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

const createChecklistSchema = z.object({
  checklistType: z.enum(["pre_dive", "post_dive", "equipment"]),
  title: z.string().min(1),
  description: z.string().optional(),
  roleScope: z.enum(["all", "diver", "tender", "supervisor"]).default("all"),
  clientType: z.enum(["navy", "usace", "commercial", "all"]).default("commercial"),
  items: z.array(z.object({
    itemText: z.string().min(1),
    category: z.string().optional(),
    isCritical: z.boolean().default(false),
    requiresNote: z.boolean().default(false),
    sortOrder: z.number().default(0),
  })).optional(),
});

const completeChecklistSchema = z.object({
  checklistId: z.string(),
  dayId: z.string().optional(),
  responses: z.array(z.object({
    itemId: z.string(),
    itemText: z.string(),
    status: z.enum(["pass", "fail", "flag", "na"]),
    note: z.string().optional(),
    flaggedForRisk: z.boolean().optional(),
  })),
  notes: z.string().optional(),
});

const signOffChecklistSchema = z.object({
  digitalSignatureData: z.string().optional(),
});

const createJhaSchema = z.object({
  dayId: z.string().optional(),
  title: z.string().min(1),
  plannedOperations: z.string().optional(),
  weatherConditions: z.string().optional(),
  diveDepthRange: z.string().optional(),
  equipmentInUse: z.array(z.string()).optional(),
  hazardEntries: z.array(z.object({
    step: z.string(),
    hazard: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    controls: z.string(),
    responsibleParty: z.string(),
    ppe: z.string().optional(),
  })).optional(),
});

const updateJhaSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["draft", "review", "approved", "superseded"]).optional(),
  hazardEntries: z.array(z.object({
    step: z.string(),
    hazard: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    controls: z.string(),
    responsibleParty: z.string(),
    ppe: z.string().optional(),
  })).optional(),
  supervisorNotes: z.string().optional(),
  plannedOperations: z.string().optional(),
  weatherConditions: z.string().optional(),
  diveDepthRange: z.string().optional(),
  equipmentInUse: z.array(z.string()).optional(),
  digitalSignatureData: z.string().optional(),
});

const generateJhaSchema = z.object({
  dayId: z.string().optional(),
  plannedOperations: z.string(),
  weatherConditions: z.string().optional(),
  diveDepthRange: z.string().optional(),
  equipmentInUse: z.array(z.string()).optional(),
});

const createMeetingSchema = z.object({
  dayId: z.string().optional(),
  title: z.string().min(1),
  meetingDate: z.string(),
  safetyTopic: z.string().optional(),
  previousShiftSummary: z.string().optional(),
  plannedOperations: z.string().optional(),
  associatedHazards: z.string().optional(),
  mitigationPlan: z.string().optional(),
  openDiscussionPoints: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const updateMeetingSchema = z.object({
  title: z.string().optional(),
  safetyTopic: z.string().optional(),
  previousShiftSummary: z.string().optional(),
  plannedOperations: z.string().optional(),
  associatedHazards: z.string().optional(),
  mitigationPlan: z.string().optional(),
  openDiscussionPoints: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "finalized", "archived"]).optional(),
  digitalSignatureData: z.string().optional(),
});

const generateMeetingSchema = z.object({
  dayId: z.string().optional(),
  supervisorAnswers: z.array(z.string()).optional(),
  plannedOpsDescription: z.string().optional(),
  safetyConcerns: z.string().optional(),
});

const createNearMissSchema = z.object({
  dayId: z.string().optional(),
  reportType: z.enum(["near_miss", "incident", "observation", "unsafe_condition"]).default("near_miss"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("low"),
  description: z.string().min(1),
  location: z.string().optional(),
  personnelInvolved: z.array(z.string()).optional(),
  immediateActions: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveActions: z.string().optional(),
  voiceTranscript: z.string().optional(),
});

const updateNearMissSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  description: z.string().optional(),
  immediateActions: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveActions: z.string().optional(),
  status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
});

// ════════════════════════════════════════════════════════════════════════════
// ROUTE REGISTRATION
// ════════════════════════════════════════════════════════════════════════════

export function registerSafetyRoutes(app: Express): void {

  // ──────────────────────────────────────────────────────────────────────────
  // CHECKLIST TEMPLATES — CRUD
  // ──────────────────────────────────────────────────────────────────────────

  // List checklists for a project
  app.get("/api/safety/projects/:projectId/checklists",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const typeFilter = getQuery(req, "type");
        const roleFilter = getQuery(req, "role");

        let conditions = [eq(schema.safetyChecklists.projectId, projectId), eq(schema.safetyChecklists.isActive, true)];
        
        const results = await db.select()
          .from(schema.safetyChecklists)
          .where(and(...conditions))
          .orderBy(asc(schema.safetyChecklists.sortOrder));

        // Apply in-memory filters for type and role
        let filtered = results;
        if (typeFilter) {
          filtered = filtered.filter(c => c.checklistType === typeFilter);
        }
        if (roleFilter) {
          filtered = filtered.filter(c => c.roleScope === "all" || c.roleScope === roleFilter);
        }

        res.json(filtered);
      } catch (err: any) {
        console.error("List checklists error:", err);
        res.status(500).json({ message: "Failed to list checklists" });
      }
    }
  );

  // Get a single checklist with items
  app.get("/api/safety/checklists/:checklistId",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const checklistId = getParam(req, "checklistId");
        
        const [checklist] = await db.select()
          .from(schema.safetyChecklists)
          .where(eq(schema.safetyChecklists.id, checklistId));

        if (!checklist) return res.status(404).json({ message: "Checklist not found" });

        const items = await db.select()
          .from(schema.checklistItems)
          .where(eq(schema.checklistItems.checklistId, checklistId))
          .orderBy(asc(schema.checklistItems.sortOrder));

        res.json({ ...checklist, items });
      } catch (err: any) {
        console.error("Get checklist error:", err);
        res.status(500).json({ message: "Failed to get checklist" });
      }
    }
  );

  // Create a checklist template (Supervisor+)
  app.post("/api/safety/projects/:projectId/checklists",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const projectId = getParam(req, "projectId");
        const data = createChecklistSchema.parse(req.body);

        const [checklist] = await db.insert(schema.safetyChecklists).values({
          projectId,
          checklistType: data.checklistType,
          title: data.title,
          description: data.description,
          roleScope: data.roleScope,
          clientType: data.clientType,
          createdBy: user.id,
        }).returning();

        // Insert items if provided
        if (data.items && data.items.length > 0) {
          await db.insert(schema.checklistItems).values(
            data.items.map((item, idx) => ({
              checklistId: checklist.id,
              itemText: item.itemText,
              category: item.category,
              isCritical: item.isCritical,
              requiresNote: item.requiresNote,
              sortOrder: item.sortOrder || idx,
            }))
          );
        }

        const items = await db.select()
          .from(schema.checklistItems)
          .where(eq(schema.checklistItems.checklistId, checklist.id))
          .orderBy(asc(schema.checklistItems.sortOrder));

        res.status(201).json({ ...checklist, items });
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Create checklist error:", err);
        res.status(500).json({ message: "Failed to create checklist" });
      }
    }
  );

  // Seed default checklists for a project
  app.post("/api/safety/projects/:projectId/checklists/seed-defaults",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }
        const projectId = getParam(req, "projectId");
        const clientType = (req.body.clientType || "commercial") as string;

        // Check if checklists already exist
        const existing = await db.select({ id: schema.safetyChecklists.id })
          .from(schema.safetyChecklists)
          .where(eq(schema.safetyChecklists.projectId, projectId));

        if (existing.length > 0) {
          return res.status(409).json({ message: "Checklists already exist for this project. Delete them first to re-seed." });
        }

        const seeded = await seedDefaultChecklists(projectId, clientType, user.id);
        res.status(201).json({ message: `Seeded ${seeded} default checklists`, count: seeded });
      } catch (err: any) {
        console.error("Seed checklists error:", err);
        res.status(500).json({ message: "Failed to seed default checklists" });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // CHECKLIST COMPLETIONS
  // ──────────────────────────────────────────────────────────────────────────

  // List completions for a project/day
  app.get("/api/safety/projects/:projectId/completions",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const dayId = getQuery(req, "dayId");

        let conditions = [eq(schema.checklistCompletions.projectId, projectId)];
        if (dayId) {
          conditions.push(eq(schema.checklistCompletions.dayId, dayId));
        }

        const results = await db.select()
          .from(schema.checklistCompletions)
          .leftJoin(schema.safetyChecklists, eq(schema.checklistCompletions.checklistId, schema.safetyChecklists.id))
          .where(and(...conditions))
          .orderBy(desc(schema.checklistCompletions.completedAt));

        const mapped = results.map(r => ({
          ...r.checklist_completions,
          checklistTitle: r.safety_checklists?.title,
          checklistType: r.safety_checklists?.checklistType,
        }));

        res.json(mapped);
      } catch (err: any) {
        console.error("List completions error:", err);
        res.status(500).json({ message: "Failed to list completions" });
      }
    }
  );

  // Submit a checklist completion
  app.post("/api/safety/projects/:projectId/completions",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        const projectId = getParam(req, "projectId");
        const data = completeChecklistSchema.parse(req.body);

        // Check for failed equipment items → auto-create risk
        const failedItems = data.responses.filter(r => r.status === "fail" || r.flaggedForRisk);

        const [completion] = await db.insert(schema.checklistCompletions).values({
          checklistId: data.checklistId,
          projectId,
          dayId: data.dayId,
          completedBy: user.id,
          status: "completed",
          responses: data.responses,
          notes: data.notes,
        }).returning();

        // Auto-generate risk items for failed equipment checks
        if (failedItems.length > 0 && data.dayId) {
          for (const item of failedItems) {
            try {
              await db.insert(schema.riskItems).values({
                dayId: data.dayId,
                projectId,
                riskId: `SAFETY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                category: "equipment_issue",
                source: "equipment_issue",
                description: `Equipment checklist failure: ${item.itemText}${item.note ? ` — ${item.note}` : ""}`,
                initialRiskLevel: "high",
                status: "open",
                owner: user.id,
              });
            } catch (riskErr) {
              console.error("Auto-risk creation error:", riskErr);
            }
          }
        }

        res.status(201).json(completion);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Submit completion error:", err);
        res.status(500).json({ message: "Failed to submit completion" });
      }
    }
  );

  // Supervisor sign-off on a completion
  app.post("/api/safety/completions/:completionId/sign-off",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Only supervisors can sign off checklists" });
        }

        const completionId = getParam(req, "completionId");
        const data = signOffChecklistSchema.parse(req.body);

        const [updated] = await db.update(schema.checklistCompletions)
          .set({
            status: "signed_off",
            supervisorSignature: user.id,
            supervisorSignedAt: new Date(),
            digitalSignatureData: data.digitalSignatureData,
            updatedAt: new Date(),
          })
          .where(eq(schema.checklistCompletions.id, completionId))
          .returning();

        if (!updated) return res.status(404).json({ message: "Completion not found" });
        res.json(updated);
      } catch (err: any) {
        console.error("Sign-off error:", err);
        res.status(500).json({ message: "Failed to sign off" });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // JHA RECORDS — CRUD + AI Generation
  // ──────────────────────────────────────────────────────────────────────────

  // List JHAs for a project
  app.get("/api/safety/projects/:projectId/jha",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const dayId = getQuery(req, "dayId");

        let conditions = [eq(schema.jhaRecords.projectId, projectId)];
        if (dayId) {
          conditions.push(eq(schema.jhaRecords.dayId, dayId));
        }

        const results = await db.select()
          .from(schema.jhaRecords)
          .where(and(...conditions))
          .orderBy(desc(schema.jhaRecords.createdAt));

        res.json(results);
      } catch (err: any) {
        console.error("List JHA error:", err);
        res.status(500).json({ message: "Failed to list JHA records" });
      }
    }
  );

  // Get a single JHA
  app.get("/api/safety/jha/:jhaId",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const jhaId = getParam(req, "jhaId");
        const [jha] = await db.select()
          .from(schema.jhaRecords)
          .where(eq(schema.jhaRecords.id, jhaId));

        if (!jha) return res.status(404).json({ message: "JHA not found" });
        res.json(jha);
      } catch (err: any) {
        console.error("Get JHA error:", err);
        res.status(500).json({ message: "Failed to get JHA" });
      }
    }
  );

  // Create a JHA manually
  app.post("/api/safety/projects/:projectId/jha",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const projectId = getParam(req, "projectId");
        const data = createJhaSchema.parse(req.body);

        const [jha] = await db.insert(schema.jhaRecords).values({
          projectId,
          dayId: data.dayId,
          title: data.title,
          plannedOperations: data.plannedOperations,
          weatherConditions: data.weatherConditions,
          diveDepthRange: data.diveDepthRange,
          equipmentInUse: data.equipmentInUse || [],
          hazardEntries: data.hazardEntries || [],
          createdBy: user.id,
        }).returning();

        res.status(201).json(jha);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Create JHA error:", err);
        res.status(500).json({ message: "Failed to create JHA" });
      }
    }
  );

  // Update a JHA
  app.patch("/api/safety/jha/:jhaId",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const jhaId = getParam(req, "jhaId");
        const data = updateJhaSchema.parse(req.body);

        const updateData: any = { updatedAt: new Date() };
        if (data.title !== undefined) updateData.title = data.title;
        if (data.hazardEntries !== undefined) updateData.hazardEntries = data.hazardEntries;
        if (data.supervisorNotes !== undefined) updateData.supervisorNotes = data.supervisorNotes;
        if (data.plannedOperations !== undefined) updateData.plannedOperations = data.plannedOperations;
        if (data.weatherConditions !== undefined) updateData.weatherConditions = data.weatherConditions;
        if (data.diveDepthRange !== undefined) updateData.diveDepthRange = data.diveDepthRange;
        if (data.equipmentInUse !== undefined) updateData.equipmentInUse = data.equipmentInUse;

        if (data.status === "approved") {
          updateData.status = "approved";
          updateData.approvedBy = user.id;
          updateData.approvedAt = new Date();
          if (data.digitalSignatureData) {
            updateData.digitalSignatureData = data.digitalSignatureData;
          }
        } else if (data.status !== undefined) {
          updateData.status = data.status;
        }

        const [updated] = await db.update(schema.jhaRecords)
          .set(updateData)
          .where(eq(schema.jhaRecords.id, jhaId))
          .returning();

        if (!updated) return res.status(404).json({ message: "JHA not found" });
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Update JHA error:", err);
        res.status(500).json({ message: "Failed to update JHA" });
      }
    }
  );

  // AI-Generate a JHA
  app.post("/api/safety/projects/:projectId/jha/generate",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const projectId = getParam(req, "projectId");
        const data = generateJhaSchema.parse(req.body);

        // Gather context data
        const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
        
        // Get recent risks for historical context
        const recentRisks = await db.select()
          .from(schema.riskItems)
          .where(eq(schema.riskItems.projectId, projectId))
          .orderBy(desc(schema.riskItems.createdAt))
          .limit(10);

        // Get recent log events for context
        let recentEvents: any[] = [];
        if (data.dayId) {
          recentEvents = await db.select()
            .from(schema.logEvents)
            .where(eq(schema.logEvents.dayId, data.dayId))
            .orderBy(desc(schema.logEvents.createdAt))
            .limit(20);
        }

        // Get equipment certifications for context
        const equipment = await db.select()
          .from(schema.equipmentCertifications)
          .where(eq(schema.equipmentCertifications.projectId, projectId))
          .limit(20);

        const aiPromptContext = {
          projectName: project?.name,
          clientName: project?.clientName,
          jobsiteName: project?.jobsiteName,
          plannedOperations: data.plannedOperations,
          weatherConditions: data.weatherConditions,
          diveDepthRange: data.diveDepthRange,
          equipmentInUse: data.equipmentInUse,
          recentRisks: recentRisks.map(r => ({ description: r.description, category: r.category, status: r.status })),
          recentEvents: recentEvents.map(e => ({ rawText: e.rawText, category: e.category })),
          equipmentOnSite: equipment.map(e => ({ name: e.equipmentName, category: e.equipmentCategory, type: e.equipmentType })),
        };

        const anthropic = getAnthropicClient();
        const aiResponse = await anthropic.messages.create({
          model: AI_MODEL,
          max_tokens: 4000,
          system: `You are a dive operations safety expert generating a Job Hazard Analysis (JHA) for commercial diving operations. 
The Navy Dive Manual is the primary reference. Where USACE EM 385-1-1 or other standards are more stringent, those take precedence.
Do NOT include any references to delta p hazards.
Focus on practical, actionable hazard identification and controls.
Return ONLY valid JSON matching the specified format. No markdown, no explanation.`,
          messages: [{
            role: "user",
            content: `Generate a comprehensive JHA for the following dive operation:

Project: ${project?.name || "Unknown"} (${project?.clientName || "Commercial"})
Site: ${project?.jobsiteName || "Unknown"}
Planned Operations: ${data.plannedOperations}
Weather: ${data.weatherConditions || "Not specified"}
Dive Depth Range: ${data.diveDepthRange || "Not specified"}
Equipment: ${(data.equipmentInUse || []).join(", ") || "Standard dive equipment"}

Recent Risk History:
${recentRisks.map(r => `- ${r.description} (${r.status})`).join("\n") || "No recent risks"}

Return a JSON object with this exact structure:
{
  "title": "JHA title string",
  "hazardEntries": [
    {
      "step": "Operation step description",
      "hazard": "Identified hazard",
      "riskLevel": "low|medium|high|critical",
      "controls": "Control measures",
      "responsibleParty": "Who is responsible",
      "ppe": "Required PPE"
    }
  ],
  "historicalContext": "Brief summary of relevant historical context"
}

Include at least 8-12 hazard entries covering: pre-dive preparation, equipment setup, water entry, descent, bottom operations, ascent, surface recovery, post-dive procedures, and emergency scenarios.`
          }],
        });

        let aiContent = "";
        for (const block of aiResponse.content) {
          if (block.type === "text") aiContent += block.text;
        }

        // Parse AI response
        let parsed: any;
        try {
          // Try to extract JSON from the response
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in AI response");
          }
        } catch (parseErr) {
          console.error("AI JHA parse error:", parseErr);
          return res.status(500).json({ message: "Failed to parse AI-generated JHA" });
        }

        // Save the JHA
        const [jha] = await db.insert(schema.jhaRecords).values({
          projectId,
          dayId: data.dayId,
          title: parsed.title || `JHA — ${data.plannedOperations?.slice(0, 50) || "Daily Operations"}`,
          status: "review",
          generatedByAi: true,
          aiModel: AI_MODEL,
          aiPromptContext,
          hazardEntries: parsed.hazardEntries || [],
          weatherConditions: data.weatherConditions,
          diveDepthRange: data.diveDepthRange,
          equipmentInUse: data.equipmentInUse || [],
          plannedOperations: data.plannedOperations,
          historicalContext: parsed.historicalContext,
          createdBy: user.id,
        }).returning();

        res.status(201).json(jha);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Generate JHA error:", err);
        res.status(500).json({ message: "Failed to generate JHA", error: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SAFETY MEETINGS — CRUD + AI Generation
  // ──────────────────────────────────────────────────────────────────────────

  // List meetings for a project
  app.get("/api/safety/projects/:projectId/meetings",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const dayId = getQuery(req, "dayId");

        let conditions = [eq(schema.safetyMeetings.projectId, projectId)];
        if (dayId) {
          conditions.push(eq(schema.safetyMeetings.dayId, dayId));
        }

        const results = await db.select()
          .from(schema.safetyMeetings)
          .where(and(...conditions))
          .orderBy(desc(schema.safetyMeetings.createdAt));

        res.json(results);
      } catch (err: any) {
        console.error("List meetings error:", err);
        res.status(500).json({ message: "Failed to list meetings" });
      }
    }
  );

  // Get a single meeting
  app.get("/api/safety/meetings/:meetingId",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const meetingId = getParam(req, "meetingId");
        const [meeting] = await db.select()
          .from(schema.safetyMeetings)
          .where(eq(schema.safetyMeetings.id, meetingId));

        if (!meeting) return res.status(404).json({ message: "Meeting not found" });
        res.json(meeting);
      } catch (err: any) {
        console.error("Get meeting error:", err);
        res.status(500).json({ message: "Failed to get meeting" });
      }
    }
  );

  // Create a meeting manually
  app.post("/api/safety/projects/:projectId/meetings",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const projectId = getParam(req, "projectId");
        const data = createMeetingSchema.parse(req.body);

        const [meeting] = await db.insert(schema.safetyMeetings).values({
          projectId,
          dayId: data.dayId,
          title: data.title,
          meetingDate: data.meetingDate,
          safetyTopic: data.safetyTopic,
          previousShiftSummary: data.previousShiftSummary,
          plannedOperations: data.plannedOperations,
          associatedHazards: data.associatedHazards,
          mitigationPlan: data.mitigationPlan,
          openDiscussionPoints: data.openDiscussionPoints,
          attendees: data.attendees || [],
          notes: data.notes,
          agendaJson: {
            safetyTopic: data.safetyTopic,
            previousShiftSummary: data.previousShiftSummary,
            plannedOperations: data.plannedOperations,
            associatedHazards: data.associatedHazards,
            mitigationPlan: data.mitigationPlan,
            openDiscussionPoints: data.openDiscussionPoints,
          },
          createdBy: user.id,
        }).returning();

        res.status(201).json(meeting);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Create meeting error:", err);
        res.status(500).json({ message: "Failed to create meeting" });
      }
    }
  );

  // Update a meeting
  app.patch("/api/safety/meetings/:meetingId",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const meetingId = getParam(req, "meetingId");
        const data = updateMeetingSchema.parse(req.body);

        const updateData: any = { updatedAt: new Date() };
        if (data.title !== undefined) updateData.title = data.title;
        if (data.safetyTopic !== undefined) updateData.safetyTopic = data.safetyTopic;
        if (data.previousShiftSummary !== undefined) updateData.previousShiftSummary = data.previousShiftSummary;
        if (data.plannedOperations !== undefined) updateData.plannedOperations = data.plannedOperations;
        if (data.associatedHazards !== undefined) updateData.associatedHazards = data.associatedHazards;
        if (data.mitigationPlan !== undefined) updateData.mitigationPlan = data.mitigationPlan;
        if (data.openDiscussionPoints !== undefined) updateData.openDiscussionPoints = data.openDiscussionPoints;
        if (data.attendees !== undefined) updateData.attendees = data.attendees;
        if (data.notes !== undefined) updateData.notes = data.notes;

        if (data.status === "finalized") {
          updateData.status = "finalized";
          updateData.finalizedBy = user.id;
          updateData.finalizedAt = new Date();
          if (data.digitalSignatureData) {
            updateData.digitalSignatureData = data.digitalSignatureData;
          }
        } else if (data.status !== undefined) {
          updateData.status = data.status;
        }

        // Update agenda JSON
        updateData.agendaJson = {
          safetyTopic: data.safetyTopic,
          previousShiftSummary: data.previousShiftSummary,
          plannedOperations: data.plannedOperations,
          associatedHazards: data.associatedHazards,
          mitigationPlan: data.mitigationPlan,
          openDiscussionPoints: data.openDiscussionPoints,
        };

        const [updated] = await db.update(schema.safetyMeetings)
          .set(updateData)
          .where(eq(schema.safetyMeetings.id, meetingId))
          .returning();

        if (!updated) return res.status(404).json({ message: "Meeting not found" });
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Update meeting error:", err);
        res.status(500).json({ message: "Failed to update meeting" });
      }
    }
  );

  // Get supervisor questions for AI meeting generation
  app.get("/api/safety/projects/:projectId/meetings/questions",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (_req: Request, res: Response) => {
      res.json({
        questions: [
          "What are the planned dive operations for today?",
          "Are there any specific safety concerns for today's operations?",
          "What is the current weather and environmental conditions?",
          "Are there any equipment issues or flags from the previous shift?",
          "Any personnel changes or new crew members on site today?",
        ]
      });
    }
  );

  // AI-Generate a safety meeting agenda
  app.post("/api/safety/projects/:projectId/meetings/generate",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const projectId = getParam(req, "projectId");
        const data = generateMeetingSchema.parse(req.body);
        const today = getTodayDate();

        // Gather context
        const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));

        // Get previous shift's log events
        const recentEvents = await db.select()
          .from(schema.logEvents)
          .where(eq(schema.logEvents.projectId, projectId))
          .orderBy(desc(schema.logEvents.createdAt))
          .limit(30);

        // Get open risks
        const openRisks = await db.select()
          .from(schema.riskItems)
          .where(and(
            eq(schema.riskItems.projectId, projectId),
            eq(schema.riskItems.status, "open")
          ))
          .limit(10);

        // Get recent near-miss reports
        const recentNearMisses = await db.select()
          .from(schema.nearMissReports)
          .where(eq(schema.nearMissReports.projectId, projectId))
          .orderBy(desc(schema.nearMissReports.createdAt))
          .limit(5);

        // Get equipment flags
        const equipmentFlags = await db.select()
          .from(schema.equipmentCertifications)
          .where(and(
            eq(schema.equipmentCertifications.projectId, projectId),
            eq(schema.equipmentCertifications.status, "expired")
          ))
          .limit(10);

        const contextSummary = {
          projectName: project?.name,
          clientName: project?.clientName,
          recentEvents: recentEvents.slice(0, 15).map(e => e.rawText),
          openRisks: openRisks.map(r => ({ description: r.description, level: r.initialRiskLevel })),
          recentNearMisses: recentNearMisses.map(n => ({ type: n.reportType, description: n.description, severity: n.severity })),
          equipmentFlags: equipmentFlags.map(e => ({ name: e.equipmentName, status: e.status })),
          supervisorAnswers: data.supervisorAnswers,
          plannedOps: data.plannedOpsDescription,
          safetyConcerns: data.safetyConcerns,
        };

        const anthropic = getAnthropicClient();
        const aiResponse = await anthropic.messages.create({
          model: AI_MODEL,
          max_tokens: 3000,
          system: `You are a dive operations safety meeting facilitator. Generate a structured 10-minute morning safety meeting agenda.
The Navy Dive Manual is the primary reference for all safety standards.
Do NOT include any references to delta p hazards.
Focus on practical, actionable items. Be concise but thorough.
Return ONLY valid JSON matching the specified format. No markdown, no explanation.`,
          messages: [{
            role: "user",
            content: `Generate a morning safety meeting agenda for today (${today}):

Project: ${project?.name || "Unknown"} (${project?.clientName || "Commercial"})

Supervisor's planned operations: ${data.plannedOpsDescription || "Not specified"}
Supervisor's safety concerns: ${data.safetyConcerns || "None specified"}

Previous shift events:
${recentEvents.slice(0, 10).map(e => `- ${e.rawText}`).join("\n") || "No recent events"}

Open risks:
${openRisks.map(r => `- [${r.initialRiskLevel}] ${r.description}`).join("\n") || "No open risks"}

Recent near-misses:
${recentNearMisses.map(n => `- [${n.severity}] ${n.description}`).join("\n") || "No recent near-misses"}

Equipment flags:
${equipmentFlags.map(e => `- ${e.equipmentName}: ${e.status}`).join("\n") || "No equipment flags"}

Return a JSON object with this exact structure:
{
  "title": "Safety Meeting title",
  "safetyTopic": "Safety topic of the day with brief explanation",
  "previousShiftSummary": "Summary of previous shift work and any issues",
  "plannedOperations": "Today's planned operations",
  "associatedHazards": "Hazards associated with today's operations",
  "mitigationPlan": "Mitigation measures for identified hazards",
  "openDiscussionPoints": "Points for open discussion"
}`
          }],
        });

        let aiContent = "";
        for (const block of aiResponse.content) {
          if (block.type === "text") aiContent += block.text;
        }

        let parsed: any;
        try {
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in AI response");
          }
        } catch (parseErr) {
          console.error("AI meeting parse error:", parseErr);
          return res.status(500).json({ message: "Failed to parse AI-generated meeting" });
        }

        // Save the meeting
        const [meeting] = await db.insert(schema.safetyMeetings).values({
          projectId,
          dayId: data.dayId,
          title: parsed.title || `Safety Meeting — ${today}`,
          meetingDate: today,
          generatedByAi: true,
          aiModel: AI_MODEL,
          supervisorQuestions: [
            "What are the planned dive operations for today?",
            "Are there any specific safety concerns for today's operations?",
            "What is the current weather and environmental conditions?",
            "Are there any equipment issues or flags from the previous shift?",
            "Any personnel changes or new crew members on site today?",
          ],
          supervisorAnswers: data.supervisorAnswers || [],
          safetyTopic: parsed.safetyTopic,
          previousShiftSummary: parsed.previousShiftSummary,
          plannedOperations: parsed.plannedOperations,
          associatedHazards: parsed.associatedHazards,
          mitigationPlan: parsed.mitigationPlan,
          openDiscussionPoints: parsed.openDiscussionPoints,
          agendaJson: {
            safetyTopic: parsed.safetyTopic,
            previousShiftSummary: parsed.previousShiftSummary,
            plannedOperations: parsed.plannedOperations,
            associatedHazards: parsed.associatedHazards,
            mitigationPlan: parsed.mitigationPlan,
            openDiscussionPoints: parsed.openDiscussionPoints,
          },
          createdBy: user.id,
        }).returning();

        res.status(201).json(meeting);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Generate meeting error:", err);
        res.status(500).json({ message: "Failed to generate meeting", error: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // NEAR-MISS REPORTS — CRUD
  // ──────────────────────────────────────────────────────────────────────────

  // List near-miss reports for a project
  app.get("/api/safety/projects/:projectId/near-misses",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const dayId = getQuery(req, "dayId");
        const statusFilter = getQuery(req, "status");

        let conditions = [eq(schema.nearMissReports.projectId, projectId)];
        if (dayId) {
          conditions.push(eq(schema.nearMissReports.dayId, dayId));
        }

        const results = await db.select()
          .from(schema.nearMissReports)
          .where(and(...conditions))
          .orderBy(desc(schema.nearMissReports.createdAt));

        let filtered = results;
        if (statusFilter) {
          filtered = filtered.filter(r => r.status === statusFilter);
        }

        res.json(filtered);
      } catch (err: any) {
        console.error("List near-misses error:", err);
        res.status(500).json({ message: "Failed to list near-miss reports" });
      }
    }
  );

  // Create a near-miss report
  app.post("/api/safety/projects/:projectId/near-misses",
    requireAuth, requireSafetyFlag, requireProjectAccess("projectId"),
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        const projectId = getParam(req, "projectId");
        const data = createNearMissSchema.parse(req.body);

        const [report] = await db.insert(schema.nearMissReports).values({
          projectId,
          dayId: data.dayId,
          reportedBy: user.id,
          reportType: data.reportType,
          severity: data.severity,
          description: data.description,
          location: data.location,
          personnelInvolved: data.personnelInvolved || [],
          immediateActions: data.immediateActions,
          rootCause: data.rootCause,
          correctiveActions: data.correctiveActions,
          voiceTranscript: data.voiceTranscript,
        }).returning();

        // Auto-create risk item for high/critical near-misses
        if ((data.severity === "high" || data.severity === "critical") && data.dayId) {
          try {
            await db.insert(schema.riskItems).values({
              dayId: data.dayId,
              projectId,
              riskId: `NM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              category: "safety",
              source: "field_observation",
              description: `Near-miss report [${data.severity}]: ${data.description}`,
              initialRiskLevel: data.severity === "critical" ? "high" : "med",
              status: "open",
              owner: user.id,
            });
          } catch (riskErr) {
            console.error("Auto-risk from near-miss error:", riskErr);
          }
        }

        res.status(201).json(report);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Create near-miss error:", err);
        res.status(500).json({ message: "Failed to create near-miss report" });
      }
    }
  );

  // Update a near-miss report
  app.patch("/api/safety/near-misses/:reportId",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const user = getUser(req);
        if (!canManageSafety(user.role)) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const reportId = getParam(req, "reportId");
        const data = updateNearMissSchema.parse(req.body);

        const updateData: any = { updatedAt: new Date() };
        if (data.severity !== undefined) updateData.severity = data.severity;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.immediateActions !== undefined) updateData.immediateActions = data.immediateActions;
        if (data.rootCause !== undefined) updateData.rootCause = data.rootCause;
        if (data.correctiveActions !== undefined) updateData.correctiveActions = data.correctiveActions;
        if (data.status !== undefined) {
          updateData.status = data.status;
          if (data.status === "resolved" || data.status === "closed") {
            updateData.reviewedBy = user.id;
            updateData.reviewedAt = new Date();
          }
        }

        const [updated] = await db.update(schema.nearMissReports)
          .set(updateData)
          .where(eq(schema.nearMissReports.id, reportId))
          .returning();

        if (!updated) return res.status(404).json({ message: "Report not found" });
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: "Validation error", errors: err.errors });
        }
        console.error("Update near-miss error:", err);
        res.status(500).json({ message: "Failed to update near-miss report" });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // EXPORT ENDPOINTS
  // ──────────────────────────────────────────────────────────────────────────

  // Export JHA as document
  app.get("/api/safety/jha/:jhaId/export",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const jhaId = getParam(req, "jhaId");
        const [jha] = await db.select()
          .from(schema.jhaRecords)
          .where(eq(schema.jhaRecords.id, jhaId));

        if (!jha) return res.status(404).json({ message: "JHA not found" });

        const [project] = await db.select()
          .from(schema.projects)
          .where(eq(schema.projects.id, jha.projectId));

        // Generate markdown export
        const entries = (jha.hazardEntries as any[]) || [];
        let markdown = `# Job Hazard Analysis (JHA)\n\n`;
        markdown += `**Project:** ${project?.name || "Unknown"}\n`;
        markdown += `**Client:** ${project?.clientName || "Unknown"}\n`;
        markdown += `**Date:** ${jha.createdAt ? new Date(jha.createdAt).toLocaleDateString() : "Unknown"}\n`;
        markdown += `**Status:** ${jha.status}\n`;
        markdown += `**AI Generated:** ${jha.generatedByAi ? "Yes" : "No"}\n\n`;
        
        if (jha.plannedOperations) markdown += `## Planned Operations\n${jha.plannedOperations}\n\n`;
        if (jha.weatherConditions) markdown += `## Weather Conditions\n${jha.weatherConditions}\n\n`;
        if (jha.diveDepthRange) markdown += `## Dive Depth Range\n${jha.diveDepthRange}\n\n`;
        
        markdown += `## Hazard Analysis\n\n`;
        markdown += `| # | Operation Step | Hazard | Risk Level | Controls | Responsible | PPE |\n`;
        markdown += `|---|---------------|--------|------------|----------|-------------|-----|\n`;
        entries.forEach((entry: any, idx: number) => {
          markdown += `| ${idx + 1} | ${entry.step} | ${entry.hazard} | ${entry.riskLevel} | ${entry.controls} | ${entry.responsibleParty} | ${entry.ppe || "Standard"} |\n`;
        });

        if (jha.supervisorNotes) markdown += `\n## Supervisor Notes\n${jha.supervisorNotes}\n`;
        if (jha.approvedBy) markdown += `\n## Approval\nApproved at: ${jha.approvedAt ? new Date(jha.approvedAt).toLocaleString() : "Unknown"}\n`;

        res.setHeader("Content-Type", "text/markdown");
        res.setHeader("Content-Disposition", `attachment; filename="JHA-${jhaId.slice(0, 8)}.md"`);
        res.send(markdown);
      } catch (err: any) {
        console.error("Export JHA error:", err);
        res.status(500).json({ message: "Failed to export JHA" });
      }
    }
  );

  // Export safety meeting as document
  app.get("/api/safety/meetings/:meetingId/export",
    requireAuth, requireSafetyFlag,
    async (req: Request, res: Response) => {
      try {
        const meetingId = getParam(req, "meetingId");
        const [meeting] = await db.select()
          .from(schema.safetyMeetings)
          .where(eq(schema.safetyMeetings.id, meetingId));

        if (!meeting) return res.status(404).json({ message: "Meeting not found" });

        const [project] = await db.select()
          .from(schema.projects)
          .where(eq(schema.projects.id, meeting.projectId));

        let markdown = `# Safety Meeting Record\n\n`;
        markdown += `**Project:** ${project?.name || "Unknown"}\n`;
        markdown += `**Date:** ${meeting.meetingDate}\n`;
        markdown += `**Status:** ${meeting.status}\n`;
        markdown += `**AI Generated:** ${meeting.generatedByAi ? "Yes" : "No"}\n\n`;

        if (meeting.safetyTopic) markdown += `## Safety Topic of the Day\n${meeting.safetyTopic}\n\n`;
        if (meeting.previousShiftSummary) markdown += `## Previous Shift Summary\n${meeting.previousShiftSummary}\n\n`;
        if (meeting.plannedOperations) markdown += `## Today's Planned Operations\n${meeting.plannedOperations}\n\n`;
        if (meeting.associatedHazards) markdown += `## Associated Hazards\n${meeting.associatedHazards}\n\n`;
        if (meeting.mitigationPlan) markdown += `## Mitigation Plan\n${meeting.mitigationPlan}\n\n`;
        if (meeting.openDiscussionPoints) markdown += `## Open Discussion Points\n${meeting.openDiscussionPoints}\n\n`;
        if (meeting.notes) markdown += `## Additional Notes\n${meeting.notes}\n\n`;

        const attendees = (meeting.attendees as string[]) || [];
        if (attendees.length > 0) {
          markdown += `## Attendees\n${attendees.map(a => `- ${a}`).join("\n")}\n\n`;
        }

        if (meeting.finalizedBy) {
          markdown += `## Finalization\nFinalized at: ${meeting.finalizedAt ? new Date(meeting.finalizedAt).toLocaleString() : "Unknown"}\n`;
        }

        res.setHeader("Content-Type", "text/markdown");
        res.setHeader("Content-Disposition", `attachment; filename="SafetyMeeting-${meeting.meetingDate}.md"`);
        res.send(markdown);
      } catch (err: any) {
        console.error("Export meeting error:", err);
        res.status(500).json({ message: "Failed to export meeting" });
      }
    }
  );

  console.log("[Routes] Safety routes registered successfully");
}

// ════════════════════════════════════════════════════════════════════════════
// DEFAULT CHECKLIST SEEDER
// ════════════════════════════════════════════════════════════════════════════

async function seedDefaultChecklists(projectId: string, clientType: string, userId: string): Promise<number> {
  let count = 0;

  // ── Pre-Dive Checklist (Diver) ──
  const [preDiveDiver] = await db.insert(schema.safetyChecklists).values({
    projectId,
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — Diver",
    description: "Equipment and readiness checks for the diver before entering the water",
    roleScope: "diver",
    clientType: clientType as any,
    sortOrder: 1,
    createdBy: userId,
  }).returning();

  const diverItems = [
    { itemText: "Helmet/mask inspected — no cracks, seals intact", category: "Equipment", isCritical: true },
    { itemText: "Primary breathing gas supply checked and verified", category: "Gas", isCritical: true },
    { itemText: "Bailout/emergency gas supply checked and verified", category: "Gas", isCritical: true },
    { itemText: "Umbilical inspected — no kinks, cuts, or damage", category: "Equipment", isCritical: true },
    { itemText: "Communications check completed — two-way confirmed", category: "Communications", isCritical: true },
    { itemText: "Harness/weight system properly fitted and secured", category: "Equipment", isCritical: false },
    { itemText: "Knife/cutting device secured and accessible", category: "Equipment", isCritical: false },
    { itemText: "Depth gauge/pneumo functioning", category: "Equipment", isCritical: true },
    { itemText: "Diver dress-in complete per Navy Dive Manual", category: "Procedure", isCritical: false },
    { itemText: "Emergency procedures reviewed and acknowledged", category: "Safety", isCritical: true },
    { itemText: "Dive plan briefing received and understood", category: "Procedure", isCritical: true },
    { itemText: "Physical condition satisfactory — no illness or impairment", category: "Personnel", isCritical: true },
  ];

  await db.insert(schema.checklistItems).values(
    diverItems.map((item, idx) => ({
      checklistId: preDiveDiver.id,
      itemText: item.itemText,
      category: item.category,
      isCritical: item.isCritical,
      sortOrder: idx,
    }))
  );
  count++;

  // ── Pre-Dive Checklist (Tender) ──
  const [preDiveTender] = await db.insert(schema.safetyChecklists).values({
    projectId,
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — Tender",
    description: "Tender-specific checks before dive operations begin",
    roleScope: "tender",
    clientType: clientType as any,
    sortOrder: 2,
    createdBy: userId,
  }).returning();

  const tenderItems = [
    { itemText: "Diver umbilical properly tended and clear of obstructions", category: "Equipment", isCritical: true },
    { itemText: "Pneumo gauge zeroed and functioning", category: "Equipment", isCritical: true },
    { itemText: "Communications system tested with diver", category: "Communications", isCritical: true },
    { itemText: "Emergency gas supply valve accessible and ready", category: "Gas", isCritical: true },
    { itemText: "First aid kit and oxygen readily available", category: "Safety", isCritical: true },
    { itemText: "Diver recall signals reviewed", category: "Procedure", isCritical: true },
    { itemText: "Standby diver dressed and ready", category: "Personnel", isCritical: true },
    { itemText: "Dive log/timer ready for recording", category: "Procedure", isCritical: false },
  ];

  await db.insert(schema.checklistItems).values(
    tenderItems.map((item, idx) => ({
      checklistId: preDiveTender.id,
      itemText: item.itemText,
      category: item.category,
      isCritical: item.isCritical,
      sortOrder: idx,
    }))
  );
  count++;

  // ── Pre-Dive Checklist (Supervisor) ──
  const [preDiveSupervisor] = await db.insert(schema.safetyChecklists).values({
    projectId,
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — Supervisor",
    description: "Supervisor verification before authorizing dive operations",
    roleScope: "supervisor",
    clientType: clientType as any,
    sortOrder: 3,
    createdBy: userId,
  }).returning();

  const supervisorItems = [
    { itemText: "Dive plan reviewed and current for today's operations", category: "Procedure", isCritical: true },
    { itemText: "All crew briefed on dive plan and emergency procedures", category: "Procedure", isCritical: true },
    { itemText: "Weather and environmental conditions assessed — safe to dive", category: "Environmental", isCritical: true },
    { itemText: "All required certifications current for personnel on site", category: "Personnel", isCritical: true },
    { itemText: "Emergency action plan reviewed — chamber/hospital contacts verified", category: "Safety", isCritical: true },
    { itemText: "Gas supply calculations verified for planned operations", category: "Gas", isCritical: true },
    { itemText: "Dive tables/software verified for planned depth and time", category: "Procedure", isCritical: true },
    { itemText: "Communications tested — all stations operational", category: "Communications", isCritical: true },
    { itemText: "Standby diver designated and ready", category: "Personnel", isCritical: true },
    { itemText: "Client/contracting officer notified of dive operations", category: "Administrative", isCritical: false },
  ];

  await db.insert(schema.checklistItems).values(
    supervisorItems.map((item, idx) => ({
      checklistId: preDiveSupervisor.id,
      itemText: item.itemText,
      category: item.category,
      isCritical: item.isCritical,
      sortOrder: idx,
    }))
  );
  count++;

  // ── Post-Dive Checklist ──
  const [postDive] = await db.insert(schema.safetyChecklists).values({
    projectId,
    checklistType: "post_dive",
    title: "Post-Dive Checklist",
    description: "Post-dive assessment for diver condition and equipment status",
    roleScope: "all",
    clientType: clientType as any,
    sortOrder: 4,
    createdBy: userId,
  }).returning();

  const postDiveItems = [
    { itemText: "Diver physical condition assessed — no symptoms of DCS/barotrauma", category: "Personnel", isCritical: true },
    { itemText: "Diver neurological exam completed (if required)", category: "Personnel", isCritical: true },
    { itemText: "Post-dive surface interval documented", category: "Procedure", isCritical: true },
    { itemText: "Equipment inspected for damage during dive", category: "Equipment", isCritical: false },
    { itemText: "Helmet/mask cleaned and stored properly", category: "Equipment", isCritical: false },
    { itemText: "Umbilical inspected, flushed, and stored", category: "Equipment", isCritical: false },
    { itemText: "Dive profile recorded accurately in log", category: "Procedure", isCritical: true },
    { itemText: "Any incidents or near-misses reported", category: "Safety", isCritical: true, requiresNote: true },
    { itemText: "Debrief notes captured", category: "Procedure", isCritical: false, requiresNote: true },
    { itemText: "Diver cleared for next dive (if applicable)", category: "Personnel", isCritical: true },
  ];

  await db.insert(schema.checklistItems).values(
    postDiveItems.map((item, idx) => ({
      checklistId: postDive.id,
      itemText: item.itemText,
      category: item.category,
      isCritical: item.isCritical,
      requiresNote: (item as any).requiresNote || false,
      sortOrder: idx,
    }))
  );
  count++;

  // ── Equipment Inspection Checklist ──
  const [equipmentChecklist] = await db.insert(schema.safetyChecklists).values({
    projectId,
    checklistType: "equipment",
    title: "Pre-Shift Equipment Inspection",
    description: "Daily equipment inspection with pass/fail/flag status — failed items auto-generate risk items",
    roleScope: "all",
    clientType: clientType as any,
    sortOrder: 5,
    createdBy: userId,
  }).returning();

  const equipmentItems = [
    { itemText: "Dive helmets/masks — visual inspection, function test", category: "Dive Equipment", isCritical: true },
    { itemText: "Breathing gas supply — pressure readings, manifold integrity", category: "Gas Systems", isCritical: true },
    { itemText: "Bailout bottles — pressure verified, valves functional", category: "Gas Systems", isCritical: true },
    { itemText: "Umbilicals — visual inspection for cuts, kinks, wear", category: "Dive Equipment", isCritical: true },
    { itemText: "Communications system — function test all stations", category: "Communications", isCritical: true },
    { itemText: "Pneumofathometer — calibrated and functional", category: "Instruments", isCritical: true },
    { itemText: "Dive compressor — oil level, filter status, output pressure", category: "Gas Systems", isCritical: true },
    { itemText: "Crane/winch — daily inspection, load test current", category: "Lifting Equipment", isCritical: true },
    { itemText: "First aid/O2 kit — stocked and accessible", category: "Safety Equipment", isCritical: true },
    { itemText: "Fire extinguishers — charged and accessible", category: "Safety Equipment", isCritical: false },
    { itemText: "Rigging/shackles — inspected, rated for load", category: "Rigging", isCritical: true },
    { itemText: "Power tools — inspected, GFCI protection verified", category: "Tools", isCritical: false },
  ];

  await db.insert(schema.checklistItems).values(
    equipmentItems.map((item, idx) => ({
      checklistId: equipmentChecklist.id,
      itemText: item.itemText,
      category: item.category,
      isCritical: item.isCritical,
      sortOrder: idx,
    }))
  );
  count++;

  return count;
}
