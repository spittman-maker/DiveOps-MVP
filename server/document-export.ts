/**
 * Document Export Service
 * 
 * Generates Word documents for shift closeout:
 * - Raw Notes (supervisor input)
 * - Daily Log (formatted notes)
 * - Master Log (client-facing with timestamp rules)
 * - Individual Dive Logs
 * - Risk Register (Excel)
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import ExcelJS from "exceljs";
import { storage } from "./storage";
import type { Day, LogEvent, LogRender, RiskItem, Dive, User, Project } from "@shared/schema";
import { validateMasterLogPayload, validateAIContent, sanitizeForMasterLog, type MasterLogPayload } from "./validator";

export interface ExportResult {
  projectFolder: string;
  dayFolder: string;
  files: {
    name: string;
    path: string;
    type: "docx" | "xlsx";
    buffer: Buffer;
  }[];
}

export interface ExportSnapshot {
  day: Day;
  project: Project;
  events: LogEvent[];
  dives: Dive[];
  risks: RiskItem[];
  rendersByEventId: Map<string, LogRender[]>;
  usersByDiverId: Map<string, User>;
}

export async function snapshotExportData(dayId: string): Promise<ExportSnapshot> {
  const day = await storage.getDay(dayId);
  if (!day) throw new Error("Day not found");

  const project = await storage.getProject(day.projectId);
  if (!project) throw new Error("Project not found");

  const events = await storage.getLogEventsByDay(dayId);
  const dives = await storage.getDivesByDay(dayId);
  const risks = await storage.getRiskItemsByDay(dayId);

  const rendersByEventId = new Map<string, LogRender[]>();
  for (const event of events) {
    const renders = await storage.getLogRendersByEvent(event.id);
    rendersByEventId.set(event.id, renders);
  }

  const usersByDiverId = new Map<string, User>();
  const uniqueDiverIds = Array.from(new Set(dives.map(d => d.diverId).filter(Boolean))) as string[];
  for (const diverId of uniqueDiverIds) {
    const user = await storage.getUser(diverId);
    if (user) usersByDiverId.set(diverId, user);
  }

  return { day, project, events, dives, risks, rendersByEventId, usersByDiverId };
}

export async function generateShiftExportFromSnapshot(snapshot: ExportSnapshot): Promise<ExportResult & { validation: ValidationReport }> {
  const { day, project, events, dives, risks, rendersByEventId, usersByDiverId } = snapshot;

  const masterLogPayload = buildMasterLogPayload(events, day, project.name, dives);
  const validationResult = validateMasterLogPayload(masterLogPayload);

  const validationReport: ValidationReport = {
    valid: validationResult.valid,
    criticalErrors: validationResult.errors
      .filter(e => e.severity === "critical")
      .map(e => e.message),
    warnings: validationResult.warnings.map(w => w.message),
  };

  if (!validationResult.valid) {
    console.error("[VALIDATOR] Critical errors found:", validationReport.criticalErrors);
  }
  if (validationResult.warnings.length > 0) {
    console.warn("[VALIDATOR] Warnings:", validationReport.warnings);
  }

  const dateStr = formatDateYYYYMMDD(day.date);
  const projectFolder = sanitizeFolderName(project.name);
  const dayFolder = dateStr;
  const files: ExportResult["files"] = [];

  const eventsWithRenders = events.map(event => ({
    ...event,
    renders: rendersByEventId.get(event.id) || [],
  }));

  const rawNotesBuffer = await generateRawNotesDoc(events, day, project.name);
  files.push({
    name: `RawNotes_${dateStr}.docx`,
    path: `${projectFolder}/${dayFolder}/RawNotes_${dateStr}.docx`,
    type: "docx",
    buffer: rawNotesBuffer,
  });

  const dailyLogBuffer = await generateDailyLogDocPure(eventsWithRenders, day, project, dives, risks);
  files.push({
    name: `DailyLog_${dateStr}.docx`,
    path: `${projectFolder}/${dayFolder}/DailyLog_${dateStr}.docx`,
    type: "docx",
    buffer: dailyLogBuffer,
  });

  const masterLogBuffer = await generateMasterLogDocPure(eventsWithRenders, day, project.name, dives, usersByDiverId);
  files.push({
    name: `MasterLog_${dateStr}.docx`,
    path: `${projectFolder}/${dayFolder}/ML_${dateStr}/MasterLog_${dateStr}.docx`,
    type: "docx",
    buffer: masterLogBuffer,
  });

  for (const dive of dives) {
    const diver = dive.diverId ? usersByDiverId.get(dive.diverId) : undefined;
    const initials = diver?.initials
      || diver?.username?.substring(0, 2).toUpperCase()
      || deriveInitialsFromDisplayName(dive.diverDisplayName)
      || "UNK";
    const diveBuffer = await generateDiveLogDoc(dive, day, project.name, initials);
    files.push({
      name: `${initials}_${dateStr}_DL.docx`,
      path: `${projectFolder}/${dayFolder}/DL_${dateStr}/${initials}_${dateStr}_DL.docx`,
      type: "docx",
      buffer: diveBuffer,
    });
  }

  if (risks.length > 0) {
    const riskBuffer = await generateRiskRegisterExcel(risks, day, project.name);
    files.push({
      name: `RRR_${dateStr}.xlsx`,
      path: `${projectFolder}/${dayFolder}/RRR_${dateStr}.xlsx`,
      type: "xlsx",
      buffer: riskBuffer,
    });
  }

  return { projectFolder, dayFolder, files, validation: validationReport };
}

function formatDateYYYYMMDD(date: string): string {
  return date.replace(/-/g, "");
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
}

function formatTime(date: Date | string | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function deriveInitialsFromDisplayName(displayName: string | null | undefined): string | undefined {
  if (!displayName) return undefined;
  const name = displayName.trim();
  if (name.length <= 3 && /^[A-Z]{2,3}$/i.test(name)) return name.toUpperCase();
  const parts = name.split(/[\s.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export interface ValidationReport {
  valid: boolean;
  criticalErrors: string[];
  warnings: string[];
}

export async function generateShiftExport(dayId: string): Promise<ExportResult & { validation: ValidationReport }> {
  const day = await storage.getDay(dayId);
  if (!day) throw new Error("Day not found");

  const project = await storage.getProject(day.projectId);
  if (!project) throw new Error("Project not found");

  const events = await storage.getLogEventsByDay(dayId);
  const dives = await storage.getDivesByDay(dayId);
  const risks = await storage.getRiskItemsByDay(dayId);

  // Build payload for validation
  const masterLogPayload = buildMasterLogPayload(events, day, project.name, dives);
  const validationResult = validateMasterLogPayload(masterLogPayload);

  const validationReport: ValidationReport = {
    valid: validationResult.valid,
    criticalErrors: validationResult.errors
      .filter(e => e.severity === "critical")
      .map(e => e.message),
    warnings: validationResult.warnings.map(w => w.message),
  };

  // Log validation issues
  if (!validationResult.valid) {
    console.error("[VALIDATOR] Critical errors found:", validationReport.criticalErrors);
  }
  if (validationResult.warnings.length > 0) {
    console.warn("[VALIDATOR] Warnings:", validationReport.warnings);
  }

  const dateStr = formatDateYYYYMMDD(day.date);
  const projectFolder = sanitizeFolderName(project.name);
  const dayFolder = dateStr;

  const files: ExportResult["files"] = [];

  const rawNotesBuffer = await generateRawNotesDoc(events, day, project.name);
  files.push({
    name: `RawNotes_${dateStr}.docx`,
    path: `${projectFolder}/${dayFolder}/RawNotes_${dateStr}.docx`,
    type: "docx",
    buffer: rawNotesBuffer,
  });

  const dailyLogBuffer = await generateDailyLogDoc(events, day, project.name);
  files.push({
    name: `DailyLog_${dateStr}.docx`,
    path: `${projectFolder}/${dayFolder}/DailyLog_${dateStr}.docx`,
    type: "docx",
    buffer: dailyLogBuffer,
  });

  const masterLogBuffer = await generateMasterLogDoc(events, day, project.name, dives);
  files.push({
    name: `MasterLog_${dateStr}.docx`,
    path: `${projectFolder}/${dayFolder}/ML_${dateStr}/MasterLog_${dateStr}.docx`,
    type: "docx",
    buffer: masterLogBuffer,
  });

  for (const dive of dives) {
    const diver = dive.diverId ? await storage.getUser(dive.diverId) : undefined;
    const initials = diver?.initials 
      || diver?.username?.substring(0, 2).toUpperCase() 
      || deriveInitialsFromDisplayName(dive.diverDisplayName)
      || "UNK";
    const diveBuffer = await generateDiveLogDoc(dive, day, project.name, initials);
    files.push({
      name: `${initials}_${dateStr}_DL.docx`,
      path: `${projectFolder}/${dayFolder}/DL_${dateStr}/${initials}_${dateStr}_DL.docx`,
      type: "docx",
      buffer: diveBuffer,
    });
  }

  if (risks.length > 0) {
    const riskBuffer = await generateRiskRegisterExcel(risks, day, project.name);
    files.push({
      name: `RRR_${dateStr}.xlsx`,
      path: `${projectFolder}/${dayFolder}/RRR_${dateStr}.xlsx`,
      type: "xlsx",
      buffer: riskBuffer,
    });
  }

  return {
    projectFolder,
    dayFolder,
    files,
    validation: validationReport,
  };
}

/**
 * Builds a MasterLogPayload from raw data for validation
 */
function buildMasterLogPayload(
  events: LogEvent[],
  day: Day,
  projectName: string,
  dives: Dive[]
): MasterLogPayload {
  const sections: MasterLogPayload["sections"] = {
    ops: [],
    dive: [],
    directives: [],
    safety: [],
    risk: [],
  };

  for (const event of events) {
    const renders = (event as any).renders || [];
    for (const render of renders) {
      const section = render.section?.toLowerCase() || "ops";
      const entry = {
        id: event.id,
        eventTime: formatTime(event.eventTime),
        rawText: event.rawText,
        masterLogLine: sanitizeForMasterLog(render.renderText || event.rawText),
        status: render.status || "draft",
      };

      if (section in sections) {
        sections[section as keyof typeof sections].push(entry);
      } else {
        sections.ops.push(entry);
      }
    }

    // If no renders, add to ops
    if (renders.length === 0) {
      sections.ops.push({
        id: event.id,
        eventTime: formatTime(event.eventTime),
        rawText: event.rawText,
        masterLogLine: sanitizeForMasterLog(event.rawText),
        status: "draft",
      });
    }
  }

  return {
    date: day.date,
    shift: day.shift || "1",
    projectName,
    sections,
    dives: dives.map(d => ({
      id: d.id,
      diveNumber: d.diveNumber,
      diverId: d.diverId,
      diverName: undefined,
      lsTime: d.lsTime ? formatTime(d.lsTime) : undefined,
      rbTime: d.rbTime ? formatTime(d.rbTime) : undefined,
      lbTime: d.lbTime ? formatTime(d.lbTime) : undefined,
      rsTime: d.rsTime ? formatTime(d.rsTime) : undefined,
      maxDepthFsw: d.maxDepthFsw ?? undefined,
    })),
  };
}

async function generateRawNotesDoc(events: LogEvent[], day: Day, projectName: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `Raw Supervisor Notes - ${projectName}`,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: `Date: ${day.date} | Shift: ${day.shift || "Day"}`,
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: "CONFIDENTIAL - FOR LEGAL REVIEW ONLY",
            spacing: { after: 400 },
            alignment: AlignmentType.CENTER,
          }),
          ...events.map(
            (event) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[${formatTime(event.eventTime)}] `,
                    bold: true,
                  }),
                  new TextRun({ text: event.rawText }),
                ],
                spacing: { after: 200 },
              })
          ),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

async function generateDailyLogDoc(events: LogEvent[], day: Day, projectName: string): Promise<Buffer> {
  const eventsWithRenders = await Promise.all(
    events.map(async (event) => {
      const renders = await storage.getLogRendersByEvent(event.id);
      return { ...event, renders };
    })
  );

  const project = await storage.getProject(day.projectId);
  const risks = await storage.getRiskItemsByDay(day.id);
  const dives = await storage.getDivesByDay(day.id);

  return generateDailyLogDocPure(eventsWithRenders as any, day, project!, dives, risks);
}

interface DiveWithUser {
  id: string;
  diverId: string | null;
  diveNumber: number;
  diverDisplayName?: string | null;
  lsTime: Date | null;
  rbTime: Date | null;
  lbTime: Date | null;
  rsTime: Date | null;
  maxDepthFsw: number | null;
  taskSummary: string | null;
  breathingGas?: string | null;
  fo2Percent?: number | null;
  tableUsed?: string | null;
  scheduleUsed?: string | null;
  decompRequired?: string | null;
  decompStops?: string | null;
  station?: string | null;
  toolsEquipment?: string | null;
  postDiveStatus?: string | null;
  supervisorInitials?: string | null;
  notes?: string | null;
}

type EventWithRenders = LogEvent & { renders: LogRender[] };

async function generateDailyLogDocPure(
  eventsWithRenders: EventWithRenders[],
  day: Day,
  project: Project,
  dives: Dive[],
  risks: RiskItem[]
): Promise<Buffer> {
  const projectName = project.name;
  const closeout = (day as any).closeoutData as import("@shared/schema").QCCloseoutData | null;

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({ text: "Daily Shift Log", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ spacing: { after: 200 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: projectName, bold: true, size: 28 })] }),
    new Paragraph({ spacing: { after: 100 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "ADCI-Compliant Daily Dive Operations Log", italics: true, size: 20 })] }),
  );

  const headerFields = [
    ["Date (local)", day.date],
    ["Project/Site", `${projectName}${project?.jobsiteName ? ` — ${project.jobsiteName}` : ""}`],
    ["Client/Contract", project?.clientName || "—"],
    ["Shift", day.shift || "Day"],
  ];

  headerFields.forEach(([label, value]) => {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: value || "—" }),
      ],
      spacing: { after: 80 },
    }));
  });

  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  children.push(new Paragraph({ text: "Team & Manning", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
  const diverNames = dives.map(d => d.diverDisplayName || "—").filter((v, i, a) => a.indexOf(v) === i);
  const teamFields = [
    ["Divers", diverNames.join(", ") || "—"],
    ["Total Dives", String(dives.length)],
  ];
  teamFields.forEach(([label, value]) => {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
      spacing: { after: 80 },
    }));
  });

  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  children.push(new Paragraph({ text: "Rolling Event Log", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));

  eventsWithRenders.forEach((event) => {
    const internalRender = event.renders?.find((r: { renderType: string }) => r.renderType === "internal_canvas_line");
    const masterRender = event.renders?.find((r: { renderType: string }) => r.renderType === "master_log_line");
    const displayText = internalRender?.renderText || masterRender?.renderText || event.rawText;
    const categoryTag = event.category ? event.category.toUpperCase().replace("_", " ") : "";
    const stationTag = (event as any).station ? ` [${(event as any).station}]` : "";
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `[${formatTime(event.eventTime)}] `, bold: true }),
        ...(categoryTag ? [new TextRun({ text: `${categoryTag}${stationTag} — `, bold: true, italics: true })] : []),
        new TextRun({ text: displayText }),
      ],
      spacing: { after: 120 },
    }));
  });

  if (dives.length > 0) {
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    children.push(new Paragraph({ text: "Dive Records", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    for (const dive of dives) {
      const diverName = dive.diverDisplayName || "Unknown";
      children.push(new Paragraph({
        children: [new TextRun({ text: `Dive #${dive.diveNumber} — ${diverName}`, bold: true })],
        spacing: { before: 200, after: 80 },
      }));
      const diveFields: [string, string][] = [
        ["Leave Surface", formatTime(dive.lsTime)],
        ["Reach Bottom", formatTime(dive.rbTime)],
        ["Leave Bottom", formatTime(dive.lbTime)],
        ["Reach Surface", formatTime(dive.rsTime)],
        ["Depth (FSW)", String(dive.maxDepthFsw || "-")],
        ["Breathing Gas", (dive as any).breathingGas || "-"],
      ];
      if ((dive as any).breathingGas === "Nitrox" && (dive as any).fo2Percent) {
        diveFields.push(["FO2%", String((dive as any).fo2Percent) + "%"]);
      }
      diveFields.push(
        ["Table Used", (dive as any).tableUsed || "-"],
        ["Schedule", (dive as any).scheduleUsed || "-"],
        ["Decomp Required", (dive as any).decompRequired || "-"],
        ["Task", dive.taskSummary || "-"],
        ["Station", (dive as any).station || "-"],
        ["Post-Dive Status", (dive as any).postDiveStatus || "-"],
      );
      if ((dive as any).notes) {
        diveFields.push(["Notes", (dive as any).notes]);
      }
      diveFields.forEach(([label, value]) => {
        children.push(new Paragraph({
          children: [new TextRun({ text: `  ${label}: `, bold: true }), new TextRun({ text: value })],
          spacing: { after: 40 },
        }));
      });
    }
  }

  if (risks.length > 0) {
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    children.push(new Paragraph({ text: "Risk Register Summary", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    for (const risk of risks) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${risk.riskId}`, bold: true }),
          new TextRun({ text: ` [${risk.status.toUpperCase()}] — ${risk.description}` }),
        ],
        spacing: { after: 60 },
      }));
    }
  }

  if (closeout) {
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    children.push(new Paragraph({ text: "Deviations / Stop-Work / Lessons Learned", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    children.push(new Paragraph({ text: closeout.deviations || "None noted.", spacing: { after: 200 } }));

    children.push(new Paragraph({ text: "End-of-Shift Closeout", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));

    const closeoutFields = [
      ["Scope", closeout.scopeStatus === "complete" ? "Complete" : "Incomplete"],
      ["Documentation", closeout.documentationStatus === "complete" ? "Complete" : "Incomplete"],
      ["Exceptions", closeout.exceptions || "None Noted"],
      ["Outstanding Issues", closeout.outstandingIssues || "None"],
      ["Planned Work Next Shift", closeout.plannedNextShift || "—"],
    ];
    closeoutFields.forEach(([label, value]) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
        spacing: { after: 80 },
      }));
    });

    children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "Items Advised to the Client", bold: true, underline: {} })],
      spacing: { before: 200, after: 80 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "Advised FOR: ", bold: true }), new TextRun({ text: closeout.advisedFor || "None" })],
      spacing: { after: 80 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "Advised AGAINST: ", bold: true }), new TextRun({ text: closeout.advisedAgainst || "None" })],
      spacing: { after: 80 },
    }));

    if (closeout.standingRisks && closeout.standingRisks.length > 0) {
      children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
      children.push(new Paragraph({
        children: [new TextRun({ text: "Standing Risks Referenced", bold: true, underline: {} })],
        spacing: { before: 200, after: 80 },
      }));
      closeout.standingRisks.forEach(r => {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${r.riskId}`, bold: true }),
            new TextRun({ text: ` — Status: ${r.status}` }),
          ],
          spacing: { after: 60 },
        }));
      });
    }

    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "Log Closed By: ", bold: true }), new TextRun({ text: day.closedBy || "—" })],
      spacing: { after: 80 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "Date/Time Closed: ", bold: true }), new TextRun({ text: day.closedAt ? new Date(day.closedAt).toLocaleString() : "—" })],
      spacing: { after: 80 },
    }));
  }

  children.push(new Paragraph({ text: "", spacing: { after: 300 } }));
  children.push(new Paragraph({ text: "Sign-offs", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "Dive Supervisor: ", bold: true }), new TextRun({ text: "______________________" })],
    spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "Client Rep (if required): ", bold: true }), new TextRun({ text: "______________________" })],
    spacing: { after: 200 },
  }));

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function generateMasterLogDocPure(
  eventsWithRenders: EventWithRenders[],
  day: Day,
  projectName: string,
  dives: DiveWithUser[],
  usersByDiverId: Map<string, User>
): Promise<Buffer> {
  const directiveEvents = eventsWithRenders.filter((e) => e.category === "directive" || e.category === "safety");
  const diveOpEvents = eventsWithRenders.filter((e) => e.category === "dive_op");
  const opsEvents = eventsWithRenders.filter((e) => e.category === "ops" || e.category === "general" || (!e.category));
  const safetyEvents = eventsWithRenders.filter((e) => e.category === "safety");

  const children: Paragraph[] = [
    new Paragraph({
      text: `Master Log — ${projectName}`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      text: `Date: ${day.date} | Shift: ${day.shift || "Day"}`,
      spacing: { after: 400 },
    }),
  ];

  children.push(
    new Paragraph({
      text: "Chronological Event Log",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400 },
    })
  );

  const allSorted = [...eventsWithRenders].sort((a, b) =>
    new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
  );

  allSorted.forEach((event) => {
    const masterRender = event.renders?.find((r: { renderType: string }) => r.renderType === "master_log_line");
    const displayText = masterRender?.renderText || event.rawText;
    const categoryLabel = event.category ? event.category.toUpperCase().replace("_", " ") : "OPS";
    const stationTag = (event as any).station ? ` [${(event as any).station}]` : "";
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `[${formatTime(event.eventTime)}] `, bold: true }),
          new TextRun({ text: `${categoryLabel}${stationTag} — `, bold: true, italics: true }),
          new TextRun({ text: displayText }),
        ],
        spacing: { after: 150 },
      })
    );
  });

  if (directiveEvents.length > 0) {
    children.push(
      new Paragraph({
        text: "Client Directives and Changes",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400 },
      })
    );

    directiveEvents.forEach((event) => {
      const masterRender = event.renders?.find((r: { renderType: string }) => r.renderType === "master_log_line");
      const displayText = masterRender?.renderText || event.rawText;
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${formatTime(event.eventTime)}] `, bold: true }),
            new TextRun({ text: displayText }),
          ],
          spacing: { after: 200 },
        })
      );
    });
  }

  const uniqueDiverNames = dives.length > 0
    ? Array.from(new Set(dives.map(d => d.diverDisplayName || "Unknown")))
    : [];
  const maxDepth = Math.max(0, ...dives.map(d => d.maxDepthFsw || 0));

  children.push(
    new Paragraph({
      text: "24-Hour Summary",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400 },
    })
  );
  const summaryParts: string[] = [];
  if (dives.length > 0) {
    summaryParts.push(`${dives.length} dive evolution(s) completed by ${uniqueDiverNames.length} diver(s) (${uniqueDiverNames.join(", ")}).`);
    if (maxDepth > 0) summaryParts.push(`Maximum depth: ${maxDepth} fsw.`);
  } else {
    summaryParts.push("0 dives, 0 divers.");
  }
  if (directiveEvents.length > 0) {
    summaryParts.push(`${directiveEvents.length} client directive(s) received and actioned.`);
  }
  if (safetyEvents.length > 0) {
    summaryParts.push(`${safetyEvents.length} safety event(s) logged.`);
  } else {
    summaryParts.push("No safety incidents reported.");
  }
  summaryParts.push(`Total log entries: ${eventsWithRenders.length}.`);
  children.push(new Paragraph({ text: summaryParts.join(" "), spacing: { after: 200 } }));

  if (dives.length > 0) {
    children.push(
      new Paragraph({
        text: "Dive Operations Summary",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400 },
      })
    );

    for (const dive of dives) {
      const diver = dive.diverId ? usersByDiverId.get(dive.diverId) : undefined;
      const diverName = dive.diverDisplayName || diver?.fullName || "Unknown";
      const initials = diver?.initials
        || diver?.username?.substring(0, 2).toUpperCase()
        || deriveInitialsFromDisplayName(dive.diverDisplayName)
        || "UNK";
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Dive #${dive.diveNumber} — ${diverName} (${initials})`, bold: true }),
          ],
          spacing: { before: 200, after: 80 },
        })
      );
      const diveFields: [string, string][] = [
        ["Leave Surface", formatTime(dive.lsTime)],
        ["Reach Bottom", formatTime(dive.rbTime)],
        ["Leave Bottom", formatTime(dive.lbTime)],
        ["Reach Surface", formatTime(dive.rsTime)],
        ["Depth (FSW)", String(dive.maxDepthFsw || "-")],
        ["Breathing Gas", dive.breathingGas || "-"],
        ["Table Used", dive.tableUsed || "-"],
        ["Decomp Required", dive.decompRequired || "-"],
        ["Task", dive.taskSummary || "-"],
        ["Station", dive.station || "-"],
        ["Post-Dive Status", dive.postDiveStatus || "-"],
      ];
      if (dive.notes) {
        diveFields.push(["Notes", dive.notes]);
      }
      diveFields.forEach(([label, value]) => {
        children.push(new Paragraph({
          children: [new TextRun({ text: `  ${label}: `, bold: true }), new TextRun({ text: value })],
          spacing: { after: 40 },
        }));
      });
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

async function generateMasterLogDoc(
  events: LogEvent[],
  day: Day,
  projectName: string,
  dives: DiveWithUser[]
): Promise<Buffer> {
  const eventsWithRenders = await Promise.all(
    events.map(async (event) => {
      const renders = await storage.getLogRendersByEvent(event.id);
      return { ...event, renders };
    })
  );

  const usersByDiverId = new Map<string, User>();
  const uniqueDiverIds = Array.from(new Set(dives.map(d => d.diverId).filter(Boolean))) as string[];
  for (const diverId of uniqueDiverIds) {
    const user = await storage.getUser(diverId);
    if (user) usersByDiverId.set(diverId, user);
  }

  return generateMasterLogDocPure(eventsWithRenders as any, day, projectName, dives, usersByDiverId);
}

async function generateDiveLogDoc(
  dive: DiveWithUser,
  day: Day,
  projectName: string,
  diverInitials: string
): Promise<Buffer> {
  const diveFields: { label: string; value: string }[] = [
    { label: "Diver", value: dive.diverDisplayName || diverInitials },
    { label: "Dive Number", value: String(dive.diveNumber || 1) },
    { label: "Leave Surface", value: formatTime(dive.lsTime) },
    { label: "Reach Bottom", value: formatTime(dive.rbTime) },
    { label: "Leave Bottom", value: formatTime(dive.lbTime) },
    { label: "Reach Surface", value: formatTime(dive.rsTime) },
    { label: "Depth (FSW)", value: String(dive.maxDepthFsw || "-") },
    { label: "Breathing Gas", value: dive.breathingGas || "-" },
  ];

  if (dive.breathingGas === "Nitrox" && dive.fo2Percent) {
    diveFields.push({ label: "FO2%", value: String(dive.fo2Percent) + "%" });
  }

  diveFields.push(
    { label: "Table Used", value: dive.tableUsed || "-" },
    { label: "Schedule", value: dive.scheduleUsed || "-" },
    { label: "Decomp Required", value: dive.decompRequired || "-" },
  );

  if (dive.decompStops) {
    diveFields.push({ label: "Decomp Stops", value: dive.decompStops });
  }

  diveFields.push(
    { label: "Station", value: dive.station || "-" },
    { label: "Task", value: dive.taskSummary || "-" },
  );

  if (dive.toolsEquipment) {
    diveFields.push({ label: "Tools/Equipment", value: dive.toolsEquipment });
  }

  diveFields.push({ label: "Post-Dive Status", value: dive.postDiveStatus || "-" });

  if (dive.supervisorInitials) {
    diveFields.push({ label: "Supervisor", value: dive.supervisorInitials });
  }

  if (dive.notes) {
    diveFields.push({ label: "Notes", value: dive.notes });
  }

  const children: Paragraph[] = [
    new Paragraph({
      text: `Dive Log - ${diverInitials}`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: "Project: ", bold: true }), new TextRun({ text: projectName })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Date: ", bold: true }), new TextRun({ text: day.date })],
      spacing: { after: 200 },
    }),
  ];

  for (const field of diveFields) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${field.label}: `, bold: true }), new TextRun({ text: field.value })],
      spacing: { after: 100 },
    }));
  }

  children.push(
    new Paragraph({ text: "", spacing: { after: 300 } }),
    new Paragraph({
      children: [new TextRun({ text: "Dive Supervisor: ", bold: true }), new TextRun({ text: "______________________" })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Diver Signature: ", bold: true }), new TextRun({ text: "______________________" })],
      spacing: { after: 200 },
    }),
  );

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function generateRiskRegisterExcel(risks: RiskItem[], day: Day, projectName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Risk Register");

  sheet.columns = [
    { header: "Risk ID", key: "id", width: 20 },
    { header: "Status", key: "status", width: 15 },
    { header: "Category", key: "category", width: 15 },
    { header: "Description", key: "description", width: 50 },
    { header: "Owner", key: "owner", width: 20 },
    { header: "Mitigation", key: "mitigation", width: 40 },
    { header: "Created", key: "created", width: 15 },
  ];

  sheet.getRow(1).font = { bold: true };

  risks.forEach((risk) => {
    sheet.addRow({
      id: risk.riskId,
      status: risk.status,
      category: risk.category || "-",
      description: risk.description,
      owner: risk.owner || "-",
      mitigation: risk.mitigation || "-",
      created: risk.createdAt ? new Date(risk.createdAt).toLocaleDateString() : "-",
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
