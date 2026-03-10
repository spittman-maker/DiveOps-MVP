/**
 * Safety Seed Data — Comprehensive preloaded safety topics, checklists, and JHA hazards
 * for commercial diving operations.
 *
 * This data is seeded into the database when the safety tab is first enabled
 * for a project, or via the /api/safety/seed-all endpoint.
 */

import type { InsertSafetyTopic, InsertJhaHazard } from "@shared/safety-schema";

// ────────────────────────────────────────────────────────────────────────────
// PRE-DIVE CHECKLISTS — Surface-Supplied, SCUBA, Mixed Gas
// ────────────────────────────────────────────────────────────────────────────

export interface ChecklistSeedTemplate {
  checklistType: "pre_dive" | "post_dive" | "equipment";
  title: string;
  description: string;
  roleScope: "diver" | "tender" | "supervisor" | "all";
  items: Array<{
    sortOrder: number;
    category: string;
    label: string;
    description?: string;
    itemType: "checkbox" | "pass_fail_flag" | "text_input" | "numeric_input" | "gas_analysis";
    isRequired: boolean;
    equipmentCategory?: string;
  }>;
}

export const CHECKLIST_TEMPLATES: ChecklistSeedTemplate[] = [
  // ── Surface-Supplied Pre-Dive ─────────────────────────────────────
  {
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — Surface-Supplied Diving",
    description: "Comprehensive pre-dive inspection for surface-supplied diving operations per ADCI and USACE EM 385-1-1 standards",
    roleScope: "all",
    items: [
      { sortOrder: 1, category: "Dive Planning", label: "Dive plan briefing completed with all team members", itemType: "checkbox", isRequired: true },
      { sortOrder: 2, category: "Dive Planning", label: "Dive depth and bottom time confirmed within tables", itemType: "checkbox", isRequired: true },
      { sortOrder: 3, category: "Dive Planning", label: "Decompression schedule posted and reviewed", itemType: "checkbox", isRequired: false },
      { sortOrder: 4, category: "Dive Planning", label: "Emergency action plan reviewed — all personnel know roles", itemType: "checkbox", isRequired: true },
      { sortOrder: 5, category: "Gas Supply", label: "Primary air supply — compressor operational, filters current", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 6, category: "Gas Supply", label: "HP air bank pressure verified (minimum 2200 PSI)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 7, category: "Gas Supply", label: "Volume tank pressure adequate", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 8, category: "Gas Supply", label: "Breathing air quality test current (Grade D or better)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 9, category: "Gas Analysis", label: "Breathing gas O2 analysis — percentage recorded", itemType: "gas_analysis", isRequired: true },
      { sortOrder: 10, category: "Gas Analysis", label: "CO monitor reading within limits", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 11, category: "Helmet/Mask", label: "Helmet/mask inspected — no cracks, seals intact", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 12, category: "Helmet/Mask", label: "Demand regulator function tested", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 13, category: "Helmet/Mask", label: "Free-flow valve operational", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 14, category: "Umbilical", label: "Umbilical inspected full length — no cuts, kinks, abrasion", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 15, category: "Umbilical", label: "Umbilical whip check installed", itemType: "checkbox", isRequired: true },
      { sortOrder: 16, category: "Umbilical", label: "Pneumo hose connected and reading verified", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 17, category: "Communications", label: "Primary comms tested — clear two-way audio", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 18, category: "Communications", label: "Backup communications verified", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 19, category: "Communications", label: "Video system operational (if applicable)", itemType: "pass_fail_flag", isRequired: false },
      { sortOrder: 20, category: "Bailout", label: "Bailout bottle pressure verified (minimum 2200 PSI)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 21, category: "Bailout", label: "Bailout regulator function tested", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 22, category: "Harness/Dress", label: "Harness inspected — all buckles, snaps, D-rings secure", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 23, category: "Harness/Dress", label: "Weight system properly configured", itemType: "checkbox", isRequired: true },
      { sortOrder: 24, category: "Tools/Equipment", label: "Dive knife/cutting device secured and accessible", itemType: "checkbox", isRequired: true },
      { sortOrder: 25, category: "Tools/Equipment", label: "Required tools staged and inspected", itemType: "checkbox", isRequired: true },
      { sortOrder: 26, category: "Safety", label: "Standby diver dressed and ready", itemType: "checkbox", isRequired: true },
      { sortOrder: 27, category: "Safety", label: "First aid kit and O2 equipment accessible", itemType: "checkbox", isRequired: true },
      { sortOrder: 28, category: "Safety", label: "Nearest recompression chamber identified and contact confirmed", itemType: "checkbox", isRequired: true },
      { sortOrder: 29, category: "Personnel", label: "Diver medically fit — no complaints, no alcohol in 12 hrs", itemType: "checkbox", isRequired: true },
      { sortOrder: 30, category: "Environment", label: "Weather and sea state acceptable for dive operations", itemType: "pass_fail_flag", isRequired: true },
    ],
  },

  // ── SCUBA Pre-Dive ────────────────────────────────────────────────
  {
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — SCUBA Diving",
    description: "Pre-dive inspection for SCUBA diving operations per ADCI consensus standards",
    roleScope: "all",
    items: [
      { sortOrder: 1, category: "Dive Planning", label: "Dive plan briefing completed — depth, time, task reviewed", itemType: "checkbox", isRequired: true },
      { sortOrder: 2, category: "Dive Planning", label: "Buddy/team assignments confirmed", itemType: "checkbox", isRequired: true },
      { sortOrder: 3, category: "Dive Planning", label: "Emergency procedures reviewed with all divers", itemType: "checkbox", isRequired: true },
      { sortOrder: 4, category: "Cylinders", label: "Primary cylinder pressure verified (minimum fill)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 5, category: "Cylinders", label: "Cylinder visual inspection current", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 6, category: "Cylinders", label: "Cylinder hydrostatic test current", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 7, category: "Gas Analysis", label: "Breathing gas analyzed — O2 percentage recorded", itemType: "gas_analysis", isRequired: true },
      { sortOrder: 8, category: "Regulator", label: "Primary regulator function tested — breathing smoothly", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 9, category: "Regulator", label: "Octopus/alternate air source tested", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 10, category: "Regulator", label: "SPG reading matches cylinder pressure", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 11, category: "BCD", label: "BCD inflates and deflates properly", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 12, category: "BCD", label: "BCD dump valves operational", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 13, category: "Exposure Protection", label: "Wetsuit/drysuit condition acceptable", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 14, category: "Safety Equipment", label: "Dive knife/cutting device present", itemType: "checkbox", isRequired: true },
      { sortOrder: 15, category: "Safety Equipment", label: "Surface marker buoy (SMB) available", itemType: "checkbox", isRequired: true },
      { sortOrder: 16, category: "Safety Equipment", label: "Dive computer/bottom timer functional", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 17, category: "Communications", label: "Surface communications plan established", itemType: "checkbox", isRequired: true },
      { sortOrder: 18, category: "Safety", label: "Standby diver designated and ready", itemType: "checkbox", isRequired: true },
      { sortOrder: 19, category: "Safety", label: "First aid and O2 kit accessible on surface", itemType: "checkbox", isRequired: true },
      { sortOrder: 20, category: "Personnel", label: "Diver medically fit — no complaints", itemType: "checkbox", isRequired: true },
    ],
  },

  // ── Mixed Gas Pre-Dive ────────────────────────────────────────────
  {
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — Mixed Gas Diving",
    description: "Pre-dive inspection for mixed gas (HeO2/Nitrox/Trimix) diving operations",
    roleScope: "supervisor",
    items: [
      { sortOrder: 1, category: "Dive Planning", label: "Mixed gas dive plan reviewed — depth, time, gas switches", itemType: "checkbox", isRequired: true },
      { sortOrder: 2, category: "Dive Planning", label: "Decompression schedule calculated and posted", itemType: "checkbox", isRequired: true },
      { sortOrder: 3, category: "Dive Planning", label: "Gas consumption calculations verified for all phases", itemType: "checkbox", isRequired: true },
      { sortOrder: 4, category: "Dive Planning", label: "Contingency gas reserves confirmed adequate", itemType: "checkbox", isRequired: true },
      { sortOrder: 5, category: "Gas Supply — Bottom Mix", label: "Bottom mix analyzed — O2 percentage recorded", itemType: "gas_analysis", isRequired: true },
      { sortOrder: 6, category: "Gas Supply — Bottom Mix", label: "Bottom mix analyzed — He percentage recorded (if applicable)", itemType: "gas_analysis", isRequired: false },
      { sortOrder: 7, category: "Gas Supply — Bottom Mix", label: "Bottom mix supply pressure adequate for planned dive", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 8, category: "Gas Supply — Decompression", label: "Decompression gas analyzed — O2 percentage recorded", itemType: "gas_analysis", isRequired: true },
      { sortOrder: 9, category: "Gas Supply — Decompression", label: "Decompression gas supply adequate", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 10, category: "Gas Supply — Emergency", label: "Emergency/bailout gas supply verified", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 11, category: "Gas Switching", label: "Gas switching manifold tested and labeled", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 12, category: "Gas Switching", label: "Gas switch depths confirmed with diver", itemType: "checkbox", isRequired: true },
      { sortOrder: 13, category: "Helmet/Mask", label: "Helmet/mask inspected and function tested", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 14, category: "Helmet/Mask", label: "Demand regulator and free-flow tested on each gas", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 15, category: "Umbilical", label: "Umbilical inspected — all hoses, comms, pneumo intact", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 16, category: "Communications", label: "Comms tested — helium unscramblers operational (if HeO2)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 17, category: "Monitoring", label: "Pneumofathometer reading verified at surface", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 18, category: "Monitoring", label: "Depth tracking system operational", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 19, category: "Chamber", label: "Decompression chamber pre-checked and ready", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 20, category: "Chamber", label: "Chamber operator briefed on decompression schedule", itemType: "checkbox", isRequired: true },
      { sortOrder: 21, category: "Safety", label: "Standby diver dressed on appropriate gas mix", itemType: "checkbox", isRequired: true },
      { sortOrder: 22, category: "Safety", label: "DMT/medic on standby with treatment tables available", itemType: "checkbox", isRequired: true },
      { sortOrder: 23, category: "Personnel", label: "Diver medically fit — no complaints, no recent altitude exposure", itemType: "checkbox", isRequired: true },
    ],
  },

  // ── Post-Dive — Diver Condition ───────────────────────────────────
  {
    checklistType: "post_dive",
    title: "Post-Dive Checklist — Diver Condition Assessment",
    description: "Post-dive diver health and condition assessment per ADCI standards",
    roleScope: "all",
    items: [
      { sortOrder: 1, category: "Immediate Assessment", label: "Diver responsive and oriented on surfacing", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 2, category: "Immediate Assessment", label: "Diver reports no pain, numbness, or tingling", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 3, category: "Immediate Assessment", label: "Diver reports no visual disturbances", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 4, category: "Immediate Assessment", label: "Diver reports no difficulty breathing", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 5, category: "Immediate Assessment", label: "Diver reports no joint pain", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 6, category: "Neurological Check", label: "Grip strength symmetrical", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 7, category: "Neurological Check", label: "Gait normal — no staggering or imbalance", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 8, category: "Neurological Check", label: "Skin inspection — no rash, mottling, or marbling", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 9, category: "Debrief", label: "Actual bottom time and max depth recorded", itemType: "text_input", isRequired: true },
      { sortOrder: 10, category: "Debrief", label: "Any unusual events during dive reported", itemType: "text_input", isRequired: false },
      { sortOrder: 11, category: "Debrief", label: "Diver verbal debrief completed with supervisor", itemType: "checkbox", isRequired: true },
      { sortOrder: 12, category: "Monitoring", label: "Diver to remain on-site for observation period", itemType: "checkbox", isRequired: true },
      { sortOrder: 13, category: "Monitoring", label: "Diver advised: report any delayed symptoms immediately", itemType: "checkbox", isRequired: true },
    ],
  },

  // ── Post-Dive — Equipment Condition ───────────────────────────────
  {
    checklistType: "post_dive",
    title: "Post-Dive Checklist — Equipment Condition",
    description: "Post-dive equipment inspection and maintenance tracking",
    roleScope: "tender",
    items: [
      { sortOrder: 1, category: "Helmet/Mask", label: "Helmet/mask rinsed and inspected for damage", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 2, category: "Helmet/Mask", label: "Demand regulator and exhaust valve clear", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 3, category: "Umbilical", label: "Umbilical inspected post-dive — note any new damage", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 4, category: "Umbilical", label: "Umbilical properly coiled and stored", itemType: "checkbox", isRequired: true },
      { sortOrder: 5, category: "Harness/Dress", label: "Harness inspected — buckles, stitching, D-rings", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 6, category: "Harness/Dress", label: "Drysuit/wetsuit rinsed and hung to dry", itemType: "checkbox", isRequired: true },
      { sortOrder: 7, category: "Bailout", label: "Bailout bottle pressure recorded", itemType: "numeric_input", isRequired: true },
      { sortOrder: 8, category: "Bailout", label: "Bailout recharged if below minimum", itemType: "checkbox", isRequired: false },
      { sortOrder: 9, category: "Tools", label: "All tools accounted for and returned to storage", itemType: "checkbox", isRequired: true },
      { sortOrder: 10, category: "Tools", label: "Any damaged tools tagged and reported", itemType: "text_input", isRequired: false },
      { sortOrder: 11, category: "General", label: "Equipment issues requiring maintenance noted", itemType: "text_input", isRequired: false },
    ],
  },

  // ── Equipment Inspection — Dive Station ───────────────────────────
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Dive Station",
    description: "Daily dive station equipment inspection covering air systems, control panel, and support equipment",
    roleScope: "supervisor",
    items: [
      { sortOrder: 1, category: "Air Supply", label: "Primary air compressor — operational, oil level, filters current", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 2, category: "Air Supply", label: "HP air bank — pressure adequate, manifold valves functional", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "air_bank" },
      { sortOrder: 3, category: "Air Supply", label: "Volume tank — pressure holding, relief valve tested", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "volume_tank" },
      { sortOrder: 4, category: "Air Supply", label: "Air filtration system — filters within service life", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "filtration" },
      { sortOrder: 5, category: "Air Supply", label: "CO/moisture monitor — calibrated and reading within limits", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "gas_monitoring" },
      { sortOrder: 6, category: "Control Panel", label: "Dive control panel — all gauges reading correctly", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "control_panel" },
      { sortOrder: 7, category: "Control Panel", label: "Diver supply valves — smooth operation, no leaks", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "control_panel" },
      { sortOrder: 8, category: "Control Panel", label: "Pneumofathometer — calibrated and functional", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 9, category: "Rigging", label: "Stage/basket — inspected, rigging hardware intact", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "stage" },
      { sortOrder: 10, category: "Rigging", label: "Down line/clump weight — rigged and secure", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "rigging" },
      { sortOrder: 11, category: "Safety Equipment", label: "First aid kit — fully stocked", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "first_aid" },
      { sortOrder: 12, category: "Safety Equipment", label: "Emergency O2 kit — full cylinder, regulator tested", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "emergency_o2" },
    ],
  },

  // ── Equipment Inspection — Communications ─────────────────────────
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Communications Systems",
    description: "Daily communications equipment inspection for dive operations",
    roleScope: "supervisor",
    items: [
      { sortOrder: 1, category: "Hardwire Comms", label: "Primary hardwire comms unit — power on, clear audio", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 2, category: "Hardwire Comms", label: "Diver 1 channel — tested with helmet, clear both ways", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 3, category: "Hardwire Comms", label: "Diver 2 channel — tested with helmet, clear both ways", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "communications" },
      { sortOrder: 4, category: "Hardwire Comms", label: "Standby diver channel — tested", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 5, category: "Hardwire Comms", label: "Recording system operational (if required)", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "communications" },
      { sortOrder: 6, category: "Wireless Comms", label: "Through-water comms tested (if applicable)", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "wireless_comms" },
      { sortOrder: 7, category: "Surface Comms", label: "Surface radio — operational, correct channels set", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "surface_radio" },
      { sortOrder: 8, category: "Surface Comms", label: "Emergency contact numbers posted at dive station", itemType: "checkbox", isRequired: true, equipmentCategory: "surface_radio" },
    ],
  },

  // ── Equipment Inspection — Pneumo ─────────────────────────────────
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Pneumofathometer System",
    description: "Pneumofathometer calibration and function check",
    roleScope: "supervisor",
    items: [
      { sortOrder: 1, category: "Calibration", label: "Pneumo gauge zeroed at surface", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 2, category: "Calibration", label: "Pneumo hose purged — no moisture in line", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 3, category: "Calibration", label: "Pneumo reading matches known depth reference", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 4, category: "Function", label: "Pneumo supply valve operates smoothly", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 5, category: "Function", label: "Pneumo hose connection to umbilical secure", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 6, category: "Backup", label: "Backup depth measurement available (digital gauge/computer)", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "pneumo" },
    ],
  },

  // ── Equipment Inspection — Video ──────────────────────────────────
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Video Systems",
    description: "Underwater video and camera system inspection",
    roleScope: "supervisor",
    items: [
      { sortOrder: 1, category: "Camera", label: "Camera housing — inspected, no cracks, O-rings greased", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 2, category: "Camera", label: "Camera power — battery charged or power supply connected", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 3, category: "Camera", label: "Camera lens — clean, no scratches", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 4, category: "Lighting", label: "Dive lights — operational, charged", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 5, category: "Recording", label: "Recording media — adequate storage available", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 6, category: "Recording", label: "Surface monitor — displaying clear image", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 7, category: "Cable", label: "Video cable — inspected, no damage, connections secure", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 8, category: "Overlay", label: "Video overlay — date, time, depth displaying correctly", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "video" },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// SAFETY MEETING TOPIC LIBRARY
// ────────────────────────────────────────────────────────────────────────────

export const SAFETY_TOPICS: Omit<InsertSafetyTopic, "isActive">[] = [
  // ── Entanglement ──────────────────────────────────────────────────
  {
    category: "entanglement",
    title: "Entanglement Hazards and Prevention",
    description: "Diver entanglement in lines, cables, nets, or debris is one of the most common and dangerous hazards in commercial diving. Prevention requires constant situational awareness and proper umbilical management.",
    talkingPoints: [
      "Always maintain awareness of umbilical routing — tender must actively manage slack",
      "Carry a sharp cutting device accessible with either hand",
      "Communicate immediately if you feel any resistance or snagging",
      "Never swim through or under unsecured lines, cables, or debris",
      "If entangled: STOP, communicate, assess, and work free methodically — do NOT thrash",
      "Tender must maintain slight tension on umbilical at all times",
      "Pre-dive survey should identify entanglement hazards in the work area",
      "Secure all loose lines and tag lines before diver enters water",
    ],
    applicableDiveTypes: ["surface_supplied", "scuba", "mixed_gas"],
    regulatoryReferences: ["ADCI Consensus Standards 4.3", "USACE EM 385-1-1 Section 30"],
  },
  {
    category: "entanglement",
    title: "Umbilical Management Best Practices",
    description: "Proper umbilical management by the tender is critical to preventing entanglement and ensuring diver safety. The tender is the diver's lifeline manager.",
    talkingPoints: [
      "Tender must maintain constant contact with umbilical — feel for signals and resistance",
      "Pay out and take up slack as diver moves — never let umbilical pile up on bottom",
      "Route umbilical clear of sharp edges, moving equipment, and propellers",
      "Use umbilical guides or rollers at deck edge to prevent chafing",
      "Communicate with diver about umbilical status regularly",
      "If diver reports umbilical fouled — stop all movement, assess, and clear systematically",
      "Mark umbilical at 10-foot intervals for depth reference",
    ],
    applicableDiveTypes: ["surface_supplied", "mixed_gas"],
    regulatoryReferences: ["ADCI Consensus Standards 4.3.2"],
  },

  // ── Loss of Gas ───────────────────────────────────────────────────
  {
    category: "loss_of_gas",
    title: "Loss of Breathing Gas — Emergency Response",
    description: "Loss of primary breathing gas supply is a life-threatening emergency. All dive team members must know the immediate response procedures and bailout protocols.",
    talkingPoints: [
      "If gas supply interrupted: immediately switch to bailout/emergency gas supply",
      "Communicate 'No air' or 'On bailout' to surface immediately",
      "Supervisor must immediately identify cause — compressor failure, valve closure, umbilical damage",
      "Standby diver must be ready for immediate deployment",
      "Know your bailout bottle duration at current depth — plan your ascent accordingly",
      "Regular bailout drills build muscle memory for emergency response",
      "Check bailout bottle pressure before every dive — minimum 2200 PSI",
      "Never rely on a single gas source — redundancy is mandatory",
    ],
    applicableDiveTypes: ["surface_supplied", "mixed_gas"],
    regulatoryReferences: ["ADCI Consensus Standards 5.1", "Navy Dive Manual Vol 2 Ch 6", "USACE EM 385-1-1 Section 30.C"],
  },
  {
    category: "loss_of_gas",
    title: "Gas Supply Monitoring and Redundancy",
    description: "Continuous monitoring of gas supply systems and maintaining redundant supplies prevents loss-of-gas emergencies before they occur.",
    talkingPoints: [
      "Monitor primary supply pressure continuously — set low-pressure alarm thresholds",
      "HP bank must have adequate reserve for emergency ascent plus decompression",
      "Volume tank provides buffer — check pressure regularly during dive",
      "CO monitor must be operational and alarmed — carbon monoxide is odorless",
      "Breathing air quality must meet Grade D or better — test regularly",
      "Know the switchover procedures between primary and secondary supplies",
      "For mixed gas: verify gas composition at the panel before and during dive",
    ],
    applicableDiveTypes: ["surface_supplied", "mixed_gas"],
    regulatoryReferences: ["ADCI Consensus Standards 3.4", "OSHA 29 CFR 1926.1076"],
  },

  // ── Communications Failure ────────────────────────────────────────
  {
    category: "communications_failure",
    title: "Communications Failure Procedures",
    description: "Loss of communications between diver and surface is a serious emergency. Pre-established line-pull signals and backup communication plans are essential.",
    talkingPoints: [
      "If comms lost: diver should attempt to restore by checking connections",
      "Revert to line-pull signals immediately — all team members must know the signals",
      "Standard line-pull signals: 1 pull = OK/Stop, 2 pulls = Give slack, 3 pulls = Take up slack, 4 pulls = Emergency/Come up",
      "Supervisor must attempt to restore comms while monitoring diver via pneumo and umbilical tension",
      "If comms cannot be restored within 2 minutes — initiate controlled ascent",
      "Test backup communications before every dive",
      "Check all comms connections at helmet, junction box, and surface unit before dive",
      "Carry a slate for written communication if video system available",
    ],
    applicableDiveTypes: ["surface_supplied", "mixed_gas"],
    regulatoryReferences: ["ADCI Consensus Standards 4.5", "Navy Dive Manual Vol 2 Ch 6"],
  },

  // ── Hypothermia ───────────────────────────────────────────────────
  {
    category: "hypothermia",
    title: "Hypothermia Prevention and Recognition",
    description: "Water conducts heat 25 times faster than air. Hypothermia can impair judgment, reduce dexterity, and become life-threatening. Prevention and early recognition are critical.",
    talkingPoints: [
      "Know the water temperature — plan exposure protection accordingly",
      "Monitor diver for signs: shivering, slurred speech, confusion, reduced dexterity",
      "Set maximum exposure times based on water temperature and protection worn",
      "Hot water suits: verify temperature and flow rate before and during dive",
      "Diver must communicate if feeling cold — do not tough it out",
      "Have warm fluids and dry clothing ready for diver on surfacing",
      "Cold water reduces grip strength and fine motor skills — affects task performance",
      "Hypothermic divers are at increased risk for DCS — monitor closely post-dive",
    ],
    applicableDiveTypes: ["surface_supplied", "scuba", "mixed_gas"],
    regulatoryReferences: ["Navy Dive Manual Vol 2 Ch 4", "ADCI Consensus Standards 4.7"],
  },

  // ── Barotrauma ────────────────────────────────────────────────────
  {
    category: "barotrauma",
    title: "Barotrauma Prevention — Ears, Sinuses, and Lungs",
    description: "Barotrauma occurs when pressure changes damage air-filled body spaces. Proper equalization techniques and awareness of symptoms prevent injury.",
    talkingPoints: [
      "Equalize early and often during descent — never force equalization",
      "If unable to equalize: STOP descent, ascend slightly, try again gently",
      "Never dive with a cold, congestion, or sinus infection — increased barotrauma risk",
      "Report any ear pain, fullness, or hearing changes immediately",
      "Pulmonary barotrauma (lung over-expansion) — never hold breath during ascent",
      "Dental barotrauma — report any recent dental work before diving",
      "Symptoms of inner ear barotrauma: vertigo, nausea, hearing loss — requires immediate medical evaluation",
      "Supervisor must monitor ascent rate — controlled ascent prevents pulmonary barotrauma",
    ],
    applicableDiveTypes: ["surface_supplied", "scuba", "mixed_gas"],
    regulatoryReferences: ["Navy Dive Manual Vol 1 Ch 3", "ADCI Consensus Standards 5.2"],
  },

  // ── Equipment Failure ─────────────────────────────────────────────
  {
    category: "equipment_failure",
    title: "Equipment Failure Response and Prevention",
    description: "Equipment failures during diving operations can be life-threatening. Regular inspection, maintenance, and knowing emergency procedures for each failure mode are essential.",
    talkingPoints: [
      "Pre-dive equipment checks are your first line of defense — never skip them",
      "Helmet/mask flood: stay calm, switch to free-flow, clear mask, communicate",
      "Regulator failure: switch to bailout, communicate, begin controlled ascent",
      "Umbilical damage: assess severity, switch to bailout if gas supply compromised",
      "Hot water suit failure in cold water: communicate immediately, begin ascent if hypothermia risk",
      "Winch/crane failure with diver in water: establish alternative recovery plan",
      "Report any equipment anomalies — no matter how minor — for maintenance tracking",
      "Tag out defective equipment immediately — never use questionable gear",
    ],
    applicableDiveTypes: ["surface_supplied", "scuba", "mixed_gas"],
    regulatoryReferences: ["ADCI Consensus Standards 3.0", "USACE EM 385-1-1 Section 30"],
  },

  // ── Weather/Current Changes ───────────────────────────────────────
  {
    category: "weather_current",
    title: "Weather and Current Changes — Operational Awareness",
    description: "Changing weather and current conditions can rapidly escalate risk during dive operations. Continuous monitoring and clear abort criteria protect the dive team.",
    talkingPoints: [
      "Monitor weather forecasts before and during operations — conditions can change rapidly",
      "Establish clear abort criteria for wind speed, wave height, and current velocity",
      "Current changes affect diver workload, air consumption, and umbilical management",
      "Lightning within 10 miles — all personnel out of the water immediately",
      "Increasing seas affect vessel stability and diver recovery — plan accordingly",
      "Tidal current changes can be predicted — plan dive windows around slack water when possible",
      "Diver must report any change in current conditions immediately",
      "Have a contingency plan for rapid weather deterioration during decompression dives",
    ],
    applicableDiveTypes: ["surface_supplied", "scuba", "mixed_gas"],
    regulatoryReferences: ["ADCI Consensus Standards 4.1", "USACE EM 385-1-1 Section 30.A"],
  },

  // ── Crane Operations Near Divers ──────────────────────────────────
  {
    category: "crane_operations",
    title: "Crane and Lifting Operations Near Divers",
    description: "Crane and lifting operations while divers are in the water require strict coordination, communication, and exclusion zones to prevent struck-by incidents.",
    talkingPoints: [
      "NEVER lift loads over a diver — establish and enforce exclusion zones",
      "Diver must be clear of lift zone before any crane operation begins",
      "Dedicated signal person required for all lifts near dive operations",
      "Crane operator must have direct communication with dive supervisor",
      "Tag lines must be used on all suspended loads — prevent swing and spin",
      "Diver must be notified before any load movement in the water",
      "Subsea rigging: diver must be clear before load is tensioned or released",
      "If diver must guide a load underwater: maintain escape route, never position under load",
      "All rigging hardware must be inspected before each lift — shackles, slings, hooks",
    ],
    applicableDiveTypes: ["surface_supplied", "mixed_gas"],
    regulatoryReferences: ["OSHA 29 CFR 1926.1400", "USACE EM 385-1-1 Section 16", "ADCI Consensus Standards 4.9"],
  },

  // ── Underwater Cutting/Welding ────────────────────────────────────
  {
    category: "cutting_welding",
    title: "Underwater Cutting and Welding Safety",
    description: "Underwater cutting and welding (oxy-arc, Broco, exothermic) present unique hazards including burns, explosion, electric shock, and toxic fumes. Strict procedures are mandatory.",
    talkingPoints: [
      "Verify no flammable or explosive materials in the work area before starting",
      "Ensure adequate ventilation of the work area — trapped gases can explode",
      "Cutting: always cut away from umbilical, hoses, and your body",
      "Maintain proper electrical grounding — ground clamp must be secure and close to work",
      "Never strike an arc or ignite a torch until supervisor gives permission",
      "Diver must have clear escape route from the cutting/welding area",
      "Hot work permit required — verify with client and supervisor before starting",
      "Broco rods: maintain proper rod angle, watch for blowback and molten slag",
      "Electric shock prevention: knife switch must be open when not actively cutting/welding",
      "Post-cutting: inspect area for smoldering material or trapped hot gases",
    ],
    applicableDiveTypes: ["surface_supplied"],
    regulatoryReferences: ["OSHA 29 CFR 1926.1092", "ADCI Consensus Standards 6.0", "AWS D3.6M"],
  },

  // ── Confined Space Diving ─────────────────────────────────────────
  {
    category: "confined_space",
    title: "Confined Space Diving Hazards",
    description: "Diving in confined spaces (pipes, tanks, culverts, intakes) presents extreme hazards including entrapment, loss of orientation, and limited escape routes. These are among the highest-risk commercial diving operations.",
    talkingPoints: [
      "Confined space dive operations require a specific written dive plan and risk assessment",
      "Ensure the space has been isolated — lockout/tagout all valves, gates, and pumps",
      "Verify zero energy state — no flow, no pressure, no mechanical hazards",
      "Diver must have a lifeline in addition to umbilical for retrieval",
      "Maximum penetration distance must be pre-determined and communicated",
      "Standby diver must be rigged for immediate entry into the confined space",
      "Continuous communication is mandatory — any comms loss = immediate withdrawal",
      "Atmospheric monitoring of the space before and during operations",
      "Diver must be able to turn around or back out at all times — if not, abort",
      "Emergency retrieval plan must be briefed and practiced before dive",
    ],
    applicableDiveTypes: ["surface_supplied"],
    regulatoryReferences: ["OSHA 29 CFR 1926.1204", "ADCI Consensus Standards 7.0", "USACE EM 385-1-1 Section 34"],
  },

  // ── Contaminated Water Diving ─────────────────────────────────────
  {
    category: "contaminated_water",
    title: "Contaminated Water Diving Procedures",
    description: "Diving in contaminated or polluted water requires specialized equipment, decontamination procedures, and health monitoring to protect divers from chemical and biological hazards.",
    talkingPoints: [
      "Identify contaminants before diving — request water quality data from client",
      "Appropriate exposure protection required — vulcanized drysuit minimum, full encapsulation for severe contamination",
      "All suit penetrations (gloves, boots, helmet) must be sealed — no skin exposure",
      "Decontamination station must be set up before dive operations begin",
      "Three-stage decon: gross wash, soap/detergent wash, fresh water rinse",
      "Diver must not eat, drink, or smoke until fully decontaminated",
      "Post-dive health monitoring — report any skin irritation, nausea, or unusual symptoms",
      "Equipment decontamination must be thorough — all gear washed before storage",
      "Medical surveillance program required for regular contaminated water divers",
      "Know the specific hazards: chemical burns, biological pathogens, heavy metals",
    ],
    applicableDiveTypes: ["surface_supplied"],
    regulatoryReferences: ["OSHA 29 CFR 1910.120", "ADCI Consensus Standards 8.0", "USACE EM 385-1-1 Section 30.K"],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// JHA HAZARD LIBRARY — Common Commercial Diving Hazards
// ────────────────────────────────────────────────────────────────────────────

export const JHA_HAZARDS: Omit<InsertJhaHazard, "isActive">[] = [
  {
    category: "environmental",
    hazard: "Strong or changing underwater currents",
    description: "Currents exceeding 1 knot significantly increase diver workload, air consumption, and risk of separation from the work site or umbilical entanglement.",
    defaultRiskLevel: "high",
    standardControls: [
      "Monitor current conditions continuously — abort if exceeding safe limits",
      "Plan dive during slack water periods when possible",
      "Use current shields or deflectors at the work site",
      "Ensure adequate umbilical length with controlled slack",
      "Diver to maintain positive hold on structure at all times",
    ],
    requiredPpe: ["Full harness with safety line", "Dive knife"],
    applicableOperations: ["All underwater operations"],
    regulatoryBasis: "ADCI Consensus Standards 4.1",
  },
  {
    category: "environmental",
    hazard: "Reduced or zero underwater visibility",
    description: "Poor visibility increases risk of disorientation, entanglement, contact with hazards, and inability to locate the ascent line or work site.",
    defaultRiskLevel: "medium",
    standardControls: [
      "Maintain continuous communication with surface",
      "Use lifeline/safety line in addition to umbilical",
      "Reduce work scope and increase caution in zero-vis conditions",
      "Ensure diver has functional dive light",
      "Tender must maintain positive umbilical management",
    ],
    requiredPpe: ["Dive light", "Safety line", "Dive knife"],
    applicableOperations: ["All underwater operations"],
    regulatoryBasis: "ADCI Consensus Standards 4.2",
  },
  {
    category: "environmental",
    hazard: "Cold water exposure — hypothermia risk",
    description: "Water temperatures below 50°F (10°C) significantly increase hypothermia risk. Impaired judgment and reduced dexterity can lead to secondary accidents.",
    defaultRiskLevel: "high",
    standardControls: [
      "Use appropriate thermal protection — hot water suit below 45°F",
      "Set maximum exposure time limits based on water temperature",
      "Monitor diver for signs of hypothermia — shivering, slurred speech",
      "Have warm fluids and dry clothing ready on surface",
      "Reduce dive time in cold water conditions",
    ],
    requiredPpe: ["Drysuit or hot water suit", "Hood", "Gloves"],
    applicableOperations: ["All underwater operations in cold water"],
    regulatoryBasis: "Navy Dive Manual Vol 2 Ch 4",
  },
  {
    category: "environmental",
    hazard: "Marine life hazards — stinging, biting, or venomous organisms",
    description: "Contact with jellyfish, sea urchins, stingrays, or other marine life can cause injury, allergic reactions, or envenomation.",
    defaultRiskLevel: "low",
    standardControls: [
      "Brief divers on known marine life hazards at the site",
      "Wear full exposure protection — minimize exposed skin",
      "Avoid contact with unknown organisms",
      "First aid kit must include treatment for marine life injuries",
      "Know the location of nearest medical facility",
    ],
    requiredPpe: ["Full exposure suit", "Gloves"],
    applicableOperations: ["All underwater operations"],
    regulatoryBasis: "ADCI Consensus Standards 4.7",
  },
  {
    category: "physiological",
    hazard: "Decompression sickness (DCS)",
    description: "Failure to follow proper decompression procedures can result in DCS, ranging from joint pain (Type I) to neurological damage or death (Type II).",
    defaultRiskLevel: "high",
    standardControls: [
      "Follow approved decompression tables — no shortcuts",
      "Monitor depth and time accurately throughout dive",
      "Controlled ascent rate — never exceed 30 ft/min",
      "Post-dive observation period — diver remains on-site",
      "Know location and contact for nearest recompression chamber",
      "Diver must report any symptoms immediately — no matter how minor",
    ],
    requiredPpe: ["Depth gauge/computer", "Timing device"],
    applicableOperations: ["All diving operations"],
    regulatoryBasis: "Navy Dive Manual Vol 2 Ch 9, USACE EM 385-1-1 Section 30.C",
  },
  {
    category: "physiological",
    hazard: "Oxygen toxicity — CNS or pulmonary",
    description: "Elevated oxygen partial pressures can cause CNS oxygen toxicity (seizures) or pulmonary oxygen toxicity (lung damage) during extended or deep exposures.",
    defaultRiskLevel: "high",
    standardControls: [
      "Monitor oxygen partial pressure — stay within NOAA/Navy limits",
      "Track cumulative oxygen exposure (OTUs) for extended operations",
      "Know the signs: twitching, visual disturbances, nausea, dizziness",
      "If symptoms occur: reduce depth/switch gas immediately",
      "Verify gas mix analysis before every dive",
    ],
    requiredPpe: ["Oxygen-compatible equipment"],
    applicableOperations: ["Mixed gas diving", "Nitrox diving", "Deep air diving"],
    regulatoryBasis: "Navy Dive Manual Vol 2 Ch 3",
  },
  {
    category: "equipment",
    hazard: "Loss of primary breathing gas supply",
    description: "Compressor failure, valve closure, or umbilical damage can cut off the diver's primary air supply, requiring immediate bailout procedures.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Maintain redundant gas supply — HP bank backup to compressor",
      "Bailout bottle checked and pressurized before every dive",
      "Diver trained on bailout procedures — regular drills",
      "Standby diver ready for immediate deployment",
      "Monitor supply pressure continuously at dive control panel",
    ],
    requiredPpe: ["Bailout bottle with regulator", "Helmet with free-flow capability"],
    applicableOperations: ["All surface-supplied diving"],
    regulatoryBasis: "ADCI Consensus Standards 5.1, OSHA 29 CFR 1926.1076",
  },
  {
    category: "equipment",
    hazard: "Communications system failure",
    description: "Loss of voice communications between diver and surface removes the primary means of coordination and emergency notification.",
    defaultRiskLevel: "high",
    standardControls: [
      "Test primary and backup comms before every dive",
      "All team members must know line-pull signals",
      "If comms lost > 2 minutes — initiate controlled ascent",
      "Check all connections at helmet, junction box, and surface unit",
      "Maintain backup communications system ready for deployment",
    ],
    requiredPpe: ["Helmet with comms", "Backup comms system"],
    applicableOperations: ["All surface-supplied diving"],
    regulatoryBasis: "ADCI Consensus Standards 4.5",
  },
  {
    category: "operational",
    hazard: "Diver entanglement in lines, cables, or debris",
    description: "Entanglement can restrict diver movement, compromise gas supply, and lead to panic if not managed calmly and methodically.",
    defaultRiskLevel: "high",
    standardControls: [
      "Pre-dive survey to identify entanglement hazards",
      "Tender actively manages umbilical slack",
      "Diver carries cutting device accessible with either hand",
      "Secure all loose lines before diver enters water",
      "If entangled: STOP, communicate, assess, work free methodically",
    ],
    requiredPpe: ["Dive knife/cutting device", "Safety line"],
    applicableOperations: ["All underwater operations"],
    regulatoryBasis: "ADCI Consensus Standards 4.3",
  },
  {
    category: "operational",
    hazard: "Struck by suspended or falling objects",
    description: "Objects dropped from the surface, falling from structures, or swinging loads can strike and injure divers working below.",
    defaultRiskLevel: "high",
    standardControls: [
      "Establish exclusion zones — no overhead lifts while diver is below",
      "All tools and equipment must be lowered on tool lines — never thrown",
      "Diver must be clear before any crane operations begin",
      "Hard hat/helmet provides head protection — ensure proper fit",
      "Secure all items on deck to prevent accidental drops",
    ],
    requiredPpe: ["Diving helmet", "Full harness"],
    applicableOperations: ["Construction", "Demolition", "Rigging", "Crane operations"],
    regulatoryBasis: "OSHA 29 CFR 1926.1400, USACE EM 385-1-1 Section 16",
  },
  {
    category: "operational",
    hazard: "Underwater cutting/welding — burns, explosion, electric shock",
    description: "Oxy-arc cutting, Broco exothermic cutting, and underwater welding expose divers to burns, trapped gas explosions, and electrical hazards.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Verify no trapped gases or flammable materials in work area",
      "Proper electrical grounding — ground clamp close to work piece",
      "Knife switch open when not actively cutting/welding",
      "Cut away from umbilical, hoses, and body",
      "Hot work permit obtained before starting",
      "Diver has clear escape route from work area",
      "Fire watch maintained on surface during hot work",
    ],
    requiredPpe: ["Welding gloves", "Diving helmet", "Full exposure suit"],
    applicableOperations: ["Underwater welding", "Underwater cutting", "Hot work"],
    regulatoryBasis: "OSHA 29 CFR 1926.1092, AWS D3.6M, ADCI Consensus Standards 6.0",
  },
  {
    category: "mechanical",
    hazard: "Crane/winch failure during diver operations",
    description: "Failure of crane, winch, or lifting equipment while diver is in the water or being recovered can result in diver being stranded or struck by falling equipment.",
    defaultRiskLevel: "high",
    standardControls: [
      "All lifting equipment inspected and load-tested before use",
      "Backup recovery method available — manual winch or alternative crane",
      "Diver stage/basket must have independent safety line",
      "Crane operator must have direct communication with dive supervisor",
      "Emergency recovery procedures briefed before dive",
    ],
    requiredPpe: ["Full harness with safety line"],
    applicableOperations: ["All operations using lifting equipment"],
    regulatoryBasis: "OSHA 29 CFR 1926.1400, USACE EM 385-1-1 Section 16",
  },
  {
    category: "chemical",
    hazard: "Contaminated water exposure",
    description: "Diving in polluted or chemically contaminated water can cause skin irritation, chemical burns, respiratory issues, or long-term health effects.",
    defaultRiskLevel: "high",
    standardControls: [
      "Identify contaminants before diving — obtain water quality data",
      "Use appropriate encapsulation — vulcanized drysuit minimum",
      "Seal all suit penetrations — no skin exposure",
      "Set up decontamination station before dive operations",
      "Three-stage decon after every dive",
      "Post-dive health monitoring for all exposed personnel",
    ],
    requiredPpe: ["Vulcanized drysuit", "Sealed gloves", "Sealed boots", "Full-face helmet"],
    applicableOperations: ["Contaminated water diving", "Industrial diving", "Wastewater operations"],
    regulatoryBasis: "OSHA 29 CFR 1910.120, ADCI Consensus Standards 8.0",
  },
  {
    category: "electrical",
    hazard: "Electrical shock from underwater power tools or cathodic protection systems",
    description: "Contact with energized electrical systems, impressed current cathodic protection, or faulty power tools can cause electric shock or electrocution underwater.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Lockout/tagout all electrical systems in the work area",
      "Verify cathodic protection systems are de-energized before diving",
      "Use only approved underwater electrical tools with GFI protection",
      "Diver must wear insulating gloves when working near electrical systems",
      "Test for stray currents before diver enters water",
      "If diver reports tingling or shock sensation — abort dive immediately",
    ],
    requiredPpe: ["Insulating gloves", "Full exposure suit"],
    applicableOperations: ["Inspection near electrical systems", "Cathodic protection work", "Underwater tool use"],
    regulatoryBasis: "OSHA 29 CFR 1926.1092, NFPA 70E",
  },
];
