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
  ShadingType,
} from "docx";
import type {
  ProjectDivePlanData,
  DD5RevisionEntry,
  DD5_REVISION_MAPPING
} from "@shared/schema";
import crypto from "crypto";
import { validateNoBoilerplateStubTextOrThrow } from "./logging/log_pipeline_guard";

// ─── Utility helpers ──────────────────────────────────────────────────────────

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
      diffs.push({ field: `coverPage.${field}`, oldValue: oldData.coverPage[field], newValue: newData.coverPage[field] });
    }
  }
  if (oldData.projectContacts.primeContractor !== newData.projectContacts.primeContractor) {
    diffs.push({ field: "projectContacts.primeContractor", oldValue: oldData.projectContacts.primeContractor, newValue: newData.projectContacts.primeContractor });
  }
  if (oldData.projectContacts.siteAddress !== newData.projectContacts.siteAddress) {
    diffs.push({ field: "projectContacts.siteAddress", oldValue: oldData.projectContacts.siteAddress, newValue: newData.projectContacts.siteAddress });
  }
  const oldContacts = JSON.stringify(oldData.projectContacts.keyContacts);
  const newContacts = JSON.stringify(newData.projectContacts.keyContacts);
  if (oldContacts !== newContacts) {
    diffs.push({ field: "projectContacts.keyContacts", oldValue: oldData.projectContacts.keyContacts, newValue: newData.projectContacts.keyContacts });
  }
  const oldTasks = JSON.stringify(oldData.natureOfWork.selectedTasks.sort());
  const newTasks = JSON.stringify(newData.natureOfWork.selectedTasks.sort());
  if (oldTasks !== newTasks) {
    diffs.push({ field: "natureOfWork.selectedTasks", oldValue: oldData.natureOfWork.selectedTasks, newValue: newData.natureOfWork.selectedTasks });
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
      if (!groupedBySection[key]) groupedBySection[key] = [];
      groupedBySection[key].push(mapping.description);
    }
  }
  for (const section of Object.keys(groupedBySection)) {
    entries.push({
      revision,
      date: today,
      description: groupedBySection[section].join("; "),
      section,
      changedBy,
    });
  }
  return entries;
}

// ─── Paragraph builders ───────────────────────────────────────────────────────

function h1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, font: "Times New Roman" })],
    spacing: { before: 400, after: 200 },
    heading: HeadingLevel.HEADING_1,
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: "Times New Roman" })],
    spacing: { before: 300, after: 100 },
    heading: HeadingLevel.HEADING_2,
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, size: 22, font: "Times New Roman" })],
    spacing: { before: 200, after: 80 },
    heading: HeadingLevel.HEADING_3,
  });
}

function body(text: string, indent = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Times New Roman" })],
    spacing: { after: 120 },
    indent: indent ? { left: 720 } : undefined,
  });
}

function boldLine(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: label, bold: true, size: 22, font: "Times New Roman" }),
      new TextRun({ text: value, size: 22, font: "Times New Roman" }),
    ],
    spacing: { after: 100 },
  });
}

function bullet(text: string, indent = 720): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `\u25BA  ${text}`, size: 22, font: "Times New Roman" })],
    spacing: { after: 80 },
    indent: { left: indent },
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 200 } });
}

// ─── Cover Page ───────────────────────────────────────────────────────────────

function createCoverPage(data: ProjectDivePlanData): Paragraph[] {
  const cp = data.coverPage;
  return [
    spacer(), spacer(),
    new Paragraph({
      children: [new TextRun({ text: cp.companyName || "Precision Subsea Group LLC", bold: true, size: 36, font: "Times New Roman" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: cp.projectTitle || "Dive Operations Safety Plan", bold: true, size: 48, font: "Times New Roman" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Rev. ${cp.revisionNumber ?? 0}`, bold: true, size: 28, font: "Times New Roman" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    spacer(), spacer(),
    boldLine("Project: ", cp.projectTitle || ""),
    boldLine("Job Number: ", cp.jobNumber || ""),
    boldLine("Client: ", cp.client || ""),
    boldLine("Site Location: ", cp.siteLocation || ""),
    boldLine("Date: ", cp.submissionDate || new Date().toISOString().split("T")[0]),
    spacer(), spacer(),
    new Paragraph({
      children: [new TextRun({ text: "Prepared by:", bold: true, size: 22, font: "Times New Roman" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: cp.companyName || "Precision Subsea Group LLC", size: 22, font: "Times New Roman" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
  ];
}

// ─── Revision History Table ───────────────────────────────────────────────────

function createRevisionTable(revisionHistory: DD5RevisionEntry[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        shading: { type: ShadingType.SOLID, color: "FFFF00" },
        children: [new Paragraph({ children: [new TextRun({ text: "REV", bold: true, size: 20, font: "Times New Roman" })] })],
        width: { size: 8, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        shading: { type: ShadingType.SOLID, color: "FFFF00" },
        children: [new Paragraph({ children: [new TextRun({ text: "DATE", bold: true, size: 20, font: "Times New Roman" })] })],
        width: { size: 15, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        shading: { type: ShadingType.SOLID, color: "FFFF00" },
        children: [new Paragraph({ children: [new TextRun({ text: "DESCRIPTION", bold: true, size: 20, font: "Times New Roman" })] })],
        width: { size: 57, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        shading: { type: ShadingType.SOLID, color: "FFFF00" },
        children: [new Paragraph({ children: [new TextRun({ text: "SECTION", bold: true, size: 20, font: "Times New Roman" })] })],
        width: { size: 12, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        shading: { type: ShadingType.SOLID, color: "FFFF00" },
        children: [new Paragraph({ children: [new TextRun({ text: "BY", bold: true, size: 20, font: "Times New Roman" })] })],
        width: { size: 8, type: WidthType.PERCENTAGE },
      }),
    ],
  });

  const dataRows = revisionHistory.map(e => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(e.revision), size: 20, font: "Times New Roman" })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.date, size: 20, font: "Times New Roman" })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.description, size: 20, font: "Times New Roman" })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.section, size: 20, font: "Times New Roman" })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: e.changedBy || "", size: 20, font: "Times New Roman" })] })] }),
    ],
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ─── Section 1: Introduction ──────────────────────────────────────────────────

function createSection1(data: ProjectDivePlanData): Paragraph[] {
  const cp = data.coverPage;
  return [
    h1("1.  INTRODUCTION"),
    body(`${cp.companyName || "Precision Subsea Group LLC"} (the "Company") has prepared this Dive Operations Safety Plan in accordance with the requirements of the U.S. Army Corps of Engineers Safety and Health Requirements Manual (EM 385-1-1), the U.S. Navy Diving Manual (Rev 7), and applicable OSHA standards for commercial diving operations (29 CFR 1910 Subpart T).`),
    body(`This plan governs all diving operations to be performed under Contract/Purchase Order for the project identified on the cover page. All dive team personnel are required to read, understand, and comply with the procedures set forth herein prior to commencing any underwater work.`),
    body(`This plan shall be reviewed and updated as necessary to reflect changes in scope, personnel, equipment, or site conditions. Any revision must be approved by the Diving Superintendent prior to implementation.`),
    spacer(),
  ];
}

// ─── Section 2: Dive Operations Plan ─────────────────────────────────────────

function createSection2(data: ProjectDivePlanData, preparedBy: string, effectiveContacts: any[], effectiveTasks: string[]): Paragraph[] {
  const cp = data.coverPage;
  const pc = data.projectContacts;
  const paragraphs: Paragraph[] = [];

  paragraphs.push(h1("2.  DIVE OPERATIONS PLAN"));
  paragraphs.push(body("All personnel assigned to this project shall adhere to this Dive Operations Plan. Any deviation from this plan must be approved in writing by the Diving Superintendent and the client's Designated Representative."));
  paragraphs.push(body("Prior to commencing diving operations each day, the Dive Supervisor shall conduct a pre-dive conference with all dive team members to review the dive plan, hazards, emergency procedures, and any changes to conditions."));
  paragraphs.push(spacer());

  // 2.1 Prime Contractor
  paragraphs.push(h2(`2.1  Prime Contractor: ${pc.primeContractor || "TBD"}`));
  paragraphs.push(spacer());

  // 2.2 Contract Number
  paragraphs.push(h2(`2.2  Contract/Purchase Order Number / Job Number: ${cp.jobNumber || "TBD"}`));
  paragraphs.push(spacer());

  // 2.3 Date of Submission
  paragraphs.push(h2(`2.3  Date of Submission: ${cp.submissionDate || new Date().toISOString().split("T")[0]}`));
  paragraphs.push(spacer());

  // 2.4 Personnel Preparing Plan
  paragraphs.push(h2(`2.4  Personnel Preparing Plan`));
  paragraphs.push(body(`This plan was prepared by: ${preparedBy}`));
  paragraphs.push(spacer());

  // 2.5 Team Members and Duties (locked)
  paragraphs.push(h2("2.5  Team Members and Duties"));
  paragraphs.push(body("The following personnel have been assigned to this project. All dive team members shall meet the qualification requirements of EM 385-1-1 and the U.S. Navy Diving Manual."));
  paragraphs.push(spacer());

  // Key contacts from DB
  if (effectiveContacts.length > 0) {
    for (const c of effectiveContacts) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `${c.role}: `, bold: true, size: 22, font: "Times New Roman" }),
          new TextRun({ text: `${c.name}${c.phone ? `  (${c.phone})` : ""}${c.email ? `  /  ${c.email}` : ""}`, size: 22, font: "Times New Roman" }),
        ],
        spacing: { after: 80 },
      }));
    }
    paragraphs.push(spacer());
  }

  paragraphs.push(h3("2.5.1  Dive Supervisor"));
  paragraphs.push(body("The Dive Supervisor is responsible for the overall safety and conduct of each dive. The Dive Supervisor shall:", true));
  paragraphs.push(bullet("Hold a current ADCI/IMCA Surface Supply Diver Supervisor certification or equivalent"));
  paragraphs.push(bullet("Conduct pre-dive briefings and post-dive debriefs with all dive team members"));
  paragraphs.push(bullet("Ensure all equipment is inspected and operational prior to each dive"));
  paragraphs.push(bullet("Maintain the dive log and all required documentation"));
  paragraphs.push(bullet("Have authority to halt operations at any time for safety concerns"));
  paragraphs.push(bullet("Ensure compliance with all applicable regulations and this plan"));
  paragraphs.push(spacer());

  paragraphs.push(h3("2.5.2  Divers"));
  paragraphs.push(body("The designated divers employed by the Company and/or subcontracted on this project shall:", true));
  paragraphs.push(bullet("Be familiar with the work being performed for this project"));
  paragraphs.push(bullet("Be trained and experienced in Surface Supplied Diving and NITROX procedures and techniques, especially as applied to the accomplishment of the tasks for this project"));
  paragraphs.push(bullet("Be trained and experienced in emergency procedures"));
  paragraphs.push(bullet("Perform such tasks underwater as may be required and as described by the person-in-charge"));
  paragraphs.push(bullet("Ensure diver-worn equipment is properly maintained, complete and ready for use"));
  paragraphs.push(bullet("Assist in the maintenance and repair of all diving equipment as required"));
  paragraphs.push(bullet("Immediately obey all commands or signals to return to the surface"));
  paragraphs.push(bullet("Act as a standby diver as required"));
  paragraphs.push(bullet("Follow safe diving procedures and point out any questionable items to the person-in-charge"));
  paragraphs.push(bullet("Observe the rules established for flying after diving"));
  paragraphs.push(bullet("Report all symptoms of any physical problems immediately"));
  paragraphs.push(spacer());

  paragraphs.push(h3("2.5.3  Standby Divers"));
  paragraphs.push(body("The standby diver must be a fully qualified diver assigned for back-up duties or to provide emergency assistance. The standby diver receives the same briefings and instructions as the working diver, monitors the progress of the dive, and is fully prepared to respond if called upon for assistance. He must be ready to enter the water immediately.", true));
  paragraphs.push(spacer());

  paragraphs.push(h3("2.5.4  Tenders"));
  paragraphs.push(body("The tender must be a fully qualified diver. He receives the same briefings and instructions as the rest of the dive team and must understand the dive objectives and the work to be performed. During the dive he attends to the diver's hose, equipment, and monitors the progress of the dive via the dive radio. He must be familiar with the emergency procedures and be fully prepared to respond if called upon for assistance.", true));
  paragraphs.push(spacer());

  paragraphs.push(h3("2.5.5  Chamber Operator / Chamber Tender"));
  paragraphs.push(body("The chamber operator and tender must be a fully qualified diver with an understanding of hyperbaric chamber operations, manifolds and gas supplies, signs of DCS (decompression sickness) including AGE (arterial gas embolism) and O2 toxicity, appropriate treatment tables in the USN diving manual for dive related injury requiring hyperbaric treatment specific to the gas mixture used, as well as emergency procedures for tending an injured diver inside the chamber. The chamber operator and tender will be designated before each dive, and the dive work will not commence until the chamber is fully prepared and equipped to handle a dive emergency. A functioning mobile phone and VHF radio will be on standby for contacting emergency support.", true));
  paragraphs.push(spacer());

  // 2.6 Date, Time and Location
  paragraphs.push(h2("2.6  Date, Time and Location of Dive Operations"));
  paragraphs.push(body(`Site Location: ${cp.siteLocation || pc.siteAddress || "TBD"}`));
  if (data.siteConditions) {
    paragraphs.push(body(`Site Conditions: ${data.siteConditions}`));
  }
  paragraphs.push(spacer());

  // 2.7 Diving Mode
  paragraphs.push(h2("2.7  Diving Mode"));
  paragraphs.push(body(data.divingMode || "Surface Supplied Air (SSA) diving will be utilized for this project. There will be no SCUBA diving included in this plan. Surface supplied diving will be utilized for all underwater work."));
  paragraphs.push(spacer());

  // 2.8 Diving Equipment
  paragraphs.push(h2("2.8  Diving Equipment"));
  paragraphs.push(h3("2.8.1  Surface Supplied Air Diving Equipment"));
  paragraphs.push(body("The dive spread will be equipped with a High Pressure (HP) air bank, manifold rack, diver radios, first aid kit, emergency O2 kit, man-rated recovery winch or recovery method, stokes litter, and entry/exit ladders. A low-pressure (LP) breathing air or LP NITROX compressor will be onsite for the duration of the dive work."));
  if (data.equipmentNotes) {
    paragraphs.push(body(`Project-specific equipment: ${data.equipmentNotes}`));
  }
  paragraphs.push(spacer());

  // 2.9 Nature of Work
  paragraphs.push(h2("2.9  Nature of Work to be Performed by the Divers"));
  if (data.scopeOfWork) {
    paragraphs.push(body(data.scopeOfWork));
  }
  if (effectiveTasks.length > 0) {
    paragraphs.push(body("Authorized diver tasks for this project:"));
    effectiveTasks.forEach((task, i) => {
      paragraphs.push(bullet(`${i + 1}. ${task}`));
    });
  }
  paragraphs.push(spacer());

  // 2.10 Surface and Underwater Conditions
  paragraphs.push(h2("2.10  Surface and Underwater Conditions"));
  paragraphs.push(body(data.siteConditions || "Site conditions will be assessed prior to each dive. The Dive Supervisor will evaluate current, visibility, water temperature, bottom conditions, and marine traffic before authorizing any dive."));
  paragraphs.push(spacer());

  // 2.11 Maximum Depth and Bottom Times
  paragraphs.push(h2("2.11  Maximum Depth and Bottom Times"));
  paragraphs.push(body(`Maximum planned depth: ${data.maxDepth || "TBD"}`));
  paragraphs.push(body(`Estimated dive duration: ${data.estimatedDuration || "TBD"}`));
  paragraphs.push(body(data.decompressionSchedules || "All dives will be planned within no-decompression limits using the U.S. Navy Standard Air Decompression Tables (USN Dive Manual, Rev 7). Decompression schedules will be determined by the Dive Supervisor prior to each dive based on actual depth and planned bottom time."));
  paragraphs.push(spacer());

  // 2.12 Equipment Procedures Checklist (locked)
  paragraphs.push(h2("2.12  Equipment Procedures Checklist and Requirements"));
  paragraphs.push(h3("2.12.1  Cylinders"));
  paragraphs.push(body("All breathing gas cylinders shall be inspected, hydrostatically tested, and visually inspected in accordance with DOT regulations and manufacturer specifications. Cylinder markings shall be legible and current. Cylinders shall be secured against tipping or rolling at all times.", true));
  paragraphs.push(spacer());
  paragraphs.push(h3("2.12.2  Final Preparations"));
  paragraphs.push(body("Prior to each dive, the Dive Supervisor shall conduct a complete equipment check including: umbilical integrity, helmet/mask seal, communications test, breathing gas analysis, standby diver readiness, and chamber operational status. A written pre-dive checklist shall be completed and signed.", true));
  paragraphs.push(spacer());
  paragraphs.push(h3("2.12.3  Emergency Equipment"));
  paragraphs.push(body("The following emergency equipment shall be present and operational at the dive site at all times: hyperbaric recompression chamber (or documented plan for access to nearest chamber), emergency O2 system, first aid kit, AED (if available), VHF radio, and emergency contact list posted at the dive station.", true));
  paragraphs.push(spacer());

  // 2.13 Project Coordination
  paragraphs.push(h2("2.13  Project Coordination"));
  paragraphs.push(body(`Prime Contractor: ${pc.primeContractor || "TBD"}`));
  if (pc.siteAddress) {
    paragraphs.push(body(`Site Address: ${pc.siteAddress}`));
  }
  paragraphs.push(spacer());

  // 2.14 Means of Direct Communication
  paragraphs.push(h2("2.14  Means of Direct Communication"));
  paragraphs.push(body("Primary communication between the surface and the diver shall be by hardwire through the umbilical. Secondary communication shall be by underwater hand signals per USN Diving Manual standards. VHF radio shall be maintained on the surface for communication with the client, emergency services, and vessel traffic."));
  if (effectiveContacts.length > 0) {
    paragraphs.push(spacer());
    paragraphs.push(body("Key Project Contacts:"));
    for (const c of effectiveContacts) {
      paragraphs.push(boldLine(`${c.role}: `, `${c.name}${c.phone ? `  —  ${c.phone}` : ""}${c.email ? `  /  ${c.email}` : ""}`));
    }
  }
  paragraphs.push(spacer());

  return paragraphs;
}

// ─── Section 3: Activity Hazard Analysis ─────────────────────────────────────

function createSection3(data: ProjectDivePlanData): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  paragraphs.push(h1("3.  ACTIVITY HAZARD ANALYSIS"));
  paragraphs.push(body("An Activity Hazard Analysis (AHA) has been prepared for this project in accordance with EM 385-1-1 requirements. The AHA identifies potential hazards associated with each work task and specifies the controls to be implemented to eliminate or reduce risk to an acceptable level."));
  paragraphs.push(spacer());
  if (data.hazardNotes) {
    paragraphs.push(body("Project-specific hazards and mitigations:"));
    paragraphs.push(body(data.hazardNotes));
    paragraphs.push(spacer());
  }
  paragraphs.push(body("General diving hazards addressed in the AHA include: drowning, decompression sickness (DCS), arterial gas embolism (AGE), oxygen toxicity, nitrogen narcosis, entanglement, entrapment, marine life hazards, boat traffic, poor visibility, strong currents, and equipment failure."));
  paragraphs.push(body("The AHA shall be reviewed and updated as conditions change. All dive team members shall review and sign the AHA prior to commencing operations."));
  paragraphs.push(spacer());
  return paragraphs;
}

// ─── Section 4: Emergency Management Plan ────────────────────────────────────

function createSection4(data: ProjectDivePlanData): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  paragraphs.push(h1("4.  EMERGENCY MANAGEMENT PLAN"));
  paragraphs.push(body("The following emergency procedures shall be posted at the dive station and reviewed with all dive team members prior to commencing operations. In the event of any emergency, the Dive Supervisor has authority to halt all operations and direct emergency response."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.1  Nearest Operational Decompression Chamber"));
  paragraphs.push(body("The nearest operational recompression/hyperbaric chamber shall be identified prior to commencing dive operations. Chamber location, contact information, and estimated transport time shall be documented on the pre-dive checklist. DAN Emergency Hotline: +1-919-684-9111. NEDU: 850-230-3100."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.2  Nearest Accessible Hospitals"));
  paragraphs.push(body("The nearest hospital with emergency services shall be identified prior to commencing dive operations. Hospital name, address, phone number, and estimated transport time shall be posted at the dive station."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.3  Nearest USCG Rescue Coordination Center"));
  paragraphs.push(body("USCG National Response Center: 1-800-424-8802. Local USCG Sector contact shall be identified and posted at the dive station prior to operations."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.4  Local Poison Control Center"));
  paragraphs.push(body("Poison Control Center: 1-800-222-1222 (24 hours)"));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.5  Emergency Victim Transport Plan"));
  paragraphs.push(body("In the event of a diving casualty, the following transport sequence shall be followed: (1) Remove diver from water and administer first aid/O2 as required. (2) Contact emergency services (911) and DAN (+1-919-684-9111). (3) Transport to nearest hyperbaric facility via fastest available means (ground ambulance, helicopter, or vessel as appropriate). (4) Notify Project Manager and client representative immediately."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.6  Recover Injured Diver Plan"));
  paragraphs.push(body("If a diver is injured underwater: (1) Standby diver enters water immediately to assist. (2) Diver is brought to surface under controlled ascent if possible. (3) Diver is assisted aboard and placed in recovery position. (4) Administer 100% O2 via demand valve. (5) Monitor vital signs and maintain airway. (6) Contact emergency services and DAN. (7) Do not leave diver unattended."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.7  Emergency Victim Plan"));
  paragraphs.push(body("All dive team members shall be trained in CPR and first aid. Emergency O2 equipment shall be immediately accessible at the dive station. The Dive Supervisor shall designate a first aid/O2 responder prior to each dive. Written emergency procedures shall be posted at the dive station."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.8  Phone Numbers / Emergency Communications"));
  paragraphs.push(body("Emergency phone numbers shall be posted at the dive station and shall include: local emergency services (911), DAN Emergency (+1-919-684-9111), NEDU (850-230-3100), nearest hospital, nearest hyperbaric chamber, USCG Sector, Project Manager, and client representative."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.9  Procedure to Deal with Entrapped or Fouled Diver"));
  paragraphs.push(body("If a diver becomes entrapped or fouled: (1) Diver signals distress immediately. (2) Standby diver enters water with cutting tools. (3) Tender maintains tension on umbilical — do not haul in. (4) Standby diver locates and frees working diver. (5) Both divers ascend together under Dive Supervisor control. (6) If diver cannot be freed within 5 minutes, activate full emergency response. (7) Document all events in dive log."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.10  Actions Upon Loss of Vital Support Equipment"));
  paragraphs.push(body("If primary life support equipment fails: (1) Dive Supervisor immediately orders diver to surface. (2) Standby diver enters water if diver does not respond. (3) Backup equipment activated immediately. (4) Dive operations suspended until equipment is repaired and re-inspected. (5) Incident documented and reported."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.11  Actions Upon Loss of Air Supply"));
  paragraphs.push(body("If primary air supply is lost: (1) Diver activates bailout bottle immediately. (2) Diver signals emergency and begins controlled ascent. (3) Standby diver enters water with backup air supply. (4) Dive Supervisor activates emergency response. (5) Backup compressor or HP bank activated. (6) Diver monitored for DCS symptoms after surfacing."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.12  Actions Upon Loss of Communication"));
  paragraphs.push(body("If communications are lost: (1) Tender uses line pull signals per USN Diving Manual. (2) Diver responds with line pull signals. (3) If no response within 1 minute, standby diver enters water. (4) If communication cannot be restored, diver is recalled to surface. (5) Dive operations suspended until communications are restored."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.13  Injured Diver Plan"));
  paragraphs.push(body("Upon surfacing of an injured diver: (1) Assist diver aboard and remove equipment. (2) Assess injuries and administer first aid. (3) Administer 100% O2 if DCS or AGE is suspected. (4) Contact DAN and emergency services. (5) Transport to hyperbaric facility if indicated. (6) Do not allow diver to fly within 24 hours of treatment."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.14  Actions Upon Discovery of Fire"));
  paragraphs.push(body("Upon discovery of fire: (1) Alert all personnel. (2) If diver is in water, recall immediately. (3) Activate fire suppression if safe to do so. (4) Call 911. (5) Evacuate personnel to muster point. (6) Do not re-enter until cleared by fire department. (7) Standby diver remains in water only if safe egress is available."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.15  Diver Blow-Up or Too Rapid Ascent to Surface"));
  paragraphs.push(body("If a diver ascends too rapidly: (1) Diver is immediately placed on 100% O2. (2) Diver is assessed for DCS/AGE symptoms. (3) Contact DAN (+1-919-684-9111) immediately. (4) Transport to nearest hyperbaric chamber if symptoms present. (5) Do not allow diver to re-enter water. (6) Document depth, bottom time, and ascent rate in dive log."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.16  Diver Loss of Consciousness"));
  paragraphs.push(body("If a diver loses consciousness underwater: (1) Standby diver enters water immediately. (2) Diver brought to surface under controlled conditions. (3) Remove helmet/mask and assess airway. (4) Administer CPR if no pulse. (5) Administer 100% O2. (6) Call 911 and DAN. (7) Transport to hospital/hyperbaric facility."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.17  Injury/Illness of Surface Crew Member with Diver in the Water"));
  paragraphs.push(body("If a surface crew member is incapacitated while a diver is in the water: (1) Remaining crew members assume critical roles. (2) Diver is recalled to surface immediately. (3) Standby diver remains ready. (4) Emergency services contacted. (5) Dive operations suspended until adequate crew is available."));
  paragraphs.push(spacer());

  paragraphs.push(h2("4.18  Lost Diver Plan"));
  paragraphs.push(body("If a diver cannot be located: (1) Standby diver enters water immediately to search last known location. (2) Tender maintains tension on umbilical and follows it to diver. (3) Dive Supervisor contacts USCG and emergency services. (4) Search pattern established per USN Diving Manual. (5) Operations do not resume until diver is located and situation is resolved."));
  paragraphs.push(spacer());

  return paragraphs;
}

// ─── Section 5: Reporting ─────────────────────────────────────────────────────

function createSection5(): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  paragraphs.push(h1("5.  REPORTING"));
  paragraphs.push(body("The following documentation shall be completed and maintained for all diving operations conducted under this plan:"));
  paragraphs.push(spacer());

  paragraphs.push(h2("5.1  Required Documentation"));
  paragraphs.push(h3("5.1.1  General Pre-Dive Operations Checklist"));
  paragraphs.push(body("A General Pre-Dive Operations Checklist shall be completed and signed by the Dive Supervisor prior to each dive. The checklist shall confirm: dive team briefing completed, equipment inspected, communications tested, emergency equipment staged, and weather/sea conditions acceptable.", true));
  paragraphs.push(spacer());

  paragraphs.push(h3("5.1.2  Checklist for Equipment and Procedures"));
  paragraphs.push(body("An Equipment and Procedures Checklist shall be completed prior to each dive confirming: umbilical integrity, helmet/mask seal, breathing gas analysis, standby diver readiness, and chamber operational status.", true));
  paragraphs.push(spacer());

  paragraphs.push(h3("5.1.3  Activity Hazard Analysis"));
  paragraphs.push(body("The AHA shall be reviewed and signed by all dive team members prior to commencing operations each day. Any changes to scope or conditions require AHA update and re-briefing.", true));
  paragraphs.push(spacer());

  paragraphs.push(h3("5.1.4  Diving Log"));
  paragraphs.push(body("A Diving Log shall be maintained for each diver for each dive, recording: diver name, date, time in/out, max depth, bottom time, decompression completed, gas used, equipment used, work performed, and diver condition post-dive.", true));
  paragraphs.push(spacer());

  paragraphs.push(h3("5.1.5  Post Dive Checklist"));
  paragraphs.push(body("A Post-Dive Checklist shall be completed after each dive confirming: diver condition assessed, equipment rinsed and stowed, gas cylinders checked and logged, and any deficiencies reported.", true));
  paragraphs.push(spacer());

  paragraphs.push(h3("5.1.6  Incident Reporting"));
  paragraphs.push(body("Any injury, illness, near-miss, or equipment failure shall be reported immediately to the Project Manager and client representative. A written incident report shall be completed within 24 hours. OSHA recordable incidents shall be entered on the OSHA 300 Log within 7 days. Fatalities and in-patient hospitalizations shall be reported to OSHA within 8 hours (1-800-321-OSHA).", true));
  paragraphs.push(spacer());

  return paragraphs;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export interface DBQueryResult {
  workSelections: { category: string; label: string }[];
  projectContacts: { roleName: string; contactName: string; contactPhone: string }[];
  companyContactDefaults?: { roleName: string; defaultName: string; defaultPhone: string }[];
}

export async function generateDD5DivePlanDocx(
  data: ProjectDivePlanData,
  preparedBy: string,
  dbData?: DBQueryResult
): Promise<Buffer> {
  // Resolve effective tasks
  const effectiveTasks: string[] =
    dbData?.workSelections?.length
      ? dbData.workSelections.map(w => w.label)
      : data.natureOfWork.selectedTasks.length
        ? data.natureOfWork.selectedTasks
        : ["TBD — No work items selected"];

  // Resolve effective contacts
  let effectiveContacts: { name: string; role: string; phone: string; email: string }[] = [];
  if (dbData?.projectContacts?.length) {
    effectiveContacts = dbData.projectContacts.map(c => ({ name: c.contactName || "TBD", role: c.roleName, phone: c.contactPhone || "TBD", email: "" }));
  } else if (dbData?.companyContactDefaults?.length) {
    effectiveContacts = dbData.companyContactDefaults.map(c => ({ name: c.defaultName || "TBD", role: c.roleName, phone: c.defaultPhone || "TBD", email: "" }));
  } else if (data.projectContacts.keyContacts?.length) {
    effectiveContacts = data.projectContacts.keyContacts.map(c => ({ name: c.name, role: c.role, phone: c.phone, email: c.email || "" }));
  } else {
    effectiveContacts = [
      { name: "TBD", role: "Ops/PM", phone: "TBD", email: "" },
      { name: "TBD", role: "Diving Superintendent", phone: "TBD", email: "" },
      { name: "TBD", role: "Dive Supervisor", phone: "TBD", email: "" },
      { name: "TBD", role: "HSE", phone: "TBD", email: "" },
    ];
  }

  const projectTitle = data.coverPage.projectTitle || "Dive Operations Safety Plan";
  const companyName = data.coverPage.companyName || "Precision Subsea Group LLC";

  const headerParagraph = new Paragraph({
    children: [
      new TextRun({ text: `${companyName}  —  ${projectTitle}`, size: 18, font: "Times New Roman", italics: true }),
    ],
  });
  const footerParagraph = new Paragraph({
    children: [
      new TextRun({ text: companyName, size: 18, font: "Times New Roman", italics: true }),
    ],
    alignment: AlignmentType.LEFT,
  });

  const allChildren: (Paragraph | Table)[] = [
    ...createCoverPage(data),
    pageBreak(),

    h1("REVISION HISTORY"),
    createRevisionTable(data.revisionHistory || []),
    pageBreak(),

    ...createSection1(data),
    pageBreak(),

    ...createSection2(data, preparedBy, effectiveContacts, effectiveTasks),
    pageBreak(),

    ...createSection3(data),
    pageBreak(),

    ...createSection4(data),
    pageBreak(),

    ...createSection5(),
    pageBreak(),

    new Paragraph({
      children: [new TextRun({ text: "— END OF DIVE OPERATIONS SAFETY PLAN —", bold: true, size: 22, font: "Times New Roman" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Prepared by: ${preparedBy}`, size: 20, font: "Times New Roman" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Document Hash: ${data.previousPayloadHash || computePayloadHash(data)}`, size: 18, font: "Times New Roman", color: "888888" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 100 },
    }),
  ];

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({ children: [headerParagraph] }),
        },
        footers: {
          default: new Footer({ children: [footerParagraph] }),
        },
        children: allChildren,
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

/**
 * Generate DD5 Dive Plan with validation.
 * HARD FAILS if banned boilerplate stub text is detected in output.
 */
export async function generateValidatedDD5DivePlanDocx(
  data: ProjectDivePlanData,
  preparedBy: string,
  dbData?: DBQueryResult
): Promise<Buffer> {
  const docxBuffer = await generateDD5DivePlanDocx(data, preparedBy, dbData);
  // Extract raw bytes as string for validation (checks for banned placeholder strings)
  const docText = docxBuffer.toString("utf8");
  validateNoBoilerplateStubTextOrThrow(docText);
  return docxBuffer;
}
