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
import type { Day, LogEvent, RiskItem, Dive } from "@shared/schema";
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
    const diver = await storage.getUser(dive.diverId);
    const initials = diver?.initials || diver?.username?.substring(0, 2).toUpperCase() || "UNK";
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

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `Daily Operations Log - ${projectName}`,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: `Date: ${day.date} | Shift: ${day.shift || "Day"}`,
            spacing: { after: 400 },
          }),
          ...eventsWithRenders.map((event) => {
            const internalRender = event.renders?.find((r: { renderType: string }) => r.renderType === "internal_canvas_line");
            const displayText = internalRender?.renderText || event.rawText;
            return new Paragraph({
              children: [
                new TextRun({
                  text: `[${formatTime(event.eventTime)}] `,
                  bold: true,
                }),
                new TextRun({ text: displayText }),
              ],
              spacing: { after: 200 },
            });
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

interface DiveWithUser {
  id: string;
  diverId: string;
  diveNumber: number;
  lsTime: Date | null;
  rbTime: Date | null;
  lbTime: Date | null;
  rsTime: Date | null;
  maxDepthFsw: number | null;
  taskSummary: string | null;
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

  const directiveEvents = eventsWithRenders.filter((e) => e.category === "directive" || e.category === "safety");
  const productionEvents = eventsWithRenders.filter((e) => e.category !== "directive" && e.category !== "safety");

  const children: Paragraph[] = [
    new Paragraph({
      text: `Master Log - ${projectName}`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      text: `Date: ${day.date} | Shift: ${day.shift || "Day"}`,
      spacing: { after: 400 },
    }),
  ];

  if (directiveEvents.length > 0) {
    children.push(
      new Paragraph({
        text: "JV/OICC (Client) Directives and Changes",
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
            new TextRun({
              text: `[${formatTime(event.eventTime)}] `,
              bold: true,
            }),
            new TextRun({ text: displayText }),
          ],
          spacing: { after: 200 },
        })
      );
    });
  }

  children.push(
    new Paragraph({
      text: "Station Log (Non-Timestamped)",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400 },
    })
  );

  productionEvents.forEach((event) => {
    const masterRender = event.renders?.find((r: { renderType: string }) => r.renderType === "master_log_line");
    const displayText = masterRender?.renderText || event.rawText;
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `• ${displayText}` })],
        spacing: { after: 100 },
      })
    );
  });

  if (dives.length > 0) {
    children.push(
      new Paragraph({
        text: "Dive Operations Summary",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400 },
      })
    );

    for (const dive of dives) {
      const diver = await storage.getUser(dive.diverId);
      const initials = diver?.initials || diver?.username?.substring(0, 2).toUpperCase() || "UNK";
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${initials}: `,
              bold: true,
            }),
            new TextRun({
              text: `L/S ${formatTime(dive.lsTime)} | R/B ${formatTime(dive.rbTime)} | L/B ${formatTime(dive.lbTime)} | R/S ${formatTime(dive.rsTime)} | Depth: ${dive.maxDepthFsw || "-"} FSW | Task: ${dive.taskSummary || "-"}`,
            }),
          ],
          spacing: { after: 100 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

async function generateDiveLogDoc(
  dive: DiveWithUser,
  day: Day,
  projectName: string,
  diverInitials: string
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `Dive Log - ${diverInitials}`,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: `Project: ${projectName}`,
            spacing: { after: 100 },
          }),
          new Paragraph({
            text: `Date: ${day.date}`,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Diver: ", bold: true }),
              new TextRun({ text: diverInitials }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Dive Number: ", bold: true }),
              new TextRun({ text: String(dive.diveNumber || 1) }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Leave Surface: ", bold: true }),
              new TextRun({ text: formatTime(dive.lsTime) }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Reach Bottom: ", bold: true }),
              new TextRun({ text: formatTime(dive.rbTime) }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Leave Bottom: ", bold: true }),
              new TextRun({ text: formatTime(dive.lbTime) }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Reach Surface: ", bold: true }),
              new TextRun({ text: formatTime(dive.rsTime) }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Depth (FSW): ", bold: true }),
              new TextRun({ text: String(dive.maxDepthFsw || "-") }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Task: ", bold: true }),
              new TextRun({ text: dive.taskSummary || "-" }),
            ],
            spacing: { after: 100 },
          }),
        ],
      },
    ],
  });

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
