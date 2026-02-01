import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  Packer,
} from "docx";
import type { ProjectDivePlanData, DivePlanTemplate } from "@shared/schema";

const DD5_PLACEHOLDERS = [
  "{{PROJECT_NAME}}",
  "{{PROJECT_NUMBER}}",
  "{{CLIENT}}",
  "{{LOCATION}}",
  "{{DIVE_SUPERVISOR}}",
  "{{DIVING_MODE}}",
  "{{MAX_DEPTH_FSW}}",
  "{{ESTIMATED_BOTTOM_TIME}}",
  "{{SCOPE_OF_WORK}}",
  "{{EQUIPMENT_REQUIRED}}",
  "{{PERSONNEL_REQUIRED}}",
  "{{EMERGENCY_PROCEDURES}}",
  "{{COMMUNICATION_PLAN}}",
  "{{DECOMP_PROCEDURE}}",
  "{{SAFETY_CONSIDERATIONS}}",
  "{{ENVIRONMENTAL_CONDITIONS}}",
  "{{ADDITIONAL_NOTES}}",
  "{{REVISION}}",
  "{{DATE}}",
  "{{PREPARED_BY}}",
];

export function getDD5Placeholders(): string[] {
  return DD5_PLACEHOLDERS;
}

function createHeaderSection(data: ProjectDivePlanData, revision: number, preparedBy: string): Paragraph[] {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: "DIVE PLAN",
          bold: true,
          size: 32,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Rev ${revision}`,
          bold: true,
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Project: ", bold: true }),
        new TextRun({ text: data.projectName }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Project Number: ", bold: true }),
        new TextRun({ text: data.projectNumber }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Client: ", bold: true }),
        new TextRun({ text: data.client }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Location: ", bold: true }),
        new TextRun({ text: data.location }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun({ text: today }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Prepared By: ", bold: true }),
        new TextRun({ text: preparedBy }),
      ],
      spacing: { after: 400 },
    }),
  ];
}

function createSectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 24,
      }),
    ],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
  });
}

function createListItems(items: string[]): Paragraph[] {
  return items.map((item, index) => 
    new Paragraph({
      children: [
        new TextRun({ text: `${index + 1}. ${item}` }),
      ],
      spacing: { after: 50 },
    })
  );
}

function createDiveParametersTable(data: ProjectDivePlanData): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Dive Supervisor", bold: true })] })],
            width: { size: 30, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.diveSupervisor })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Diving Mode", bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.divingMode })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Maximum Depth (FSW)", bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(data.maxDepthFsw) })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Estimated Bottom Time", bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: data.estimatedBottomTime })] })],
          }),
        ],
      }),
    ],
  });
}

export async function generateDivePlanDocx(
  data: ProjectDivePlanData,
  revision: number,
  preparedBy: string
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          ...createHeaderSection(data, revision, preparedBy),
          
          createSectionHeading("1. DIVE PARAMETERS"),
          createDiveParametersTable(data),
          
          createSectionHeading("2. SCOPE OF WORK"),
          new Paragraph({
            children: [new TextRun({ text: data.scopeOfWork })],
            spacing: { after: 200 },
          }),
          
          createSectionHeading("3. PERSONNEL REQUIRED"),
          ...createListItems(data.personnelRequired),
          
          createSectionHeading("4. EQUIPMENT REQUIRED"),
          ...createListItems(data.equipmentRequired),
          
          createSectionHeading("5. DECOMPRESSION PROCEDURE"),
          new Paragraph({
            children: [new TextRun({ text: data.decompProcedure })],
            spacing: { after: 200 },
          }),
          
          createSectionHeading("6. EMERGENCY PROCEDURES"),
          new Paragraph({
            children: [new TextRun({ text: data.emergencyProcedures })],
            spacing: { after: 200 },
          }),
          
          createSectionHeading("7. COMMUNICATION PLAN"),
          new Paragraph({
            children: [new TextRun({ text: data.communicationPlan })],
            spacing: { after: 200 },
          }),
          
          createSectionHeading("8. ENVIRONMENTAL CONDITIONS"),
          new Paragraph({
            children: [new TextRun({ text: data.environmentalConditions })],
            spacing: { after: 200 },
          }),
          
          createSectionHeading("9. SAFETY CONSIDERATIONS"),
          ...createListItems(data.safetyConsiderations),
          
          ...(data.additionalNotes ? [
            createSectionHeading("10. ADDITIONAL NOTES"),
            new Paragraph({
              children: [new TextRun({ text: data.additionalNotes })],
              spacing: { after: 200 },
            }),
          ] : []),
          
          new Paragraph({
            children: [],
            spacing: { before: 600 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "This dive plan has been prepared in accordance with U.S. Navy Diving Manual standards and company SOPs.",
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

export async function generateDivePlanFromTemplate(
  template: DivePlanTemplate,
  data: ProjectDivePlanData,
  revision: number,
  preparedBy: string
): Promise<Buffer> {
  return generateDivePlanDocx(data, revision, preparedBy);
}

export function getDefaultPlanData(): Partial<ProjectDivePlanData> {
  return {
    projectName: "",
    projectNumber: "",
    client: "",
    location: "",
    diveSupervisor: "",
    divingMode: "SCUBA",
    maxDepthFsw: 0,
    estimatedBottomTime: "",
    scopeOfWork: "",
    equipmentRequired: [],
    personnelRequired: [],
    emergencyProcedures: "Follow Emergency Action Plan (EAP) on file. Contact Dive Supervisor immediately for any emergency.",
    communicationPlan: "",
    decompProcedure: "All dives to be conducted within no-decompression limits per U.S. Navy Dive Tables. No in-water decompression planned.",
    safetyConsiderations: [],
    environmentalConditions: "",
    additionalNotes: "",
  };
}
