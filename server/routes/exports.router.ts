import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, isGod } from "../auth";
import { requireDayAccess, requireProjectAccess } from "../authz";
import { getMasterLogSection } from "../extraction";
import { isEnabled } from "../feature-flags";
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

export const exportsRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// MASTER LOG (Client-facing derived view)
// ──────────────────────────────────────────────────────────────────────────

exportsRouter.get("/days/:dayId/master-log", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
  const day = await storage.getDay(p(req.params.dayId));
  if (!day) return res.status(404).json({ message: "Day not found" });

  const events = await storage.getLogEventsByDay(p(req.params.dayId));

  // Group by legacy sections AND new station-based structure
  const sections: Record<string, any[]> = {
    ops: [],
    dive: [],
    directives: [],
    safety: [],
    risk: [],
  };

  const stationEntries: Record<string, any[]> = {};
  const directiveEntries: any[] = [];
  const conflictEntries: any[] = [];
  const operationalNotes: any[] = [];
  const riskEntries: any[] = [];

  for (const event of events) {
    const renders = await storage.getLogRendersByEvent(event.id);
    const masterRender = renders.find(r => r.renderType === "master_log_line");

    const sectionKey = getMasterLogSection(event.category as any);
    const entry = {
      id: event.id,
      eventTime: event.eventTime,
      rawText: event.rawText,
      masterLogLine: masterRender?.renderText || event.rawText,
      status: masterRender?.status || "ok",
      station: event.station || null,
      category: event.category,
    };

    sections[sectionKey].push(entry);

    if (event.category === "directive") {
      directiveEntries.push(entry);
      const extracted = event.extractedJson as any;
      if (extracted?.directiveTag) {
        conflictEntries.push({ ...entry, directiveTag: extracted.directiveTag });
      }
    } else if (event.category === "safety") {
      riskEntries.push(entry);
    } else {
      const stationName = event.station || "General Operations";
      if (!stationEntries[stationName]) stationEntries[stationName] = [];
      stationEntries[stationName].push(entry);
    }
  }

  // Build station logs grouped by station
  const stationLogs = Object.entries(stationEntries).map(([station, entries]) => ({
    station,
    entries: entries.sort((a: any, b: any) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()),
  }));

  // Get dives for this day with diver info
  const dives = await storage.getDivesByDay(p(req.params.dayId));
  const divesWithNames = await Promise.all(dives.map(async (dive) => {
    let diverName = dive.diverDisplayName || "Unknown";
    if (dive.diverId) {
      const diver = await storage.getUser(dive.diverId);
      if (diver) diverName = diver.fullName || diver.username || diverName;
    }
    return {
      ...dive,
      diverName,
    };
  }));

  // Calculate summary from log events
  const allDiverNames = new Set<string>();
  let diveStartCount = 0;
  let extractedMaxDepth = 0;

  for (const event of events) {
    const text = event.rawText;
    const upper = text.toUpperCase();

    const nameBeforeDiveOp = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+L\/?S\b/g);
    if (nameBeforeDiveOp) {
      nameBeforeDiveOp.forEach(m => {
        const name = m.replace(/\s+L\/?S$/i, '').trim();
        if (name.length > 1) allDiverNames.add(name);
      });
    }

    const initialDotName = text.match(/([A-Z]\.[A-Z][a-z]+)/g);
    if (initialDotName) {
      initialDotName.forEach(n => allDiverNames.add(n));
    }

    const initialsBeforeDiveOp = upper.match(/\b([A-Z]{2})\s+(?:L\/?S|R\/?B|L\/?B|R\/?S)\b/g);
    if (initialsBeforeDiveOp) {
      initialsBeforeDiveOp.forEach(m => {
        const initials = m.split(/\s+/)[0];
        if (initials && initials.length === 2) allDiverNames.add(initials);
      });
    }

    const lsMatches = upper.match(/\bL\/?S\b/g);
    if (lsMatches) diveStartCount += lsMatches.length;

    const depthMatch = upper.match(/(\d+)\s*FSW/i);
    if (depthMatch) {
      const depth = parseInt(depthMatch[1], 10);
      if (depth > extractedMaxDepth) extractedMaxDepth = depth;
    }
  }

  const uniqueDivers = dives.length > 0
    ? new Set(dives.map(d => d.diverDisplayName || d.diverId))
    : allDiverNames;
  const maxDepth = Math.max(
    extractedMaxDepth,
    ...dives.map(d => d.maxDepthFsw || 0)
  );
  const totalDives = dives.length > 0 ? dives.length : Math.max(diveStartCount, sections.dive.length);
  const totalDivers = totalDives === 0 ? 0 : (dives.length > 0 ? uniqueDivers.size : allDiverNames.size);

  // Get risk items for this day
  const risks = await storage.getRiskItemsByDay(p(req.params.dayId));

  res.json({
    day,
    isLocked: day.status === "CLOSED",
    isDraft: day.status !== "CLOSED",
    sections,
    stationLogs,
    directiveEntries: directiveEntries.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()),
    conflictEntries,
    operationalNotes,
    riskEntries,
    risks,
    dives: divesWithNames,
    summary: {
      totalDives,
      totalDivers,
      maxDepth,
      safetyIncidents: sections.safety.length,
      directivesCount: sections.directives.length,
      extractedDiverInitials: Array.from(allDiverNames),
    },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DAILY SUMMARIES
// ──────────────────────────────────────────────────────────────────────────

exportsRouter.get("/days/:dayId/summary", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
  const summary = await storage.getDailySummary(p(req.params.dayId));
  if (!summary) return res.status(404).json({ message: "Daily summary not found" });
  res.json(summary);
});

exportsRouter.post("/days/:dayId/summary", requireRole("SUPERVISOR", "ADMIN", "GOD"), requireDayAccess(), async (req: Request, res: Response) => {
  const day = await storage.getDay(p(req.params.dayId));
  if (!day) return res.status(404).json({ message: "Day not found" });

  const summary = await storage.createOrUpdateDailySummary({
    ...req.body,
    dayId: p(req.params.dayId),
    projectId: day.projectId,
  });

  res.json(summary);
});

// ──────────────────────────────────────────────────────────────────────────
// LIBRARY DOCUMENTS
// ──────────────────────────────────────────────────────────────────────────

exportsRouter.get("/library", requireAuth, async (req: Request, res: Response) => {
  // BUG-06 FIX: Non-GOD users should only see library docs from their company's projects
  const user = getUser(req);
  if (isEnabled("multiTenantOrg") && !isGod(user.role) && user.companyId) {
    try {
      const projects = await storage.getProjectsByCompany(user.companyId);
      const allDocs: any[] = [];
      // Get global docs (projectId IS NULL)
      const globalDocs = await storage.getLibraryDocuments();
      allDocs.push(...globalDocs);
      // Get project-scoped docs for each company project
      for (const p of projects) {
        const pDocs = await storage.getLibraryDocuments(p.id);
        allDocs.push(...pDocs);
      }
      return res.json(allDocs);
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to fetch library" });
    }
  }
  // Get global documents (no project ID)
  const globalDocs = await storage.getLibraryDocuments();
  res.json(globalDocs);
});

exportsRouter.get("/projects/:projectId/library", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const projectDocs = await storage.getLibraryDocuments(p(req.params.projectId));
  const globalDocs = await storage.getLibraryDocuments();
  res.json([...globalDocs, ...projectDocs]);
});

exportsRouter.post("/library", requireRole("GOD"), async (req: Request, res: Response) => {
  // BUG-19 FIX: Validate required fields before creating
  const { title, docType, content } = req.body;
  const validDocTypes = ["navy_diving_manual", "em_385", "company_manual", "project_doc"];
  if (!docType || !validDocTypes.includes(docType)) {
    return res.status(400).json({ message: `Missing or invalid docType. Must be one of: ${validDocTypes.join(", ")}` });
  }
  if (!title) {
    return res.status(400).json({ message: "Missing required field: title" });
  }
  const user = getUser(req);

  const doc = await storage.createLibraryDocument({
    ...req.body,
    uploadedBy: user.id,
  });

  res.status(201).json(doc);
});

// Library Exports (generated shift documents)
exportsRouter.get("/projects/:projectId/library-exports", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const exports = await storage.getLibraryExports(p(req.params.projectId));
  res.json(exports);
});

exportsRouter.get("/days/:dayId/library-exports", requireAuth, requireDayAccess(), async (req: Request, res: Response) => {
  const exports = await storage.getLibraryExportsByDay(p(req.params.dayId));
  res.json(exports);
});

exportsRouter.get("/library-exports/:id/download", requireAuth, async (req: Request, res: Response) => {
  const exportDoc = await storage.getLibraryExport(p(req.params.id));
  if (!exportDoc) return res.status(404).json({ message: "Export not found" });

  const buffer = Buffer.from(exportDoc.fileData, "base64");
  const mimeType = exportDoc.fileType === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${exportDoc.fileName}"`);
  res.send(buffer);
});

exportsRouter.get("/library-exports/:id/preview", requireAuth, async (req: Request, res: Response) => {
  try {
    const exportDoc = await storage.getLibraryExport(p(req.params.id));
    if (!exportDoc) return res.status(404).json({ message: "Export not found" });

    const buffer = Buffer.from(exportDoc.fileData, "base64");

    if (exportDoc.fileType === "docx") {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file("word/document.xml")?.async("string");
      if (!xml) return res.json({ content: "Unable to extract document content", lines: [] });

      const lines: string[] = [];
      const paragraphs = xml.split(/<w:p[ >]/);
      for (const para of paragraphs) {
        const texts: string[] = [];
        const textMatches = para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
        for (const m of textMatches) {
          texts.push(m[1]);
        }
        const line = texts.join("");
        if (line.trim()) lines.push(line.trim());
      }

      res.json({ content: lines.join("\n"), lines, fileName: exportDoc.fileName, fileType: exportDoc.fileType });
    } else {
      res.json({ content: "Preview not available for spreadsheet files. Please download to view.", lines: [], fileName: exportDoc.fileName, fileType: exportDoc.fileType });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
