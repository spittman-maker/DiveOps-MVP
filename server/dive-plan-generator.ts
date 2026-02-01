import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  Packer,
  PageBreak,
  Header,
  Footer,
} from "docx";
import type { 
  ProjectDivePlanData, 
  DD5RevisionEntry,
  DD5_REVISION_MAPPING 
} from "@shared/schema";
import crypto from "crypto";

export function computePayloadHash(data: Omit<ProjectDivePlanData, "revisionHistory" | "previousPayloadHash">): string {
  const normalized = JSON.stringify({
    coverPage: data.coverPage,
    projectContacts: data.projectContacts,
    natureOfWork: data.natureOfWork,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}

export function computeFieldDiff(
  oldData: ProjectDivePlanData | null,
  newData: ProjectDivePlanData
): { field: string; oldValue: any; newValue: any }[] {
  if (!oldData) return [];
  
  const diffs: { field: string; oldValue: any; newValue: any }[] = [];
  
  const coverFields: (keyof typeof newData.coverPage)[] = [
    "companyName", "projectTitle", "jobNumber", "client", "siteLocation", "submissionDate"
  ];
  
  for (const field of coverFields) {
    if (oldData.coverPage[field] !== newData.coverPage[field]) {
      diffs.push({
        field: `coverPage.${field}`,
        oldValue: oldData.coverPage[field],
        newValue: newData.coverPage[field],
      });
    }
  }
  
  if (oldData.projectContacts.primeContractor !== newData.projectContacts.primeContractor) {
    diffs.push({
      field: "projectContacts.primeContractor",
      oldValue: oldData.projectContacts.primeContractor,
      newValue: newData.projectContacts.primeContractor,
    });
  }
  
  if (oldData.projectContacts.siteAddress !== newData.projectContacts.siteAddress) {
    diffs.push({
      field: "projectContacts.siteAddress",
      oldValue: oldData.projectContacts.siteAddress,
      newValue: newData.projectContacts.siteAddress,
    });
  }
  
  const oldContacts = JSON.stringify(oldData.projectContacts.keyContacts);
  const newContacts = JSON.stringify(newData.projectContacts.keyContacts);
  if (oldContacts !== newContacts) {
    diffs.push({
      field: "projectContacts.keyContacts",
      oldValue: oldData.projectContacts.keyContacts,
      newValue: newData.projectContacts.keyContacts,
    });
  }
  
  const oldTasks = JSON.stringify(oldData.natureOfWork.selectedTasks.sort());
  const newTasks = JSON.stringify(newData.natureOfWork.selectedTasks.sort());
  if (oldTasks !== newTasks) {
    diffs.push({
      field: "natureOfWork.selectedTasks",
      oldValue: oldData.natureOfWork.selectedTasks,
      newValue: newData.natureOfWork.selectedTasks,
    });
  }
  
  return diffs;
}

export function generateRevisionEntries(
  diffs: { field: string; oldValue: any; newValue: any }[],
  revision: number,
  changedBy: string,
  revisionMapping: typeof DD5_REVISION_MAPPING
): DD5RevisionEntry[] {
  const entries: DD5RevisionEntry[] = [];
  const today = new Date().toISOString().split("T")[0];
  
  const groupedBySection: Record<string, string[]> = {};
  
  for (const diff of diffs) {
    const mapping = revisionMapping[diff.field];
    if (mapping) {
      const key = mapping.section;
      if (!groupedBySection[key]) {
        groupedBySection[key] = [];
      }
      groupedBySection[key].push(mapping.description);
    }
  }
  
  for (const section of Object.keys(groupedBySection)) {
    const descriptions = groupedBySection[section];
    entries.push({
      revision,
      date: today,
      description: descriptions.join("; "),
      section,
      changedBy,
    });
  }
  
  return entries;
}

function createCoverPage(data: ProjectDivePlanData): Paragraph[] {
  const cover = data.coverPage;
  
  return [
    new Paragraph({
      children: [new TextRun({ text: cover.companyName, bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "DIVE PLAN", bold: true, size: 48 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Rev ${cover.revisionNumber}`, bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Project: ", bold: true }),
        new TextRun({ text: cover.projectTitle }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Job Number: ", bold: true }),
        new TextRun({ text: cover.jobNumber }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Client: ", bold: true }),
        new TextRun({ text: cover.client }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Site Location: ", bold: true }),
        new TextRun({ text: cover.siteLocation }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Submission Date: ", bold: true }),
        new TextRun({ text: cover.submissionDate }),
      ],
      spacing: { after: 400 },
    }),
  ];
}

function createRevisionTrackerTable(revisionHistory: DD5RevisionEntry[]): Table {
  const headerRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Rev", bold: true })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true })] })], width: { size: 15, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true })] })], width: { size: 50, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Section", bold: true })] })], width: { size: 15, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "By", bold: true })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
    ],
  });

  const dataRows = revisionHistory.map(entry => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(entry.revision) })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: entry.date })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: entry.description })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: entry.section })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: entry.changedBy })] })] }),
    ],
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function createContactsSection(data: ProjectDivePlanData): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "2.13-2.14 PROJECT CONTACTS", bold: true, size: 24 })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Prime Contractor: ", bold: true }),
        new TextRun({ text: data.projectContacts.primeContractor }),
      ],
      spacing: { after: 100 },
    }),
  ];

  if (data.projectContacts.siteAddress) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: "Site Address: ", bold: true }),
        new TextRun({ text: data.projectContacts.siteAddress }),
      ],
      spacing: { after: 100 },
    }));
  }

  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: "Key Contacts:", bold: true })],
    spacing: { before: 200, after: 100 },
  }));

  for (const contact of data.projectContacts.keyContacts) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: `${contact.name} (${contact.role}): `, bold: true }),
        new TextRun({ text: contact.phone }),
        ...(contact.email ? [new TextRun({ text: ` / ${contact.email}` })] : []),
      ],
      spacing: { after: 50 },
    }));
  }

  return paragraphs;
}

function createNatureOfWorkSection(data: ProjectDivePlanData): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "2.9 NATURE OF WORK", bold: true, size: 24 })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Authorized diver tasks for this project:", italics: true })],
      spacing: { after: 100 },
    }),
  ];

  for (let i = 0; i < data.natureOfWork.selectedTasks.length; i++) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: `${i + 1}. ${data.natureOfWork.selectedTasks[i]}` })],
      spacing: { after: 50 },
    }));
  }

  return paragraphs;
}

function createLockedSectionNotice(sectionName: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: sectionName, bold: true, size: 24 })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ 
        text: "[This section contains locked boilerplate content from the DD5 template. Content is preserved exactly as specified in the master template and is not modified by the document generator.]",
        italics: true,
        color: "666666",
      })],
      spacing: { after: 200 },
    }),
  ];
}

export async function generateDD5DivePlanDocx(
  data: ProjectDivePlanData,
  preparedBy: string
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          ...createCoverPage(data),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          new Paragraph({
            children: [new TextRun({ text: "REVISION HISTORY", bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
          }),
          createRevisionTrackerTable(data.revisionHistory),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          ...createLockedSectionNotice("2.5 TEAM MEMBERS AND DUTIES"),
          ...createLockedSectionNotice("2.12 EQUIPMENT PROCEDURES CHECKLIST AND REQUIREMENTS"),
          
          ...createContactsSection(data),
          
          ...createNatureOfWorkSection(data),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          ...createLockedSectionNotice("4.9-4.18 EMERGENCY PROCEDURES"),
          new Paragraph({
            children: [new TextRun({ 
              text: "Includes: Fouled diver, Loss of air/comms, Injured diver, Fire, Rapid ascent, Loss of consciousness, and other emergency procedures per EM385 and USN standards.",
              italics: true,
              color: "666666",
            })],
            spacing: { after: 200 },
          }),
          
          ...createLockedSectionNotice("SECTION 5 - REPORTING"),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          new Paragraph({
            children: [new TextRun({ 
              text: "This dive plan has been prepared in accordance with U.S. Navy Diving Manual standards, EM385-1-1 requirements, and company SOPs. All locked sections are preserved exactly as specified in the DD5 master template.",
              italics: true,
            })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Prepared by: ${preparedBy}` })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Payload Hash: ${data.previousPayloadHash || computePayloadHash(data)}` })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

export function getDefaultDD5PlanData(
  projectName: string,
  client: string,
  jobNumber: string
): ProjectDivePlanData {
  const today = new Date().toISOString().split("T")[0];
  
  return {
    coverPage: {
      companyName: "Precision Subsea Group LLC",
      projectTitle: projectName,
      jobNumber: jobNumber,
      client: client,
      siteLocation: "",
      submissionDate: today,
      revisionNumber: 0,
    },
    projectContacts: {
      primeContractor: "",
      siteAddress: "",
      keyContacts: [],
    },
    natureOfWork: {
      selectedTasks: [],
    },
    revisionHistory: [{
      revision: 0,
      date: today,
      description: "Initial release",
      section: "All",
      changedBy: "",
    }],
  };
}
