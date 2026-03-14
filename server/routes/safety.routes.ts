import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth";
import { requireProjectAccess } from "../authz";
import { isEnabled } from "../feature-flags";
import { safetyStorage } from "../safety-storage";
import { generateCorrelationId, emitAuditEvent, sanitizeForAudit, type AuditContext } from "../audit";
import logger from "../logger";
import type { ChecklistResponse, JhaContent, SafetyMeetingAgenda } from "@shared/safety-schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function p(req: Request, name: string): string {
  const v = req.params[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Build an AuditContext from the request, using the middleware-injected auditCtx if available. */
function auditCtx(req: Request, projectId?: string): AuditContext {
  const base = (req as any).auditCtx as AuditContext | undefined;
  const user = req.user as any;
  return {
    correlationId: base?.correlationId || (req as any).correlationId || generateCorrelationId(),
    userId: user?.id || base?.userId,
    userRole: user?.role || base?.userRole,
    ipAddress: base?.ipAddress || req.ip || req.socket?.remoteAddress,
    projectId: projectId || base?.projectId,
  };
}

// Track projects currently being seeded to prevent concurrent duplicate seeding
const seedingInProgress = new Set<string>();

/**
 * Auto-seed regulation-grounded checklists for a project.
 * Uses the CHECKLIST_TEMPLATES from safety-seed-data.ts which reference
 * Navy Dive Manual (NAVSEA SS521-AG-PRO-010) and USACE EM 385-1-1 Section 30.
 *
 * @param projectId - The project to seed checklists for
 * @param createdBy - The user ID to attribute the checklists to
 * @returns The number of checklists created, or 0 if already seeded
 */
async function seedDefaultChecklistsForProject(projectId: string, createdBy: string): Promise<number> {
  // Check if already seeded
  const existing = await safetyStorage.getChecklistsByProject(projectId);
  if (existing.length > 0) return 0;

  // Prevent concurrent seeding for the same project
  if (seedingInProgress.has(projectId)) return 0;
  seedingInProgress.add(projectId);

  try {
    const { CHECKLIST_TEMPLATES } = await import("../safety-seed-data");
    let totalChecklists = 0;

    for (const template of CHECKLIST_TEMPLATES) {
      const checklist = await safetyStorage.createChecklist({
        projectId,
        checklistType: template.checklistType,
        title: template.title,
        description: template.description,
        roleScope: template.roleScope,
        createdBy,
        isActive: true,
        version: 1,
      });

      const items = template.items.map(item => ({
        checklistId: checklist.id,
        sortOrder: item.sortOrder,
        category: item.category,
        label: item.label,
        description: item.description,
        itemType: item.itemType,
        isRequired: item.isRequired,
        equipmentCategory: item.equipmentCategory,
        regulatoryReference: item.regulatoryReference,
      }));

      await safetyStorage.bulkCreateChecklistItems(items);
      totalChecklists++;
    }

    logger.info({ projectId, totalChecklists }, "Auto-seeded default safety checklists for project");
    return totalChecklists;
  } catch (err) {
    logger.error({ err, projectId }, "Failed to auto-seed default checklists");
    return 0;
  } finally {
    seedingInProgress.delete(projectId);
  }
}

function requireSafetyFlag(_req: Request, res: Response, next: NextFunction) {
  if (!isEnabled("safetyTab")) {
    return res.status(404).json({ message: "Safety features are not enabled" });
  }
  next();
}

// ────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

const createChecklistSchema = z.object({
  projectId: z.string().min(1),
  checklistType: z.enum(["pre_dive", "post_dive", "equipment"]),
  title: z.string().min(1),
  description: z.string().optional(),
  roleScope: z.enum(["diver", "tender", "supervisor", "all"]).default("all"),
  items: z.array(z.object({
    sortOrder: z.number().default(0),
    category: z.string().optional(),
    label: z.string().min(1),
    description: z.string().optional(),
    itemType: z.enum(["checkbox", "pass_fail_flag", "text_input", "numeric_input", "gas_analysis"]).default("checkbox"),
    isRequired: z.boolean().default(true),
    equipmentCategory: z.string().optional(),
    regulatoryReference: z.string().optional(),
  })).optional(),
});

const completeChecklistSchema = z.object({
  checklistId: z.string().min(1),
  projectId: z.string().min(1),
  dayId: z.string().optional(),
  responses: z.array(z.object({
    itemId: z.string(),
    label: z.string(),
    value: z.union([z.string(), z.boolean(), z.number()]),
    status: z.enum(["pass", "fail", "flag"]).optional(),
    notes: z.string().optional(),
  })),
  notes: z.string().optional(),
  digitalSignature: z.string().optional(),
});

const createJhaSchema = z.object({
  projectId: z.string().min(1),
  dayId: z.string().optional(),
  title: z.string().min(1),
  content: z.object({
    jobDescription: z.string(),
    location: z.string(),
    date: z.string(),
    weatherConditions: z.string().optional(),
    diveDepth: z.number().optional(),
    equipmentInUse: z.array(z.string()).optional(),
    plannedOperations: z.array(z.string()).optional(),
    hazards: z.array(z.object({
      hazard: z.string(),
      riskLevel: z.enum(["low", "medium", "high", "critical"]),
      controls: z.array(z.string()).min(1, "Each hazard MUST have at least one control measure"),
      responsibleParty: z.string(),
      ppe: z.array(z.string()).optional(),
    })).min(1, "JHA MUST contain at least one hazard"),
    emergencyProcedures: z.array(z.string()).optional(),
    additionalNotes: z.string().optional(),
    historicalIncidentsSummary: z.string().optional(),
    aiModel: z.string().optional(),
    aiPromptVersion: z.string().optional(),
  }),
  aiGenerated: z.boolean().default(false),
});

const updateJhaSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["draft", "pending_review", "approved", "superseded"]).optional(),
  content: z.any().optional(),
  digitalSignature: z.string().optional(),
});

const createMeetingSchema = z.object({
  projectId: z.string().min(1),
  dayId: z.string().optional(),
  title: z.string().min(1),
  meetingDate: z.string().min(1),
  agenda: z.object({
    safetyTopicOfDay: z.string().min(1, "Safety meeting MUST have a safety topic of the day"),
    previousShiftSummary: z.object({
      workCompleted: z.array(z.string()),
      issues: z.array(z.string()),
      nearMisses: z.array(z.string()),
    }),
    todaysHazards: z.array(z.object({
      hazard: z.string(),
      mitigation: z.string(),
    })),
    openDiscussionPoints: z.array(z.string()),
    supervisorQuestions: z.array(z.object({
      question: z.string(),
      answer: z.string().optional(),
    })),
    weatherConditions: z.string().optional(),
    equipmentStatusFlags: z.array(z.string()).optional(),
    plannedOperations: z.array(z.string()).optional(),
  }),
  aiGenerated: z.boolean().default(false),
  attendees: z.array(z.string()).optional(),
});

const updateMeetingSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["draft", "in_progress", "completed"]).optional(),
  agenda: z.any().optional(),
  attendees: z.array(z.string()).optional(),
  duration: z.number().optional(),
  notes: z.string().optional(),
  digitalSignature: z.string().optional(),
});

const createNearMissSchema = z.object({
  projectId: z.string().min(1),
  dayId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1, "Near-miss report MUST have a description"),
  location: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z.string().optional(),
  involvedPersonnel: z.array(z.string()).optional(),
  immediateActions: z.string().optional(),
  voiceTranscript: z.string().optional(),
});

const updateNearMissSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["reported", "under_review", "resolved", "closed"]).optional(),
  rootCause: z.string().optional(),
  correctiveActions: z.string().optional(),
  immediateActions: z.string().optional(),
});

const aiGenerateJhaSchema = z.object({
  projectId: z.string().min(1),
  dayId: z.string().optional(),
  plannedOperations: z.array(z.string()).optional(),
  weatherConditions: z.string().optional(),
  diveDepth: z.number().optional(),
  equipmentInUse: z.array(z.string()).optional(),
  location: z.string().optional(),
});

const aiGenerateMeetingSchema = z.object({
  projectId: z.string().min(1),
  dayId: z.string().optional(),
  plannedOperations: z.array(z.string()).optional(),
  weatherConditions: z.string().optional(),
  supervisorNotes: z.string().optional(),
});

const createSafetyTopicSchema = z.object({
  category: z.enum([
    "entanglement", "loss_of_gas", "communications_failure", "hypothermia",
    "barotrauma", "equipment_failure", "weather_current", "crane_operations",
    "cutting_welding", "confined_space", "contaminated_water", "general",
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  talkingPoints: z.array(z.string()).default([]),
  applicableDiveTypes: z.array(z.string()).default([]),
  regulatoryReferences: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

const createJhaHazardSchema = z.object({
  category: z.enum([
    "environmental", "equipment", "physiological", "operational",
    "chemical", "mechanical", "electrical",
  ]),
  hazard: z.string().min(1),
  description: z.string().min(1),
  defaultRiskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  standardControls: z.array(z.string()).default([]),
  requiredPpe: z.array(z.string()).default([]),
  applicableOperations: z.array(z.string()).default([]),
  regulatoryBasis: z.string().optional(),
  isActive: z.boolean().default(true),
});

// ────────────────────────────────────────────────────────────────────────────
// Route Registration
// ────────────────────────────────────────────────────────────────────────────

export function registerSafetyRoutes(app: Express): void {
  const safetyAuth = [requireAuth, requireSafetyFlag] as const;
  const supervisorAuth = [requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD")] as const;

  // ── Safety Metrics ───────────────────────────────────────────────────

  app.get("/api/safety/:projectId/metrics", requireAuth, requireSafetyFlag, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const metrics = await safetyStorage.getSafetyMetrics(projectId);
      res.json(metrics);
    } catch (err: any) {
      logger.error({ err }, "Failed to get safety metrics");
      res.status(500).json({ error: err.message });
    }
  });

  // ── Checklists (Templates) ──────────────────────────────────────────

  app.get("/api/safety/:projectId/checklists", requireAuth, requireSafetyFlag, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      let checklists = await safetyStorage.getChecklistsByProject(projectId, type);

      // Auto-seed default checklists on first access if none exist
      if (checklists.length === 0 && !type) {
        const user = req.user as any;
        const seeded = await seedDefaultChecklistsForProject(projectId, user.id);
        if (seeded > 0) {
          checklists = await safetyStorage.getChecklistsByProject(projectId, type);
        }
      }

      res.json(checklists);
    } catch (err: any) {
      logger.error({ err }, "Failed to get checklists");
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/safety/checklists/:id", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const checklist = await safetyStorage.getChecklist(id);
      if (!checklist) return res.status(404).json({ message: "Checklist not found" });
      const items = await safetyStorage.getChecklistItems(id);
      res.json({ ...checklist, items });
    } catch (err: any) {
      logger.error({ err }, "Failed to get checklist");
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/safety/checklists", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = createChecklistSchema.parse(req.body);
      const user = req.user as any;
      const checklist = await safetyStorage.createChecklist({
        projectId: data.projectId,
        checklistType: data.checklistType,
        title: data.title,
        description: data.description || null,
        roleScope: data.roleScope,
        createdBy: user.id,
        isActive: true,
        version: 1,
      });

      if (data.items && data.items.length > 0) {
        const items = data.items.map((item, idx) => ({
          checklistId: checklist.id,
          sortOrder: item.sortOrder ?? idx,
          category: item.category || null,
          label: item.label,
          description: item.description || null,
          itemType: item.itemType,
          isRequired: item.isRequired,
          equipmentCategory: item.equipmentCategory || null,
          regulatoryReference: item.regulatoryReference || null,
        }));
        await safetyStorage.bulkCreateChecklistItems(items);
      }

      const items = await safetyStorage.getChecklistItems(checklist.id);
      res.status(201).json({ ...checklist, items });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to create checklist");
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/safety/checklists/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const updated = await safetyStorage.updateChecklist(id, req.body);
      if (!updated) return res.status(404).json({ message: "Checklist not found" });
      res.json(updated);
    } catch (err: any) {
      logger.error({ err }, "Failed to update checklist");
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/safety/checklists/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      await safetyStorage.deleteChecklist(id);
      res.json({ message: "Checklist deactivated" });
    } catch (err: any) {
      logger.error({ err }, "Failed to delete checklist");
      res.status(500).json({ error: err.message });
    }
  });

  // ── Checklist Items ─────────────────────────────────────────────────

  app.post("/api/safety/checklists/:checklistId/items", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const checklistId = p(req, "checklistId");
      const item = await safetyStorage.createChecklistItem({
        checklistId,
        ...req.body,
      });
      res.status(201).json(item);
    } catch (err: any) {
      logger.error({ err }, "Failed to create checklist item");
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/safety/checklists/:checklistId/items", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const checklistId = p(req, "checklistId");
      const items = await safetyStorage.getChecklistItems(checklistId);
      res.json(items);
    } catch (err: any) {
      logger.error({ err }, "Failed to get checklist items");
      res.status(500).json({ error: err.message });
    }
  });

  // ── Checklist Completions ───────────────────────────────────────────

  app.get("/api/safety/:projectId/completions", requireAuth, requireSafetyFlag, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const completions = await safetyStorage.getCompletionsByProject(projectId);
      res.json(completions);
    } catch (err: any) {
      logger.error({ err }, "Failed to get completions");
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/safety/completions", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const data = completeChecklistSchema.parse(req.body);
      const user = req.user as any;

      const failedItems = data.responses.filter(r => r.status === "fail" || r.status === "flag");
      const autoRiskIds: string[] = [];

      const completion = await safetyStorage.createCompletion({
        checklistId: data.checklistId,
        projectId: data.projectId,
        dayId: data.dayId || null,
        completedBy: user.id,
        completedByName: user.fullName || user.username,
        status: failedItems.length > 0 ? "completed_with_issues" : "completed",
        responses: data.responses as ChecklistResponse[],
        digitalSignature: data.digitalSignature || null,
        signedAt: data.digitalSignature ? new Date() : null,
        notes: data.notes || null,
        autoGeneratedRiskIds: autoRiskIds,
      });

      // Auto-save completed checklist to Library
      try {
        const checklist = await safetyStorage.getChecklist(data.checklistId);
        if (checklist) {
          const completedAt = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
          const statusLabel = failedItems.length > 0 ? "Completed with Issues" : "Completed";
          // Build a plain-text summary of all responses
          const responseSummary = (data.responses as ChecklistResponse[]).map((r: any) => {
            const statusStr = r.status ? ` [${r.status.toUpperCase()}]` : "";
            const notesStr = r.notes ? `\n    Notes: ${r.notes}` : "";
            return `  • ${r.label}${statusStr}${notesStr}`;
          }).join("\n");
          const content = [
            `SAFETY CHECKLIST COMPLETION RECORD`,
            `====================================`,
            `Checklist: ${checklist.title}`,
            `Type: ${checklist.checklistType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
            `Completed By: ${user.fullName || user.username}`,
            `Completed At: ${completedAt}`,
            `Status: ${statusLabel}`,
            data.digitalSignature ? `Digital Signature: ${data.digitalSignature}` : "",
            data.notes ? `Notes: ${data.notes}` : "",
            ``,
            `RESPONSES (${data.responses.length} items):`,
            responseSummary,
            ``,
            `Completion ID: ${completion.id}`,
          ].filter(Boolean).join("\n");

          const { storage: mainStorage } = await import("../storage");
          await mainStorage.createLibraryDocument({
            title: `${checklist.title} — ${statusLabel} ${completedAt}`,
            docType: "project_doc",
            projectId: data.projectId,
            content,
            metadata: {
              source: "safety_checklist_completion",
              completionId: completion.id,
              checklistId: data.checklistId,
              checklistType: checklist.checklistType,
              completedBy: user.id,
              completedByName: user.fullName || user.username,
              status: completion.status,
              failedItemCount: failedItems.length,
              completedAt: new Date().toISOString(),
            },
            locked: false,
            uploadedBy: user.id,
          });
        }
      } catch (libErr: any) {
        // Non-fatal: log but don't fail the completion
        logger.warn({ err: libErr }, "Failed to auto-save checklist completion to Library");
      }

      res.status(201).json({ ...completion, savedToLibrary: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to create completion");
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/safety/completions/:id", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const completion = await safetyStorage.getCompletion(id);
      if (!completion) return res.status(404).json({ message: "Completion not found" });
      res.json(completion);
    } catch (err: any) {
      logger.error({ err }, "Failed to get completion");
      res.status(500).json({ error: err.message });
    }
  });

  // ── JHA Records ─────────────────────────────────────────────────────

  app.get("/api/safety/:projectId/jha", requireAuth, requireSafetyFlag, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const jhas = await safetyStorage.getJhasByProject(projectId);
      res.json(jhas);
    } catch (err: any) {
      logger.error({ err }, "Failed to get JHAs");
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/safety/jha/:id", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const jha = await safetyStorage.getJha(id);
      if (!jha) return res.status(404).json({ message: "JHA not found" });
      res.json(jha);
    } catch (err: any) {
      logger.error({ err }, "Failed to get JHA");
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/safety/jha", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = createJhaSchema.parse(req.body);
      const user = req.user as any;

      const jha = await safetyStorage.createJha({
        projectId: data.projectId,
        dayId: data.dayId || null,
        title: data.title,
        status: "draft",
        content: data.content as JhaContent,
        aiGenerated: data.aiGenerated,
        generatedBy: user.id,
        version: 1,
      });

      // Audit: JHA created — life-safety record
      const ctx = auditCtx(req, data.projectId);
      emitAuditEvent(ctx, "safety.jha.create", {
        targetId: jha.id,
        targetType: "jha_record",
        after: sanitizeForAudit(jha),
        metadata: { title: jha.title, hazardCount: data.content.hazards.length, aiGenerated: data.aiGenerated },
      }).catch(() => {});

      res.status(201).json(jha);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to create JHA");
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/safety/jha/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const data = updateJhaSchema.parse(req.body);
      const user = req.user as any;

      // Capture before-state for audit diff
      const before = await safetyStorage.getJha(id);
      if (!before) return res.status(404).json({ message: "JHA not found" });

      const updates: any = { ...data };

      if (data.status === "approved") {
        updates.approvedBy = user.id;
        updates.approvedAt = new Date();
      }
      if (data.status === "pending_review") {
        updates.reviewedBy = user.id;
        updates.reviewedAt = new Date();
      }

      const updated = await safetyStorage.updateJha(id, updates);
      if (!updated) return res.status(404).json({ message: "JHA not found" });

      // Audit: JHA updated — life-safety record
      const ctx = auditCtx(req, before.projectId);
      emitAuditEvent(ctx, "safety.jha.update", {
        targetId: id,
        targetType: "jha_record",
        before: sanitizeForAudit(before),
        after: sanitizeForAudit(updated),
        metadata: { statusChange: data.status ? `${before.status} → ${data.status}` : undefined },
      }).catch(() => {});

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to update JHA");
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/safety/jha/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const before = await safetyStorage.getJha(id);
      if (!before) return res.status(404).json({ message: "JHA not found" });

      await safetyStorage.deleteJha(id);

      // Audit: JHA deleted (superseded) — life-safety record
      const ctx = auditCtx(req, before.projectId);
      emitAuditEvent(ctx, "safety.jha.delete", {
        targetId: id,
        targetType: "jha_record",
        before: sanitizeForAudit(before),
        metadata: { title: before.title },
      }).catch(() => {});

      res.json({ message: "JHA superseded" });
    } catch (err: any) {
      logger.error({ err }, "Failed to delete JHA");
      res.status(500).json({ error: err.message });
    }
  });

  // ── AI JHA Generation ───────────────────────────────────────────────

  app.post("/api/safety/jha/generate", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = aiGenerateJhaSchema.parse(req.body);
      const user = req.user as any;

      const nearMisses = await safetyStorage.getNearMissesByProject(data.projectId);
      const recentNearMisses = nearMisses.slice(0, 10);

      // RAG cross-check: query knowledge base for relevant safety documents, SOPs, and incident data
      let ragContext: string | undefined;
      let ragSources: Array<{ title: string; source: string; score: number; excerpt: string }> = [];
      try {
        const { getRAGContextFull } = await import("../services/azure-search");
        const operations = (data.plannedOperations || []).join(", ") || "commercial diving operations";
        const equipment = (data.equipmentInUse || []).join(", ");
        const ragQuery = `JHA hazard analysis ${operations} ${equipment} ${data.location || ""} safety SOP incident`.trim();

        const ragResult = await getRAGContextFull({
          query: ragQuery,
          topK: 8,
          mode: "hybrid",
          documentType: undefined,
        });
        ragContext = ragResult.contextText;
        ragSources = ragResult.sources;
        logger.info({ ragResultCount: ragResult.totalResults, query: ragQuery }, "RAG context retrieved for JHA generation");
      } catch (ragErr) {
        logger.warn({ err: ragErr }, "RAG query failed for JHA generation — proceeding without knowledge base context");
        ragContext = "No relevant documents found in the knowledge base.";
      }

      const { generateJhaWithAI } = await import("../safety-ai");
      const jhaContent = await generateJhaWithAI({
        plannedOperations: data.plannedOperations || [],
        weatherConditions: data.weatherConditions || "Not specified",
        diveDepth: data.diveDepth,
        equipmentInUse: data.equipmentInUse || [],
        location: data.location || "Not specified",
        historicalNearMisses: recentNearMisses.map(nm => ({
          title: nm.title,
          description: nm.description,
          severity: nm.severity,
        })),
        ragContext,
        ragSources,
      });

      const today = new Date().toISOString().split("T")[0];
      const jha = await safetyStorage.createJha({
        projectId: data.projectId,
        dayId: data.dayId || null,
        title: `Daily JHA - ${today}`,
        status: "pending_review",
        content: jhaContent,
        aiGenerated: true,
        generatedBy: user.id,
        version: 1,
      });

      // Audit: AI-generated JHA — life-safety record
      const ctx = auditCtx(req, data.projectId);
      emitAuditEvent(ctx, "safety.jha.generate", {
        targetId: jha.id,
        targetType: "jha_record",
        after: sanitizeForAudit(jha),
        metadata: {
          aiGenerated: true,
          hazardCount: jhaContent.hazards?.length ?? 0,
          ragSourceCount: ragSources.length,
          nearMissesConsidered: recentNearMisses.length,
        },
      }).catch(() => {});

      res.status(201).json(jha);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to generate JHA with AI");
      res.status(500).json({ error: err.message || "AI JHA generation failed" });
    }
  });

  // ── Safety Meetings ─────────────────────────────────────────────────

  app.get("/api/safety/:projectId/meetings", requireAuth, requireSafetyFlag, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const meetings = await safetyStorage.getMeetingsByProject(projectId);
      res.json(meetings);
    } catch (err: any) {
      logger.error({ err }, "Failed to get meetings");
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/safety/meetings/:id", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const meeting = await safetyStorage.getMeeting(id);
      if (!meeting) return res.status(404).json({ message: "Meeting not found" });
      res.json(meeting);
    } catch (err: any) {
      logger.error({ err }, "Failed to get meeting");
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/safety/meetings", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = createMeetingSchema.parse(req.body);
      const user = req.user as any;

      const meeting = await safetyStorage.createMeeting({
        projectId: data.projectId,
        dayId: data.dayId || null,
        title: data.title,
        meetingDate: data.meetingDate,
        status: "draft",
        agenda: data.agenda as SafetyMeetingAgenda,
        aiGenerated: data.aiGenerated,
        conductedBy: user.id,
        conductedByName: user.fullName || user.username,
        attendees: data.attendees || [],
      });

      // Audit: Safety meeting created — life-safety record
      const ctx = auditCtx(req, data.projectId);
      emitAuditEvent(ctx, "safety.meeting.create", {
        targetId: meeting.id,
        targetType: "safety_meeting",
        after: sanitizeForAudit(meeting),
        metadata: { title: meeting.title, meetingDate: data.meetingDate },
      }).catch(() => {});

      res.status(201).json(meeting);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to create meeting");
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/safety/meetings/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const data = updateMeetingSchema.parse(req.body);

      // Capture before-state for audit diff
      const before = await safetyStorage.getMeeting(id);
      if (!before) return res.status(404).json({ message: "Meeting not found" });

      const updates: any = { ...data };

      if (data.status === "completed") {
        updates.signedAt = new Date();
      }
      if (data.digitalSignature) {
        updates.signedAt = new Date();
      }

      const updated = await safetyStorage.updateMeeting(id, updates);
      if (!updated) return res.status(404).json({ message: "Meeting not found" });

      // Audit: Safety meeting updated — life-safety record
      const ctx = auditCtx(req, before.projectId);
      emitAuditEvent(ctx, "safety.meeting.update", {
        targetId: id,
        targetType: "safety_meeting",
        before: sanitizeForAudit(before),
        after: sanitizeForAudit(updated),
        metadata: { statusChange: data.status ? `${before.status} → ${data.status}` : undefined },
      }).catch(() => {});

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to update meeting");
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/safety/meetings/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const before = await safetyStorage.getMeeting(id);
      if (!before) return res.status(404).json({ message: "Meeting not found" });

      await safetyStorage.deleteMeeting(id);

      // Audit: Safety meeting deleted — life-safety record
      const ctx = auditCtx(req, before.projectId);
      emitAuditEvent(ctx, "safety.meeting.delete", {
        targetId: id,
        targetType: "safety_meeting",
        before: sanitizeForAudit(before),
        metadata: { title: before.title },
      }).catch(() => {});

      res.json({ message: "Meeting deleted" });
    } catch (err: any) {
      logger.error({ err }, "Failed to delete meeting");
      res.status(500).json({ error: err.message });
    }
  });

  // ── AI Meeting Generation ───────────────────────────────────────────

  app.post("/api/safety/meetings/generate", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = aiGenerateMeetingSchema.parse(req.body);
      const user = req.user as any;

      const nearMisses = await safetyStorage.getNearMissesByProject(data.projectId);
      const recentNearMisses = nearMisses.slice(0, 5);
      const recentMeetings = await safetyStorage.getMeetingsByProject(data.projectId);
      const lastMeeting = recentMeetings[0];

      // RAG cross-check: query knowledge base for near-miss reports, safety bulletins, and relevant SOPs
      let ragContext: string | undefined;
      let ragSources: Array<{ title: string; source: string; score: number; excerpt: string }> = [];
      try {
        const { getRAGContextFull } = await import("../services/azure-search");
        const operations = (data.plannedOperations || []).join(", ") || "commercial diving operations";
        const ragQuery = `safety meeting near-miss report safety bulletin ${operations} lessons learned SOP`.trim();

        const ragResult = await getRAGContextFull({
          query: ragQuery,
          topK: 6,
          mode: "hybrid",
          documentType: undefined,
        });
        ragContext = ragResult.contextText;
        ragSources = ragResult.sources;
        logger.info({ ragResultCount: ragResult.totalResults, query: ragQuery }, "RAG context retrieved for meeting generation");
      } catch (ragErr) {
        logger.warn({ err: ragErr }, "RAG query failed for meeting generation — proceeding without knowledge base context");
        ragContext = "No relevant documents found in the knowledge base.";
      }

      const { generateMeetingWithAI } = await import("../safety-ai");
      const agenda = await generateMeetingWithAI({
        plannedOperations: data.plannedOperations || [],
        weatherConditions: data.weatherConditions || "Not specified",
        supervisorNotes: data.supervisorNotes || "",
        recentNearMisses: recentNearMisses.map(nm => ({
          title: nm.title,
          description: nm.description,
          severity: nm.severity,
        })),
        previousMeetingNotes: lastMeeting?.notes || undefined,
        ragContext,
        ragSources,
      });

      const today = new Date().toISOString().split("T")[0];
      const meeting = await safetyStorage.createMeeting({
        projectId: data.projectId,
        dayId: data.dayId || null,
        title: `Morning Safety Meeting - ${today}`,
        meetingDate: today,
        status: "draft",
        agenda,
        aiGenerated: true,
        conductedBy: user.id,
        conductedByName: user.fullName || user.username,
        attendees: [],
      });

      // Audit: AI-generated safety meeting — life-safety record
      const ctx = auditCtx(req, data.projectId);
      emitAuditEvent(ctx, "safety.meeting.generate", {
        targetId: meeting.id,
        targetType: "safety_meeting",
        after: sanitizeForAudit(meeting),
        metadata: {
          aiGenerated: true,
          ragSourceCount: ragSources.length,
          nearMissesConsidered: recentNearMisses.length,
          hasPreviousMeetingContext: !!lastMeeting,
        },
      }).catch(() => {});

      res.status(201).json(meeting);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to generate meeting with AI");
      res.status(500).json({ error: err.message || "AI meeting generation failed" });
    }
  });

  // ── Near-Miss Reports ───────────────────────────────────────────────

  app.get("/api/safety/:projectId/near-misses", requireAuth, requireSafetyFlag, requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const reports = await safetyStorage.getNearMissesByProject(projectId);
      res.json(reports);
    } catch (err: any) {
      logger.error({ err }, "Failed to get near-miss reports");
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/safety/near-misses/:id", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const report = await safetyStorage.getNearMiss(id);
      if (!report) return res.status(404).json({ message: "Near-miss report not found" });
      res.json(report);
    } catch (err: any) {
      logger.error({ err }, "Failed to get near-miss report");
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/safety/near-misses", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const data = createNearMissSchema.parse(req.body);
      const user = req.user as any;

      const report = await safetyStorage.createNearMiss({
        projectId: data.projectId,
        dayId: data.dayId || null,
        reportedBy: user.id,
        reportedByName: user.fullName || user.username,
        title: data.title,
        description: data.description,
        location: data.location || null,
        severity: data.severity,
        status: "reported",
        category: data.category || null,
        involvedPersonnel: data.involvedPersonnel || [],
        immediateActions: data.immediateActions || null,
        voiceTranscript: data.voiceTranscript || null,
      });

      // Audit: Near-miss reported — life-safety record (any authenticated user can report)
      const ctx = auditCtx(req, data.projectId);
      emitAuditEvent(ctx, "safety.near_miss.create", {
        targetId: report.id,
        targetType: "near_miss_report",
        after: sanitizeForAudit(report),
        metadata: { title: report.title, severity: data.severity, location: data.location },
      }).catch(() => {});

      res.status(201).json(report);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to create near-miss report");
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/safety/near-misses/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const data = updateNearMissSchema.parse(req.body);
      const user = req.user as any;

      // Capture before-state for audit diff
      const before = await safetyStorage.getNearMiss(id);
      if (!before) return res.status(404).json({ message: "Near-miss report not found" });

      const updates: any = { ...data };

      if (data.status === "under_review") {
        updates.reviewedBy = user.id;
        updates.reviewedAt = new Date();
      }
      if (data.status === "resolved") {
        updates.resolvedBy = user.id;
        updates.resolvedAt = new Date();
      }

      const updated = await safetyStorage.updateNearMiss(id, updates);
      if (!updated) return res.status(404).json({ message: "Near-miss report not found" });

      // Audit: Near-miss updated — life-safety record
      const ctx = auditCtx(req, before.projectId);
      emitAuditEvent(ctx, "safety.near_miss.update", {
        targetId: id,
        targetType: "near_miss_report",
        before: sanitizeForAudit(before),
        after: sanitizeForAudit(updated),
        metadata: {
          statusChange: data.status ? `${before.status} → ${data.status}` : undefined,
          severityChange: data.severity ? `${before.severity} → ${data.severity}` : undefined,
        },
      }).catch(() => {});

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to update near-miss report");
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/safety/near-misses/:id", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = p(req, "id");
      const before = await safetyStorage.getNearMiss(id);
      if (!before) return res.status(404).json({ message: "Near-miss report not found" });

      await safetyStorage.deleteNearMiss(id);

      // Audit: Near-miss deleted — life-safety record
      const ctx = auditCtx(req, before.projectId);
      emitAuditEvent(ctx, "safety.near_miss.delete", {
        targetId: id,
        targetType: "near_miss_report",
        before: sanitizeForAudit(before),
        metadata: { title: before.title, severity: before.severity },
      }).catch(() => {});

      res.json({ message: "Near-miss report deleted" });
    } catch (err: any) {
      logger.error({ err }, "Failed to delete near-miss report");
      res.status(500).json({ error: err.message });
    }
  });

  // ── Default Checklist Templates ─────────────────────────────────────

  app.post("/api/safety/:projectId/seed-checklists", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const user = req.user as any;

      const existing = await safetyStorage.getChecklistsByProject(projectId);
      if (existing.length > 0) {
        return res.json({ message: "Checklists already seeded", count: existing.length });
      }

      // Seed pre-dive checklist
      const preDive = await safetyStorage.createChecklist({
        projectId,
        checklistType: "pre_dive",
        title: "Pre-Dive Safety Checklist",
        description: "Standard pre-dive safety inspection and verification checklist",
        roleScope: "all",
        createdBy: user.id,
        isActive: true,
        version: 1,
      });

      await safetyStorage.bulkCreateChecklistItems([
        { checklistId: preDive.id, sortOrder: 1, category: "Equipment", label: "Helmet/mask inspected and functional", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: preDive.id, sortOrder: 2, category: "Equipment", label: "Umbilical inspected — no cuts, kinks, or damage", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: preDive.id, sortOrder: 3, category: "Equipment", label: "Harness/bailout bottle secured and tested", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: preDive.id, sortOrder: 4, category: "Equipment", label: "Dive knife/cutting device present", itemType: "checkbox", isRequired: true },
        { checklistId: preDive.id, sortOrder: 5, category: "Gas Analysis", label: "Breathing gas analyzed — O2 percentage verified", itemType: "gas_analysis", isRequired: true },
        { checklistId: preDive.id, sortOrder: 6, category: "Gas Analysis", label: "Gas supply pressure adequate for planned dive", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: preDive.id, sortOrder: 7, category: "Communications", label: "Primary communications tested and clear", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: preDive.id, sortOrder: 8, category: "Communications", label: "Backup communications verified", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: preDive.id, sortOrder: 9, category: "Emergency", label: "Emergency procedures reviewed with dive team", itemType: "checkbox", isRequired: true },
        { checklistId: preDive.id, sortOrder: 10, category: "Emergency", label: "Standby diver ready and briefed", itemType: "checkbox", isRequired: true },
        { checklistId: preDive.id, sortOrder: 11, category: "Emergency", label: "First aid kit and oxygen accessible", itemType: "checkbox", isRequired: true },
        { checklistId: preDive.id, sortOrder: 12, category: "Planning", label: "Dive plan reviewed — depth, time, task", itemType: "checkbox", isRequired: true },
        { checklistId: preDive.id, sortOrder: 13, category: "Planning", label: "Decompression schedule confirmed if applicable", itemType: "checkbox", isRequired: false },
        { checklistId: preDive.id, sortOrder: 14, category: "Planning", label: "Weather and sea state acceptable", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: preDive.id, sortOrder: 15, category: "Personnel", label: "Diver medically fit — no complaints", itemType: "checkbox", isRequired: true },
      ]);

      // Seed post-dive checklist
      const postDive = await safetyStorage.createChecklist({
        projectId,
        checklistType: "post_dive",
        title: "Post-Dive Safety Checklist",
        description: "Post-dive assessment, equipment check, and incident capture",
        roleScope: "all",
        createdBy: user.id,
        isActive: true,
        version: 1,
      });

      await safetyStorage.bulkCreateChecklistItems([
        { checklistId: postDive.id, sortOrder: 1, category: "Diver Condition", label: "Diver physical condition assessment", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: postDive.id, sortOrder: 2, category: "Diver Condition", label: "Any signs of DCS or barotrauma", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: postDive.id, sortOrder: 3, category: "Diver Condition", label: "Diver verbal debrief completed", itemType: "checkbox", isRequired: true },
        { checklistId: postDive.id, sortOrder: 4, category: "Equipment", label: "Helmet/mask condition post-dive", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: postDive.id, sortOrder: 5, category: "Equipment", label: "Umbilical condition post-dive", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: postDive.id, sortOrder: 6, category: "Equipment", label: "All tools and equipment accounted for", itemType: "checkbox", isRequired: true },
        { checklistId: postDive.id, sortOrder: 7, category: "Incident Capture", label: "Any incidents or near-misses to report?", itemType: "pass_fail_flag", isRequired: true },
        { checklistId: postDive.id, sortOrder: 8, category: "Incident Capture", label: "Incident/near-miss description", itemType: "text_input", isRequired: false },
        { checklistId: postDive.id, sortOrder: 9, category: "Debrief", label: "Task completion status", itemType: "text_input", isRequired: true },
        { checklistId: postDive.id, sortOrder: 10, category: "Debrief", label: "Debrief notes and observations", itemType: "text_input", isRequired: false },
      ]);

      // Seed equipment checklist
      const equipment = await safetyStorage.createChecklist({
        projectId,
        checklistType: "equipment",
        title: "Pre-Shift Equipment Inspection",
        description: "Daily equipment inspection with pass/fail/flag status",
        roleScope: "supervisor",
        createdBy: user.id,
        isActive: true,
        version: 1,
      });

      await safetyStorage.bulkCreateChecklistItems([
        { checklistId: equipment.id, sortOrder: 1, category: "Diving Systems", label: "Air compressor — operational and serviced", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
        { checklistId: equipment.id, sortOrder: 2, category: "Diving Systems", label: "HP air bank — pressure and certification current", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "air_bank" },
        { checklistId: equipment.id, sortOrder: 3, category: "Diving Systems", label: "Dive control panel — gauges calibrated", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "control_panel" },
        { checklistId: equipment.id, sortOrder: 4, category: "Diving Systems", label: "Volume tank — inspected and certified", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "volume_tank" },
        { checklistId: equipment.id, sortOrder: 5, category: "Communications", label: "Comms system — all channels tested", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
        { checklistId: equipment.id, sortOrder: 6, category: "Safety Equipment", label: "Decompression chamber — operational (if applicable)", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "chamber" },
        { checklistId: equipment.id, sortOrder: 7, category: "Safety Equipment", label: "First aid and O2 kit — stocked and accessible", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "first_aid" },
        { checklistId: equipment.id, sortOrder: 8, category: "Rigging", label: "Crane/winch — inspected and load-tested", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "crane" },
        { checklistId: equipment.id, sortOrder: 9, category: "Rigging", label: "Stage/basket — inspected", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "stage" },
        { checklistId: equipment.id, sortOrder: 10, category: "PPE", label: "All required PPE available and in good condition", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "ppe" },
      ]);

      const allChecklists = await safetyStorage.getChecklistsByProject(projectId);
      res.status(201).json({ message: "Default checklists seeded", count: allChecklists.length, checklists: allChecklists });
    } catch (err: any) {
      logger.error({ err }, "Failed to seed checklists");
      res.status(500).json({ error: err.message });
    }
  });

  // ── Seed All Safety Data (topics, hazards, and expanded checklists) ──

  app.post("/api/safety/seed-all", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { SAFETY_TOPICS, JHA_HAZARDS, CHECKLIST_TEMPLATES } = await import("../safety-seed-data");
      const results: Record<string, any> = {};

      // Seed safety topics
      const topicCount = await safetyStorage.getSafetyTopicCount();
      if (topicCount === 0) {
        const topics = await safetyStorage.bulkCreateSafetyTopics(
          SAFETY_TOPICS.map(t => ({ ...t, isActive: true }))
        );
        results.safetyTopics = { seeded: topics.length };
      } else {
        results.safetyTopics = { existing: topicCount, message: "Already seeded" };
      }

      // Seed JHA hazards
      const hazardCount = await safetyStorage.getJhaHazardCount();
      if (hazardCount === 0) {
        const hazards = await safetyStorage.bulkCreateJhaHazards(
          JHA_HAZARDS.map(h => ({ ...h, isActive: true }))
        );
        results.jhaHazards = { seeded: hazards.length };
      } else {
        results.jhaHazards = { existing: hazardCount, message: "Already seeded" };
      }

      results.checklistTemplates = { available: CHECKLIST_TEMPLATES.length, message: "Use POST /api/safety/:projectId/seed-checklists to seed checklists for a specific project" };

      res.status(201).json({ message: "Safety seed data loaded", results });
    } catch (err: any) {
      logger.error({ err }, "Failed to seed safety data");
      res.status(500).json({ error: err.message });
    }
  });

  // ── Seed expanded checklists for a project ─────────────────────────

  app.post("/api/safety/:projectId/seed-expanded-checklists", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
    try {
      const projectId = p(req, "projectId");
      const user = req.user as any;
      const { CHECKLIST_TEMPLATES } = await import("../safety-seed-data");

      const existing = await safetyStorage.getChecklistsByProject(projectId);
      if (existing.length > 0) {
        return res.json({ message: "Checklists already exist for this project", count: existing.length });
      }

      let totalChecklists = 0;
      let totalItems = 0;

      for (const template of CHECKLIST_TEMPLATES) {
        const checklist = await safetyStorage.createChecklist({
          projectId,
          checklistType: template.checklistType,
          title: template.title,
          description: template.description,
          roleScope: template.roleScope,
          createdBy: user.id,
          isActive: true,
          version: 1,
        });

        const items = template.items.map(item => ({
          checklistId: checklist.id,
          sortOrder: item.sortOrder,
          category: item.category,
          label: item.label,
          description: item.description,
          itemType: item.itemType,
          isRequired: item.isRequired,
          equipmentCategory: item.equipmentCategory,
          regulatoryReference: item.regulatoryReference,
        }));

        await safetyStorage.bulkCreateChecklistItems(items);
        totalChecklists++;
        totalItems += items.length;
      }

      const allChecklists = await safetyStorage.getChecklistsByProject(projectId);
      res.status(201).json({
        message: "Expanded checklists seeded",
        checklistsCreated: totalChecklists,
        itemsCreated: totalItems,
        checklists: allChecklists,
      });
    } catch (err: any) {
      logger.error({ err }, "Failed to seed expanded checklists");
      res.status(500).json({ error: err.message });
    }
  });

  // ── Safety Topic Library Endpoints ─────────────────────────────────

  app.get("/api/safety/topics", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const topics = await safetyStorage.getSafetyTopics(category);
      res.json(topics);
    } catch (err: any) {
      logger.error({ err }, "Failed to get safety topics");
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/safety/topics", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = createSafetyTopicSchema.parse(req.body);
      const topic = await safetyStorage.createSafetyTopic(data as any);

      // Audit: Safety topic created
      const ctx = auditCtx(req);
      emitAuditEvent(ctx, "safety.topic.create", {
        targetId: topic.id,
        targetType: "safety_topic",
        after: sanitizeForAudit(topic),
        metadata: { category: data.category, title: data.title },
      }).catch(() => {});

      res.status(201).json(topic);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to create safety topic");
      res.status(500).json({ error: err.message });
    }
  });

  // ── JHA Hazard Library Endpoints ───────────────────────────────────

  app.get("/api/safety/hazards", requireAuth, requireSafetyFlag, async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const hazards = await safetyStorage.getJhaHazards(category);
      res.json(hazards);
    } catch (err: any) {
      logger.error({ err }, "Failed to get JHA hazards");
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/safety/hazards", requireAuth, requireSafetyFlag, requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const data = createJhaHazardSchema.parse(req.body);
      const hazard = await safetyStorage.createJhaHazard(data as any);

      // Audit: JHA hazard created
      const ctx = auditCtx(req);
      emitAuditEvent(ctx, "safety.hazard.create", {
        targetId: hazard.id,
        targetType: "jha_hazard",
        after: sanitizeForAudit(hazard),
        metadata: { category: data.category, hazard: data.hazard },
      }).catch(() => {});

      res.status(201).json(hazard);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      logger.error({ err }, "Failed to create JHA hazard");
      res.status(500).json({ error: err.message });
    }
  });

  console.log("[Routes] Safety routes registered successfully");
}
