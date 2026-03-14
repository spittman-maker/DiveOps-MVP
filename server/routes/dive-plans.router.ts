import express, { Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, isAdminOrHigher } from "../auth";
import { requireProjectAccess } from "../authz";
import type { User } from "@shared/schema";

/** Safely coerce a route param (string | string[]) to a single string. */
function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

/** Get the authenticated user from the request. */
function getUser(req: Request): User {
  return req.user as User;
}

export const divePlansRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// DIVE PLANS
// ──────────────────────────────────────────────────────────────────────────

divePlansRouter.get("/projects/:projectId/dive-plans", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const plans = await storage.getDivePlansByProject(p(req.params.projectId));
  res.json(plans);
});

divePlansRouter.get("/dive-plans/:id", requireAuth, async (req: Request, res: Response) => {
  const plan = await storage.getDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Dive plan not found" });
  res.json(plan);
});

divePlansRouter.post("/projects/:projectId/dive-plans", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  const user = getUser(req);

  const plan = await storage.createDivePlan({
    projectId: p(req.params.projectId),
    dayId: req.body.dayId || null,
    status: "Draft",
    planVersion: 1,
    planJson: req.body.planJson || {},
    createdBy: user.id,
  });

  res.status(201).json(plan);
});

divePlansRouter.patch("/dive-plans/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const plan = await storage.getDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Dive plan not found" });

  // Check if closed - only ADMIN/GOD can reopen
  if (plan.status === "Closed") {
    const user = getUser(req);
    if (!isAdminOrHigher(user.role)) {
      return res.status(403).json({ message: "Only Admin can reopen closed plans" });
    }

    // Reopening increments version
    if (req.body.status === "Draft") {
      req.body.planVersion = plan.planVersion + 1;
    }
  }

  const updated = await storage.updateDivePlan(p(req.params.id), req.body);
  res.json(updated);
});

divePlansRouter.post("/dive-plans/:id/close", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const user = getUser(req);
  const plan = await storage.getDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Dive plan not found" });

  // TODO: Add validation for required sections and verified directory

  const updated = await storage.updateDivePlan(p(req.params.id), {
    status: "Closed",
    closedBy: user.id,
    closedAt: new Date(),
  });

  res.json(updated);
});

// ──────────────────────────────────────────────────────────────────────────
// STATIONS (within dive plans)
// ──────────────────────────────────────────────────────────────────────────

divePlansRouter.get("/dive-plans/:divePlanId/stations", requireAuth, async (req: Request, res: Response) => {
  const stations = await storage.getStationsByDivePlan(p(req.params.divePlanId));
  res.json(stations);
});

divePlansRouter.post("/dive-plans/:divePlanId/stations", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const plan = await storage.getDivePlan(p(req.params.divePlanId));
  if (!plan) return res.status(404).json({ message: "Dive plan not found" });

  const station = await storage.createStation({
    ...req.body,
    divePlanId: p(req.params.divePlanId),
  });

  res.status(201).json(station);
});

divePlansRouter.get("/stations/:id", requireAuth, async (req: Request, res: Response) => {
  const station = await storage.getStation(p(req.params.id));
  if (!station) return res.status(404).json({ message: "Station not found" });
  res.json(station);
});

divePlansRouter.patch("/stations/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const station = await storage.getStation(p(req.params.id));
  if (!station) return res.status(404).json({ message: "Station not found" });

  const updated = await storage.updateStation(p(req.params.id), req.body);
  res.json(updated);
});

divePlansRouter.delete("/stations/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const station = await storage.getStation(p(req.params.id));
  if (!station) return res.status(404).json({ message: "Station not found" });

  await storage.deleteStation(p(req.params.id));
  res.status(204).send();
});

// ──────────────────────────────────────────────────────────────────────────
// DIVE PLAN TEMPLATES
// ──────────────────────────────────────────────────────────────────────────

divePlansRouter.get("/dive-plan-templates", requireAuth, async (req: Request, res: Response) => {
  const templates = await storage.getDivePlanTemplates();
  res.json(templates);
});

divePlansRouter.post("/dive-plan-templates", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  const user = getUser(req);
  const template = await storage.createDivePlanTemplate({
    ...req.body,
    uploadedBy: user.id,
  });
  res.status(201).json(template);
});

// ──────────────────────────────────────────────────────────────────────────
// PROJECT DIVE PLANS (Project-level document generator)
// ──────────────────────────────────────────────────────────────────────────

divePlansRouter.get("/projects/:projectId/project-dive-plans", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const plans = await storage.getProjectDivePlansByProject(p(req.params.projectId));
  res.json(plans);
});

divePlansRouter.get("/projects/:projectId/project-dive-plans/active", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const plan = await storage.getActiveProjectDivePlan(p(req.params.projectId));
  if (!plan) return res.status(404).json({ message: "No approved dive plan found" });
  res.json(plan);
});

divePlansRouter.get("/project-dive-plans/:id", requireAuth, async (req: Request, res: Response) => {
  const plan = await storage.getProjectDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Project dive plan not found" });
  res.json(plan);
});

divePlansRouter.post("/projects/:projectId/project-dive-plans", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  const user = getUser(req);
  const project = await storage.getProject(p(req.params.projectId));
  if (!project) return res.status(404).json({ message: "Project not found" });

  const latestRevision = await storage.getLatestProjectDivePlanRevision(p(req.params.projectId));
  const newRevision = latestRevision + 1;

  const plan = await storage.createProjectDivePlan({
    ...req.body,
    projectId: p(req.params.projectId),
    revision: newRevision,
    createdBy: user.id,
  });

  res.status(201).json(plan);
});

divePlansRouter.patch("/project-dive-plans/:id", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const plan = await storage.getProjectDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Project dive plan not found" });

  if (plan.status === "Approved" || plan.status === "Superseded") {
    return res.status(400).json({ message: "Cannot modify approved or superseded plans" });
  }

  const updated = await storage.updateProjectDivePlan(p(req.params.id), req.body);
  res.json(updated);
});

divePlansRouter.post("/project-dive-plans/:id/submit", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const user = getUser(req);
  const plan = await storage.getProjectDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Project dive plan not found" });

  if (plan.status !== "Draft") {
    return res.status(400).json({ message: "Only draft plans can be submitted" });
  }

  const updated = await storage.updateProjectDivePlan(p(req.params.id), {
    status: "Submitted",
    submittedBy: user.id,
    submittedAt: new Date(),
  });

  res.json(updated);
});

divePlansRouter.post("/project-dive-plans/:id/approve", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  const user = getUser(req);
  const plan = await storage.getProjectDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Project dive plan not found" });

  if (plan.status !== "Submitted") {
    return res.status(400).json({ message: "Only submitted plans can be approved" });
  }

  const currentActive = await storage.getActiveProjectDivePlan(plan.projectId);
  if (currentActive && currentActive.id !== plan.id) {
    await storage.updateProjectDivePlan(currentActive.id, {
      status: "Superseded",
      supersededBy: plan.id,
    });
  }

  const updated = await storage.updateProjectDivePlan(p(req.params.id), {
    status: "Approved",
    approvedBy: user.id,
    approvedAt: new Date(),
  });

  res.json(updated);
});

divePlansRouter.post("/project-dive-plans/:id/new-revision", requireRole("SUPERVISOR", "ADMIN", "GOD"), async (req: Request, res: Response) => {
  const user = getUser(req);
  const existingPlan = await storage.getProjectDivePlan(p(req.params.id));
  if (!existingPlan) return res.status(404).json({ message: "Project dive plan not found" });

  const latestRevision = await storage.getLatestProjectDivePlanRevision(existingPlan.projectId);
  const newRevision = latestRevision + 1;

  const newPlan = await storage.createProjectDivePlan({
    projectId: existingPlan.projectId,
    templateId: existingPlan.templateId,
    revision: newRevision,
    status: "Draft",
    planData: existingPlan.planData,
    createdBy: user.id,
  });

  res.status(201).json(newPlan);
});

divePlansRouter.delete("/project-dive-plans/:id", requireRole("SUPERVISOR", "GOD"), async (req: Request, res: Response) => {
  const plan = await storage.getProjectDivePlan(p(req.params.id));
  if (!plan) return res.status(404).json({ message: "Project dive plan not found" });

  if (plan.status === "Approved") {
    const user = req.user as any;
    if (user.role !== "GOD") {
      return res.status(403).json({ message: "Only GOD role can delete approved plans" });
    }
  }

  const deleted = await storage.deleteProjectDivePlan(p(req.params.id));
  if (!deleted) return res.status(500).json({ message: "Failed to delete plan" });
  res.json({ message: "Plan deleted" });
});

// Auto-save endpoint: upserts the in-progress draft plan for a project.
// Creates a new Draft rev 0 if none exists, or updates planData on the most recent Draft.
// Called silently after every AI response so plan survives tab switches.
divePlansRouter.put("/projects/:projectId/project-dive-plans/autosave", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  const user = getUser(req);
  const projectId = p(req.params.projectId);
  const { planData } = req.body;
  if (!planData) return res.status(400).json({ message: "planData is required" });

  // Find the most recent Draft plan for this project
  const allPlans = await storage.getProjectDivePlansByProject(projectId);
  const draftPlan = allPlans.find(p => p.status === "Draft");

  if (draftPlan) {
    // Update existing draft
    const updated = await storage.updateProjectDivePlan(draftPlan.id, { planData });
    return res.json(updated);
  } else {
    // Create a new draft at revision 0
    const latestRevision = await storage.getLatestProjectDivePlanRevision(projectId);
    const newRevision = latestRevision + 1;
    const created = await storage.createProjectDivePlan({
      projectId,
      revision: newRevision,
      status: "Draft",
      planData,
      createdBy: user.id,
    });
    return res.status(201).json(created);
  }
});

// ──────────────────────────────────────────────────────────────────────────
// AI DIVE PLAN GENERATION
// ──────────────────────────────────────────────────────────────────────────

divePlansRouter.post("/dive-plan/ai-generate", requireRole("SUPERVISOR", "GOD", "ADMIN"), async (req: Request, res: Response) => {
  try {
    const { messages, currentPlan, projectContext } = req.body;

    // BUG-12a FIX: Guard against missing messages array to prevent crash
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "messages array is required and must not be empty" });
    }

    // BUG-LOCATION FIX: Forcibly inject siteLocation from projectContext on the SERVER side
    // so the AI always receives a pre-populated value and never invents one from geolocation.
    // Priority: currentPlan.coverPage.siteLocation (if already set) > projectContext.siteLocation
    //           > projectContext.jobsiteAddress > projectContext.jobsiteName
    const derivedSiteLocation: string =
      (currentPlan?.coverPage?.siteLocation as string | undefined)?.trim() ||
      (projectContext?.siteLocation as string | undefined)?.trim() ||
      (projectContext?.jobsiteAddress as string | undefined)?.trim() ||
      (projectContext?.jobsiteName as string | undefined)?.trim() ||
      "";

    // Build a seeded currentPlan with the correct siteLocation baked in
    const seededCurrentPlan = currentPlan
      ? {
          ...currentPlan,
          coverPage: {
            ...(currentPlan.coverPage || {}),
            siteLocation: derivedSiteLocation,
          },
        }
      : derivedSiteLocation
        ? { coverPage: { siteLocation: derivedSiteLocation } }
        : null;

    const { getAnthropicClient, AI_MODEL } = await import("../ai-client");
    const anthropic = getAnthropicClient();

    const taskLibrary = (await import("@shared/schema")).DD5_CONTROLLED_TASK_LIBRARY;

    const systemPrompt = `You are a DD5 Dive Plan document generator for Precision Subsea Group LLC. The supervisor will describe their dive operation in natural, everyday language. Your job is to extract the information and produce a structured JSON dive plan document.

## OUTPUT FORMAT
You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation) matching this exact structure:
{
  "chatSummary": "A brief 1-sentence description of what you changed or added in this update. Be specific about which sections were updated.",
  "coverPage": {
    "companyName": "Precision Subsea Group LLC",
    "projectTitle": "",
    "jobNumber": "",
    "client": "",
    "siteLocation": "",
    "submissionDate": "",
    "revisionNumber": 0
  },
  "projectContacts": {
    "primeContractor": "",
    "siteAddress": "",
    "keyContacts": [{ "name": "", "role": "", "phone": "", "email": "" }]
  },
  "natureOfWork": {
    "selectedTasks": []
  },
  "scopeOfWork": "",
  "divingMode": "",
  "maxDepth": "",
  "estimatedDuration": "",
  "personnelCount": "",
  "equipmentNotes": "",
  "siteConditions": "",
  "hazardNotes": "",
  "additionalNotes": "",
  "decompressionSchedules": ""
}

## FIELD DEFINITIONS
- "chatSummary": A unique, specific 1-sentence summary of what you changed. Example: "Added project contacts and updated max depth to 67 ft." NEVER repeat the same summary twice.
- "equipmentNotes": ONLY list diving equipment, tools, and gear. Examples: "KM-37 helmets, Broco underwater cutting torch, pneumatic grinder." Do NOT include personnel, procedures, or site conditions here.
- "decompressionSchedules": Information about decompression tables, no-decompression limits, table profiles being used. Example: "No-decompression dives using USN 45 ft, 60 ft, and 70 ft table profiles."
- "siteConditions": Environmental and site factors. Currents, visibility, water temp, bottom conditions, marine traffic.
- "hazardNotes": Identified hazards and mitigations only.
- "additionalNotes": Anything that doesn't fit other fields.

## RULES
1. Fill in ONLY what the supervisor has mentioned. Leave fields as empty strings if not discussed.
2. For "selectedTasks", ONLY use values from this approved list: ${JSON.stringify(taskLibrary)}
3. For "scopeOfWork", write a professional 2-4 sentence summary of what the dive operation involves.
4. If the supervisor mentions depths, diving methods (SCUBA, surface-supplied), number of divers, equipment, site conditions, or hazards, populate the appropriate fields.
5. Write professionally - convert casual language into formal dive plan language while preserving all factual details.
6. Each new message may add or modify information. Merge it with the existing plan data intelligently — preserve all previously populated fields.
7. NEVER invent information not provided by the supervisor. NEVER guess or infer a location from context, IP address, or any source other than what is explicitly stated by the supervisor or pre-populated in the PROJECT CONTEXT or CURRENT PLAN STATE.
8. Convert informal names/descriptions to proper technical terminology where appropriate.
9. Keep each field strictly within its defined purpose — do not bleed content between fields.
10. For "siteLocation": if the PROJECT CONTEXT contains a "siteLocation", "jobsiteAddress", or "jobsiteName" field, use that value as the siteLocation. If the CURRENT PLAN STATE already has a non-empty siteLocation, preserve it exactly. Only update siteLocation if the supervisor explicitly provides a different location.

## PROJECT CONTEXT (pre-populated from project settings)
${projectContext ? JSON.stringify(projectContext) : "No project context available"}

## CURRENT PLAN STATE
${seededCurrentPlan ? JSON.stringify(seededCurrentPlan) : "Empty - starting fresh"}

IMPORTANT: Always respond in English only. Never translate to any other language.

Respond with ONLY the updated JSON object. No other text.`;

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Convert OpenAI-style messages to Anthropic format (extract system, keep user/assistant)
    const systemContent = chatMessages.find(m => m.role === "system")?.content || "";
    const nonSystemMessages = chatMessages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = anthropic.messages.stream({
      model: AI_MODEL,
      max_tokens: 2000,
      system: systemContent,
      messages: nonSystemMessages,
    });

    let fullContent = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const delta = event.delta.text || "";
        if (delta) {
          fullContent += delta;
          res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
        }
      }
    }

    try {
      let jsonStr = fullContent.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const planData = JSON.parse(jsonStr);
      res.write(`data: ${JSON.stringify({ type: "plan", data: planData })}\n\n`);
    } catch {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Failed to parse plan data" })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error: any) {
    console.error("AI dive plan generation failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      res.end();
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────
// CHAMBER SEARCH
// ──────────────────────────────────────────────────────────────────────────

divePlansRouter.post("/dive-plan/chamber-search", requireRole("SUPERVISOR", "GOD", "ADMIN"), async (req: Request, res: Response) => {
  try {
    const { location, lat, lng } = req.body;

    const openai = new (await import("openai")).default({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });

    const locationDesc = location || (lat && lng ? `coordinates ${lat}, ${lng}` : "unknown location");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a diving safety assistant. The user needs to find the closest recompression/hyperbaric chambers near a work location. Provide your best knowledge of known recompression chamber facilities near the specified location.

For each facility, provide:
- Name of the facility
- Address
- Phone number (if known)
- Estimated travel time from the work location
- Type (military, civilian hospital, private)

IMPORTANT: Include the standard emergency numbers:
- DAN Emergency Hotline: +1-919-684-9111
- NEDU: 850-230-3100

Format your response as a JSON array:
[{"name": "...", "address": "...", "phone": "...", "travelTime": "...", "type": "...", "notes": "..."}]

If you're not confident about specific facilities, say so in the notes field. Always recommend verifying chamber availability and operational status before starting dive operations.`
        },
        {
          role: "user",
          content: `Find the closest recompression/hyperbaric chambers near: ${locationDesc}`
        }
      ],
      temperature: 0.3,
    });

    let content = response.choices[0]?.message?.content || "[]";
    try {
      if (content.includes("```")) {
        content = content.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
      }
      const chambers = JSON.parse(content);
      res.json({ chambers, location: locationDesc });
    } catch {
      res.json({ chambers: [], rawResponse: content, location: locationDesc });
    }
  } catch (error: any) {
    console.error("Chamber search failed:", error);
    res.status(500).json({ message: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// DOWNLOAD
// ──────────────────────────────────────────────────────────────────────────

divePlansRouter.get("/project-dive-plans/:id/download", requireAuth, async (req: Request, res: Response) => {
  const { generateDD5DivePlanDocx } = await import("../dive-plan-generator");

  const plan = await storage.getProjectDivePlan(p(req.params.id) as string);
  if (!plan) return res.status(404).json({ message: "Project dive plan not found" });

  const creator = await storage.getUser(plan.createdBy);
  const preparedBy = creator?.fullName || creator?.username || "Unknown";

  const workSelections = await storage.getProjectWorkSelections(plan.projectId);
  const projectContacts = await storage.getProjectContacts(plan.projectId);

  const companies = await storage.getAllCompanies();
  const companyContactDefaults = companies.length > 0
    ? await storage.getCompanyContactsDefaults(companies[0].companyId)
    : [];

  const dbData = {
    workSelections: workSelections.map(w => ({ category: w.category, label: w.label })),
    projectContacts: projectContacts.map(c => ({
      roleName: c.roleName,
      contactName: c.contactName,
      contactPhone: c.contactPhone
    })),
    companyContactDefaults: companyContactDefaults.map(c => ({
      roleName: c.roleName,
      defaultName: c.defaultName,
      defaultPhone: c.defaultPhone,
    })),
  };

  const buffer = await generateDD5DivePlanDocx(
    plan.planData as any,
    preparedBy,
    dbData
  );

  const fileName = `DD5_DivePlan_Rev${plan.revision}.docx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
});
