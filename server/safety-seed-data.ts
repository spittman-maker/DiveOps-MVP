/**
 * Safety Seed Data — Regulation-grounded safety checklists, topics, and JHA hazards
 * for commercial diving operations.
 *
 * All checklist items reference specific sections of:
 *   - Navy Dive Manual (NAVSEA SS521-AG-PRO-010), referred to as "NDM"
 *   - USACE EM 385-1-1 Section 30 (Diving Operations), referred to as "EM 385-1-1"
 *   - ENG FORM 6226 (USACE Diver Contractors Checklist)
 *
 * Where both references apply, the more stringent requirement is cited.
 *
 * This data is auto-seeded into every project on creation and on first access
 * for existing projects, or via the /api/safety/seed-all endpoint.
 */

import type { InsertSafetyTopic, InsertJhaHazard } from "@shared/safety-schema";

// ────────────────────────────────────────────────────────────────────────────
// CHECKLIST SEED TEMPLATE INTERFACE
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
    regulatoryReference?: string;
  }>;
}

// ────────────────────────────────────────────────────────────────────────────
// PRE-DIVE CHECKLISTS
// ────────────────────────────────────────────────────────────────────────────

export const CHECKLIST_TEMPLATES: ChecklistSeedTemplate[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // SURFACE-SUPPLIED AIR (SSA) PRE-DIVE CHECKLIST
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — Surface-Supplied Diving (SSA)",
    description: "Comprehensive pre-dive inspection for surface-supplied air diving operations grounded in the Navy Dive Manual (NAVSEA SS521-AG-PRO-010) and USACE EM 385-1-1 Section 30.",
    roleScope: "all",
    items: [
      // ── Dive Planning & Documentation ──
      { sortOrder: 1, category: "Dive Planning", label: "Dive Operations Plan accepted by DDC and on-site", regulatoryReference: "EM 385-1-1 §30-8.a(1); ENG FORM 6226 §A.1b", itemType: "checkbox", isRequired: true },
      { sortOrder: 2, category: "Dive Planning", label: "Activity Hazards Analysis (AHA) reviewed and signed by all team members", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §A.1c", itemType: "checkbox", isRequired: true },
      { sortOrder: 3, category: "Dive Planning", label: "Emergency Management Plan on-site and reviewed", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §A.1d", itemType: "checkbox", isRequired: true },
      { sortOrder: 4, category: "Dive Planning", label: "Dive Personnel Qualifications verified and on-site", regulatoryReference: "EM 385-1-1 §30-8.a(5)–(7); ENG FORM 6226 §A.1e", itemType: "checkbox", isRequired: true },
      { sortOrder: 5, category: "Dive Planning", label: "Safe Practices Manual on-site", regulatoryReference: "EM 385-1-1 §30-8.a(1); ENG FORM 6226 §A.1a", itemType: "checkbox", isRequired: true },

      // ── Pre-Dive Conference ──
      { sortOrder: 6, category: "Pre-Dive Conference", label: "Pre-dive conference conducted with all dive team members present", regulatoryReference: "EM 385-1-1 §30-8.a(8)–(9); NDM Ch. 6 §6-9.1", itemType: "checkbox", isRequired: true },
      { sortOrder: 7, category: "Pre-Dive Conference", label: "Mission/scope of work, location, and drawings reviewed", regulatoryReference: "EM 385-1-1 §30-8.a(9)(a)–(b); NDM Ch. 6 §6-9.1", itemType: "checkbox", isRequired: true },
      { sortOrder: 8, category: "Pre-Dive Conference", label: "Maximum working depth and estimated bottom times confirmed within decompression tables", regulatoryReference: "EM 385-1-1 §30-8.a(9)(c); NDM Ch. 9 Table 9-4", itemType: "checkbox", isRequired: true },
      { sortOrder: 9, category: "Pre-Dive Conference", label: "Diving apparatus/equipment and craft to be used reviewed", regulatoryReference: "EM 385-1-1 §30-8.a(9)(b); ENG FORM 6226 §G.3e", itemType: "checkbox", isRequired: true },
      { sortOrder: 10, category: "Pre-Dive Conference", label: "Names and duties of all dive team personnel confirmed", regulatoryReference: "EM 385-1-1 §30-8.a(9)(d); ENG FORM 6226 §G.3k", itemType: "checkbox", isRequired: true },
      { sortOrder: 11, category: "Pre-Dive Conference", label: "Water temperature, current velocity, and visibility conditions briefed", regulatoryReference: "EM 385-1-1 §30-8.a(9)(c); ENG FORM 6226 §G.3h–j", itemType: "checkbox", isRequired: true },
      { sortOrder: 12, category: "Pre-Dive Conference", label: "Emergency procedures reviewed — all personnel know roles", regulatoryReference: "EM 385-1-1 §30-8.a(9)(f); NDM Ch. 6 §6-9.1.7", itemType: "checkbox", isRequired: true },

      // ── Dive Team Qualifications ──
      { sortOrder: 13, category: "Personnel", label: "All dive team members have current CPR certification", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §B.3a", itemType: "checkbox", isRequired: true },
      { sortOrder: 14, category: "Personnel", label: "All dive team members have current first aid certification", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §B.3b", itemType: "checkbox", isRequired: true },
      { sortOrder: 15, category: "Personnel", label: "All dive team members have emergency oxygen systems certification", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §B.3c", itemType: "checkbox", isRequired: true },
      { sortOrder: 16, category: "Personnel", label: "Each diver has current 'Fit to Dive' physician statement (within 12 months)", regulatoryReference: "EM 385-1-1 §30-8.a(9); ENG FORM 6226 §B.3d", itemType: "checkbox", isRequired: true },
      { sortOrder: 17, category: "Personnel", label: "Diver medically fit today — no complaints, no alcohol in past 12 hours", regulatoryReference: "NDM Ch. 3 §3-5; EM 385-1-1 §30-8.a(9)", itemType: "checkbox", isRequired: true },
      { sortOrder: 18, category: "Personnel", label: "Dive team meets minimum manning levels per EM 385-1-1 Tables 30-2 through 30-6", regulatoryReference: "EM 385-1-1 §30-8.a(11); ENG FORM 6226 §B.2", itemType: "checkbox", isRequired: true },

      // ── Air Supply Systems ──
      { sortOrder: 19, category: "Air Supply", label: "Primary air supply operational — compressor or HP cylinder bank", description: "Verify primary air source is functioning and delivering adequate pressure and volume.", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.1a; NDM Ch. 6 Fig. 6-21 Sheet 1", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 20, category: "Air Supply", label: "Reserve breathing air supply integral or in-line with primary air", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.1b", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "air_bank" },
      { sortOrder: 21, category: "Air Supply", label: "Bailout bottle minimum 30 ft³ — pressurized to ≥90% of working PSI", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.1c–d", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "bailout" },
      { sortOrder: 22, category: "Air Supply", label: "Volume tank — check valve on inlet, pressure gauge, relief valve, and drain valve verified", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7b; NDM Ch. 6 Fig. 6-21 Sheet 1", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "volume_tank" },
      { sortOrder: 23, category: "Air Supply", label: "Compressor intake located away from exhaust and contaminants", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7a; NDM Ch. 6 §6-7.3", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 24, category: "Air Supply", label: "In-line filters, regulators, and sorbent beds in supply line — current service date", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7c", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },

      // ── Gas Quality ──
      { sortOrder: 25, category: "Gas Quality", label: "Breathing air quality test current — Grade D or better per CGA G-7.1", regulatoryReference: "NDM Ch. 4 §4-4.1; EM 385-1-1 §30-8.c(3)(c)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 26, category: "Gas Quality", label: "Six-month air purity test results available on-site", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7h", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 27, category: "Gas Quality", label: "CO continuous monitoring alarm operational (oil-lubricated compressor)", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7d", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 28, category: "Gas Quality", label: "Breathing gas O₂ percentage recorded", regulatoryReference: "NDM Ch. 4 §4-4.1; EM 385-1-1 §30-8.c(3)(c)", itemType: "gas_analysis", isRequired: true },

      // ── Helmet/Mask ──
      { sortOrder: 29, category: "Helmet/Mask", label: "Diving helmet inspected — no cracks, viewport intact, seals in good condition", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 1; EM 385-1-1 §30-8.c(2)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },
      { sortOrder: 30, category: "Helmet/Mask", label: "Two-way electronic communication system in helmet with required external speaker", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.3a; NDM Ch. 6 §6-7.5", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },
      { sortOrder: 31, category: "Helmet/Mask", label: "Check valve in primary air line and exhaust valve functional", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.3b; NDM Ch. 6 Fig. 6-21 Sheet 1", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },
      { sortOrder: 32, category: "Helmet/Mask", label: "Bailout bottle connection to helmet — can be immediately activated by diver", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.3c", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },
      { sortOrder: 33, category: "Helmet/Mask", label: "Demand regulator and free-flow valve tested and operational", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 1; EM 385-1-1 §30-8.c(2)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },

      // ── Umbilical ──
      { sortOrder: 34, category: "Umbilical", label: "Umbilical inspected full length — no cuts, kinks, or abrasion damage", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "umbilical" },
      { sortOrder: 35, category: "Umbilical", label: "Umbilical connections corrosion-resistant and not easily disconnected", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.4a", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "umbilical" },
      { sortOrder: 36, category: "Umbilical", label: "Umbilical marked in 10 ft increments to 100 ft, then 50 ft increments", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.4b", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "umbilical" },
      { sortOrder: 37, category: "Umbilical", label: "Umbilical nominal breaking strength ≥1,000 lbs, kink-resistant material", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.4c", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "umbilical" },
      { sortOrder: 38, category: "Umbilical", label: "Pneumo hose connected and depth reading verified against known depth", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },

      // ── Communications ──
      { sortOrder: 39, category: "Communications", label: "Primary two-way voice communications tested — clear audio both directions", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.3a; NDM Ch. 6 §6-7.5", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 40, category: "Communications", label: "Backup communications method verified and briefed", regulatoryReference: "NDM Ch. 6 §6-7.5; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 41, category: "Communications", label: "All dives will be terminated if voice communications are lost — team briefed", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §G.4a", itemType: "checkbox", isRequired: true },

      // ── Harness & Dress ──
      { sortOrder: 42, category: "Harness/Dress", label: "Safety harness with positive buckling device and leg straps inspected", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.6a; NDM Ch. 6 Fig. 6-21 Sheet 2", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "harness" },
      { sortOrder: 43, category: "Harness/Dress", label: "Harness attachment point for safety line verified", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.6b", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "harness" },
      { sortOrder: 44, category: "Harness/Dress", label: "Lifting point keeps diver's head up when unconscious — verified", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.6c", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "harness" },
      { sortOrder: 45, category: "Harness/Dress", label: "Wet suit or dry suit with gloves and booties — appropriate for water temperature and environmental hazards", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.5; NDM Ch. 6 §6-5", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "exposure_suit" },
      { sortOrder: 46, category: "Harness/Dress", label: "Weight system properly configured and quick-release functional", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2", itemType: "pass_fail_flag", isRequired: true },

      // ── Standby Diver & Safety ──
      { sortOrder: 47, category: "Safety", label: "Standby diver fully dressed and equipped for immediate deployment", regulatoryReference: "EM 385-1-1 §30-8.a(18); ENG FORM 6226 §G.4d; NDM Ch. 6 §6-9.3", itemType: "checkbox", isRequired: true },
      { sortOrder: 48, category: "Safety", label: "Standby diver gear tested for proper operation before primary diver leaves surface", regulatoryReference: "EM 385-1-1 §30-8.a(18)(c-1)", itemType: "checkbox", isRequired: true },
      { sortOrder: 49, category: "Safety", label: "Each diver continuously tended — one tender per diver", regulatoryReference: "EM 385-1-1 §30-8.c(5)(a); NDM Ch. 6 §6-9.2", itemType: "checkbox", isRequired: true },
      { sortOrder: 50, category: "Safety", label: "First aid kit meeting EM 385-1-1 Chapter 3 requirements on-site", regulatoryReference: "EM 385-1-1 §30-8.a(14)(a); ENG FORM 6226 §F.1", itemType: "checkbox", isRequired: true },
      { sortOrder: 51, category: "Safety", label: "Oxygen resuscitation system on-site — delivers O₂ for minimum 30 minutes at 15 LPM", regulatoryReference: "EM 385-1-1 §30-8.a(14)(b); ENG FORM 6226 §F.2", itemType: "checkbox", isRequired: true },
      { sortOrder: 52, category: "Safety", label: "Stokes litter or backboard with flotation and body straps on-site", regulatoryReference: "EM 385-1-1 §30-8.a(14)(c); ENG FORM 6226 §F.3", itemType: "checkbox", isRequired: true },
      { sortOrder: 53, category: "Safety", label: "Nearest recompression chamber identified — contact information posted", regulatoryReference: "EM 385-1-1 §30-8.c(3); NDM Ch. 21 §21-2", itemType: "checkbox", isRequired: true },
      { sortOrder: 54, category: "Safety", label: "Dive flags displayed — International Code 'A' and recreational, minimum 23 inches, ≥3 ft above water", regulatoryReference: "EM 385-1-1 §30-8.a(15); ENG FORM 6226 §F.4", itemType: "checkbox", isRequired: true },

      // ── Pre-Dive Checks ──
      { sortOrder: 55, category: "Pre-Dive Checks", label: "Lockout/tagout procedures followed — clearance holder identified and permit signed", regulatoryReference: "EM 385-1-1 §30-8.a(20); ENG FORM 6226 §G.7a", itemType: "checkbox", isRequired: true },
      { sortOrder: 56, category: "Pre-Dive Checks", label: "All diving equipment checked for proper function prior to diver entry", regulatoryReference: "EM 385-1-1 §30-8.a(9); ENG FORM 6226 §G.7e; NDM Ch. 6 Fig. 6-21 Sheet 3", itemType: "checkbox", isRequired: true },
      { sortOrder: 57, category: "Pre-Dive Checks", label: "Dive knife/cutting device secured and accessible on diver", regulatoryReference: "NDM Ch. 6 §6-5; EM 385-1-1 §30-8.c(5)", itemType: "checkbox", isRequired: true },
      { sortOrder: 58, category: "Pre-Dive Checks", label: "Vessel on two-point anchorage system (if diving from anchored vessel)", regulatoryReference: "EM 385-1-1 §30-8.a(16)", itemType: "checkbox", isRequired: false },

      // ── Dive Log Readiness ──
      { sortOrder: 59, category: "Dive Log", label: "Dive log forms on-site and ready to record: name, date, depth, bottom time, gas, decompression", regulatoryReference: "EM 385-1-1 §30-8.a(13); ENG FORM 6226 §G.8", itemType: "checkbox", isRequired: true },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SCUBA PRE-DIVE CHECKLIST
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — SCUBA Diving",
    description: "Pre-dive inspection for commercial SCUBA diving operations per Navy Dive Manual (NAVSEA SS521-AG-PRO-010) and USACE EM 385-1-1 Section 30.B.",
    roleScope: "all",
    items: [
      // ── Dive Planning & Conference ──
      { sortOrder: 1, category: "Dive Planning", label: "Dive Operations Plan accepted by DDC and on-site", regulatoryReference: "EM 385-1-1 §30-8.a(1); ENG FORM 6226 §A.1b", itemType: "checkbox", isRequired: true },
      { sortOrder: 2, category: "Dive Planning", label: "Activity Hazards Analysis (AHA) reviewed and signed", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §A.1c", itemType: "checkbox", isRequired: true },
      { sortOrder: 3, category: "Dive Planning", label: "Pre-dive conference conducted — mission, depth, time, task, emergency procedures reviewed", regulatoryReference: "EM 385-1-1 §30-8.a(8)–(9); NDM Ch. 6 §6-9.1", itemType: "checkbox", isRequired: true },
      { sortOrder: 4, category: "Dive Planning", label: "Depth confirmed ≤100 ft (SCUBA limit per EM 385-1-1)", regulatoryReference: "EM 385-1-1 §30-8.b(1)(a)", itemType: "checkbox", isRequired: true },
      { sortOrder: 5, category: "Dive Planning", label: "Dive within no-decompression limits — or recompression chamber on-site if outside NDL", regulatoryReference: "EM 385-1-1 §30-8.b(1)(b)", itemType: "checkbox", isRequired: true },
      { sortOrder: 6, category: "Dive Planning", label: "Current ≤1 knot confirmed (SCUBA limit)", regulatoryReference: "EM 385-1-1 §30-8.b(1)(c)", itemType: "checkbox", isRequired: true },
      { sortOrder: 7, category: "Dive Planning", label: "Visibility ≥3 ft — or line-tended with diver-to-surface two-way voice comms", regulatoryReference: "EM 385-1-1 §30-8.b(1)(f)", itemType: "checkbox", isRequired: true },
      { sortOrder: 8, category: "Dive Planning", label: "Not an enclosed/physically confining space (SCUBA prohibited)", regulatoryReference: "EM 385-1-1 §30-8.b(1)(d)", itemType: "checkbox", isRequired: true },
      { sortOrder: 9, category: "Dive Planning", label: "Diver has direct access to the surface confirmed", regulatoryReference: "EM 385-1-1 §30-8.b(1)(h)", itemType: "checkbox", isRequired: true },

      // ── Personnel ──
      { sortOrder: 10, category: "Personnel", label: "All dive team members have current CPR, first aid, and O₂ certifications", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §B.3a–c", itemType: "checkbox", isRequired: true },
      { sortOrder: 11, category: "Personnel", label: "Each diver has current 'Fit to Dive' physician statement", regulatoryReference: "EM 385-1-1 §30-8.a(9); ENG FORM 6226 §B.3d", itemType: "checkbox", isRequired: true },
      { sortOrder: 12, category: "Personnel", label: "Buddy/team assignments confirmed — untethered SCUBA divers in continuous visual contact", regulatoryReference: "EM 385-1-1 §30-8.b(2)(j)", itemType: "checkbox", isRequired: true },

      // ── SCUBA Equipment ──
      { sortOrder: 13, category: "SCUBA Equipment", label: "Primary SCUBA tank minimum 80 ft³ aluminum — pressurized to ≥2,700 PSI", regulatoryReference: "EM 385-1-1 §30-8.b(2)(a); NDM Ch. 7 §7-3", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "scuba_tank" },
      { sortOrder: 14, category: "SCUBA Equipment", label: "Bailout bottle minimum 30 ft³ — ≥90% working PSI, separate 1st and 2nd stage regulator (octopus NOT acceptable)", regulatoryReference: "EM 385-1-1 §30-8.b(2)(b)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "bailout" },
      { sortOrder: 15, category: "SCUBA Equipment", label: "Cylinders meet DOT 3AA (steel) or DOT 3AL (aluminum) specifications", regulatoryReference: "EM 385-1-1 §30-8.b(2)(c)(c-1)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "scuba_tank" },
      { sortOrder: 16, category: "SCUBA Equipment", label: "Cylinder identification symbols stamped into shoulder and hydrostatic test current", regulatoryReference: "EM 385-1-1 §30-8.b(2)(c)(c-2); ENG FORM 6226 §C.2b–c", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "scuba_tank" },
      { sortOrder: 17, category: "SCUBA Equipment", label: "Buoyancy compensation device (BCD) with manual inflation, oral inflation, and exhaust valve", regulatoryReference: "EM 385-1-1 §30-8.b(2)(d)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "bcd" },
      { sortOrder: 18, category: "SCUBA Equipment", label: "Submersible cylinder pressure gauge — readable by diver during dive", regulatoryReference: "EM 385-1-1 §30-8.b(2)(e)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 19, category: "SCUBA Equipment", label: "Weight belt or assembly with quick-release capability", regulatoryReference: "EM 385-1-1 §30-8.b(2)(f); NDM Ch. 7 §7-3", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 20, category: "SCUBA Equipment", label: "Depth gauge and dive knife equipped on diver", regulatoryReference: "EM 385-1-1 §30-8.b(2)(g); NDM Ch. 7 §7-3", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 21, category: "SCUBA Equipment", label: "Timekeeping device — both DS and diver have one", regulatoryReference: "EM 385-1-1 §30-8.b(2)(h)", itemType: "checkbox", isRequired: true },

      // ── Tethered/Untethered Specific ──
      { sortOrder: 22, category: "SCUBA Equipment", label: "Tethered diver: safety harness with positive buckle, attachment point, and lifting point — line-tended from surface", regulatoryReference: "EM 385-1-1 §30-8.b(2)(i)", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "harness" },

      // ── Safety ──
      { sortOrder: 23, category: "Safety", label: "Tethered standby diver at surface for each untethered buddy pair", regulatoryReference: "EM 385-1-1 §30-8.a(18)(a)", itemType: "checkbox", isRequired: true },
      { sortOrder: 24, category: "Safety", label: "First aid kit, O₂ resuscitation system (30 min at 15 LPM), and stokes litter on-site", regulatoryReference: "EM 385-1-1 §30-8.a(14); ENG FORM 6226 §F.1–3", itemType: "checkbox", isRequired: true },
      { sortOrder: 25, category: "Safety", label: "Dive flags displayed per EM 385-1-1 requirements", regulatoryReference: "EM 385-1-1 §30-8.a(15); ENG FORM 6226 §F.4", itemType: "checkbox", isRequired: true },
      { sortOrder: 26, category: "Safety", label: "Nearest recompression chamber identified and contact confirmed", regulatoryReference: "EM 385-1-1 §30-8.c(3); NDM Ch. 21 §21-2", itemType: "checkbox", isRequired: true },
      { sortOrder: 27, category: "Safety", label: "Diver will terminate dive and surface with minimum 500 PSI tank pressure", regulatoryReference: "EM 385-1-1 §30-8.b(2)(a) Note", itemType: "checkbox", isRequired: true },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MIXED GAS PRE-DIVE CHECKLIST
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "pre_dive",
    title: "Pre-Dive Checklist — Mixed Gas Diving",
    description: "Pre-dive inspection for mixed gas diving operations per Navy Dive Manual (NAVSEA SS521-AG-PRO-010) Chapter 15 and USACE EM 385-1-1 Section 30.",
    roleScope: "all",
    items: [
      // ── Dive Planning ──
      { sortOrder: 1, category: "Dive Planning", label: "Mixed gas dive plan approved by DDC — depth, gas mixtures, and decompression schedule reviewed", regulatoryReference: "EM 385-1-1 §30-8.c(1); NDM Ch. 15 §15-2", itemType: "checkbox", isRequired: true },
      { sortOrder: 2, category: "Dive Planning", label: "Activity Hazards Analysis (AHA) specific to mixed gas operations reviewed", regulatoryReference: "EM 385-1-1 §30-8.a(8); ENG FORM 6226 §A.1c", itemType: "checkbox", isRequired: true },
      { sortOrder: 3, category: "Dive Planning", label: "Pre-dive conference conducted — gas mixtures, switch depths, and emergency procedures briefed", regulatoryReference: "EM 385-1-1 §30-8.a(8)–(9); NDM Ch. 15 §15-4", itemType: "checkbox", isRequired: true },
      { sortOrder: 4, category: "Dive Planning", label: "Recompression chamber on-site, staffed, and immediately available", regulatoryReference: "EM 385-1-1 §30-8.c(3); NDM Ch. 15 §15-4; 29 CFR 1910.423", itemType: "checkbox", isRequired: true },
      { sortOrder: 5, category: "Dive Planning", label: "Decompression tables posted and verified for planned depth and gas mix", regulatoryReference: "NDM Ch. 15 §15-5; EM 385-1-1 §30-8.c(1)", itemType: "checkbox", isRequired: true },

      // ── Gas Supply & Analysis ──
      { sortOrder: 6, category: "Gas Supply", label: "Primary mixed gas supply verified — correct He/O₂ or N₂/O₂ ratio for planned depth", regulatoryReference: "NDM Ch. 15 §15-3; EM 385-1-1 §30-8.c(3)(c)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "gas_supply" },
      { sortOrder: 7, category: "Gas Supply", label: "Gas analysis performed and recorded — O₂ percentage within ±0.5% of planned mix", regulatoryReference: "NDM Ch. 15 §15-3; NDM Ch. 4 §4-4.1", itemType: "gas_analysis", isRequired: true },
      { sortOrder: 8, category: "Gas Supply", label: "Helium analysis performed and recorded (HeO₂ dives)", regulatoryReference: "NDM Ch. 15 §15-3", itemType: "gas_analysis", isRequired: false },
      { sortOrder: 9, category: "Gas Supply", label: "Decompression gas (O₂ or Nitrox) supply verified and analyzed", regulatoryReference: "NDM Ch. 15 §15-3; EM 385-1-1 §30-8.c(3)(c)", itemType: "gas_analysis", isRequired: true },
      { sortOrder: 10, category: "Gas Supply", label: "Oxygen meets MIL-PRF-27210 purity standard (≥99.5% by volume)", regulatoryReference: "EM 385-1-1 §30-8.c(3)(c); NDM Ch. 4 §4-4.2", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 11, category: "Gas Supply", label: "Bailout bottle charged with appropriate gas mix for depth", regulatoryReference: "EM 385-1-1 §30-8.c(5); NDM Ch. 15 §15-3", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "bailout" },
      { sortOrder: 12, category: "Gas Supply", label: "Gas switching manifold tested — correct gas routed to correct supply", regulatoryReference: "NDM Ch. 15 §15-3; EM 385-1-1 §30-8.c(2)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "gas_supply" },

      // ── Equipment ──
      { sortOrder: 13, category: "Equipment", label: "Diving helmet inspected — communications, demand valve, free-flow tested", regulatoryReference: "NDM Ch. 6 Fig. 6-21; EM 385-1-1 §30-8.c(2)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },
      { sortOrder: 14, category: "Equipment", label: "Umbilical inspected full length — gas hoses, pneumo, comms, and strength member verified", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "umbilical" },
      { sortOrder: 15, category: "Equipment", label: "Pneumofathometer connected and calibrated — depth reading verified", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 16, category: "Equipment", label: "Two-way voice communications tested — clear audio", regulatoryReference: "EM 385-1-1 §30-8.c(5); NDM Ch. 6 §6-7.5", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 17, category: "Equipment", label: "Safety harness with lifting point — keeps diver head-up when unconscious", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.6", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "harness" },
      { sortOrder: 18, category: "Equipment", label: "Hot water suit system operational (if required for depth/temperature)", regulatoryReference: "NDM Ch. 15 §15-3; NDM Ch. 6 §6-5", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "exposure_suit" },

      // ── Chamber & Safety ──
      { sortOrder: 19, category: "Safety", label: "Chamber operator trained and sole-purpose during decompression operations", regulatoryReference: "EM 385-1-1 §30-8.a(19); 29 CFR 1910.423", itemType: "checkbox", isRequired: true },
      { sortOrder: 20, category: "Safety", label: "Sufficient O₂ available to complete all chamber treatment tables", regulatoryReference: "EM 385-1-1 §30-8.c(3)(c); NDM Ch. 21 §21-4", itemType: "checkbox", isRequired: true },
      { sortOrder: 21, category: "Safety", label: "Chamber operator can communicate with diving physician", regulatoryReference: "EM 385-1-1 §30-8.a(19)(b)", itemType: "checkbox", isRequired: true },
      { sortOrder: 22, category: "Safety", label: "Standby diver fully dressed and equipped for immediate deployment", regulatoryReference: "EM 385-1-1 §30-8.a(18); NDM Ch. 6 §6-9.3", itemType: "checkbox", isRequired: true },
      { sortOrder: 23, category: "Safety", label: "First aid kit, O₂ resuscitation system, and stokes litter on-site", regulatoryReference: "EM 385-1-1 §30-8.a(14); ENG FORM 6226 §F.1–3", itemType: "checkbox", isRequired: true },
      { sortOrder: 24, category: "Safety", label: "All dive team members briefed on CNS and pulmonary O₂ toxicity symptoms", regulatoryReference: "NDM Ch. 3 §3-9.3; NDM Ch. 15 §15-4", itemType: "checkbox", isRequired: true },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // POST-DIVE CHECKLIST — DIVER CONDITION
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "post_dive",
    title: "Post-Dive Checklist — Diver Condition Assessment",
    description: "Post-dive diver condition assessment per Navy Dive Manual and USACE EM 385-1-1 Section 30 post-dive briefing requirements.",
    roleScope: "supervisor",
    items: [
      { sortOrder: 1, category: "Post-Dive Brief", label: "Post-dive briefing conducted with entire dive team", regulatoryReference: "EM 385-1-1 §30-8.a(10); NDM Ch. 6 §6-9.4", itemType: "checkbox", isRequired: true },
      { sortOrder: 2, category: "Post-Dive Brief", label: "Location of nearest recompression chamber communicated to all divers", regulatoryReference: "EM 385-1-1 §30-8.a(10)(a); ENG FORM 6226 §H.1a", itemType: "checkbox", isRequired: true },
      { sortOrder: 3, category: "Post-Dive Brief", label: "DAN emergency hotline number and local dive medical facility communicated", regulatoryReference: "EM 385-1-1 §30-8.a(10)(a); ENG FORM 6226 §H.1a", itemType: "checkbox", isRequired: true },
      { sortOrder: 4, category: "Post-Dive Brief", label: "Post-dive activity limitations briefed — repetitive dives, altitude, and flying restrictions", regulatoryReference: "EM 385-1-1 §30-8.a(10)(a)–(b); ENG FORM 6226 §H.1b", itemType: "checkbox", isRequired: true },
      { sortOrder: 5, category: "Post-Dive Brief", label: "12-hour no-fly rule communicated (24 hours after multiple days of repetitive dives)", regulatoryReference: "EM 385-1-1 §30-8.a(10)(b); NDM Ch. 9 §9-11", itemType: "checkbox", isRequired: true },
      { sortOrder: 6, category: "Post-Dive Brief", label: "Location and phone number of nearest hospital capable of treating dive injuries communicated", regulatoryReference: "EM 385-1-1 §30-8.a(10); ENG FORM 6226 §H.1c", itemType: "checkbox", isRequired: true },
      { sortOrder: 7, category: "Post-Dive Brief", label: "Emergency victim transport plan and phone numbers reviewed", regulatoryReference: "EM 385-1-1 §30-8.a(10); ENG FORM 6226 §H.1e", itemType: "checkbox", isRequired: true },
      { sortOrder: 8, category: "Post-Dive Brief", label: "Diver rescue procedures reviewed — team responsibilities, extraction points, first aid locations", regulatoryReference: "ENG FORM 6226 §H.1g", itemType: "checkbox", isRequired: true },

      // ── Diver Physical Assessment ──
      { sortOrder: 9, category: "Diver Condition", label: "Diver reports no joint pain, numbness, tingling, or unusual fatigue", description: "Screen for decompression sickness (DCS) Type I and Type II symptoms.", regulatoryReference: "NDM Ch. 20 §20-3; EM 385-1-1 §30-8.a(10)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 10, category: "Diver Condition", label: "Diver reports no skin rash, itching, or mottling", description: "Screen for cutaneous DCS symptoms.", regulatoryReference: "NDM Ch. 20 §20-3.2", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 11, category: "Diver Condition", label: "Diver reports no visual disturbances, dizziness, or difficulty breathing", description: "Screen for Type II DCS and arterial gas embolism symptoms.", regulatoryReference: "NDM Ch. 20 §20-3.3; NDM Ch. 3 §3-9", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 12, category: "Diver Condition", label: "Diver reports no ear pain, sinus pain, or hearing changes", description: "Screen for barotrauma symptoms.", regulatoryReference: "NDM Ch. 3 §3-8; NDM Ch. 20 §20-2", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 13, category: "Diver Condition", label: "Diver core temperature and hydration status assessed — no signs of hypothermia or heat stress", regulatoryReference: "NDM Ch. 3 §3-10; EM 385-1-1 §30-8.a(10)", itemType: "pass_fail_flag", isRequired: true },

      // ── DCS Documentation ──
      { sortOrder: 14, category: "DCS Documentation", label: "If DCS suspected: signs, symptoms, depth and time of onset recorded", regulatoryReference: "EM 385-1-1 §30-8.a(13)(m); ENG FORM 6226 §H.2", itemType: "checkbox", isRequired: false },
      { sortOrder: 15, category: "DCS Documentation", label: "If DCS suspected: treatment description and results recorded", regulatoryReference: "EM 385-1-1 §30-8.a(13)(m-2)", itemType: "checkbox", isRequired: false },

      // ── Dive Log Completion ──
      { sortOrder: 16, category: "Dive Log", label: "Dive log completed — name, date, location, max depth, bottom time, gas, decompression stops", regulatoryReference: "EM 385-1-1 §30-8.a(13); ENG FORM 6226 §G.8", itemType: "checkbox", isRequired: true },
      { sortOrder: 17, category: "Dive Log", label: "Dive log copies submitted to DDC and placed in project file", regulatoryReference: "EM 385-1-1 §30-8.a(12); ENG FORM 6226 §H.3", itemType: "checkbox", isRequired: true },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // POST-DIVE CHECKLIST — EQUIPMENT CONDITION
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "post_dive",
    title: "Post-Dive Checklist — Equipment Condition",
    description: "Post-dive equipment inspection and maintenance per Navy Dive Manual maintenance schedules and USACE EM 385-1-1 equipment standards.",
    roleScope: "tender",
    items: [
      { sortOrder: 1, category: "Helmet/Mask", label: "Helmet/mask rinsed with fresh water — no salt or debris buildup", regulatoryReference: "NDM Ch. 6 §6-6 (Maintenance); EM 385-1-1 §30-8.c(2)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },
      { sortOrder: 2, category: "Helmet/Mask", label: "Demand regulator and free-flow valve inspected — no damage or fouling", regulatoryReference: "NDM Ch. 6 §6-6 (Maintenance)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "helmet" },
      { sortOrder: 3, category: "Helmet/Mask", label: "Communication system post-dive function check — no water intrusion", regulatoryReference: "NDM Ch. 6 §6-7.5; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 4, category: "Umbilical", label: "Umbilical inspected for new damage — cuts, kinks, abrasion, or connector damage", regulatoryReference: "NDM Ch. 6 §6-6 (Maintenance); EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "umbilical" },
      { sortOrder: 5, category: "Umbilical", label: "Umbilical hose ends capped/closed when not in use", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.4d", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "umbilical" },
      { sortOrder: 6, category: "Harness/Suit", label: "Safety harness inspected — buckles, straps, and attachment points intact", regulatoryReference: "NDM Ch. 6 §6-6 (Maintenance); EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "harness" },
      { sortOrder: 7, category: "Harness/Suit", label: "Exposure suit inspected for tears, punctures, or seal damage", regulatoryReference: "NDM Ch. 6 §6-5; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "exposure_suit" },
      { sortOrder: 8, category: "Bailout", label: "Bailout bottle pressure recorded — recharged if below 90% working PSI", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.1d", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "bailout" },
      { sortOrder: 9, category: "Air Supply", label: "Compressor/HP bank secured — filters and sorbent beds status noted", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7c", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 10, category: "Tools", label: "All tools and equipment accounted for and inspected", regulatoryReference: "NDM Ch. 6 §6-6 (Maintenance)", itemType: "pass_fail_flag", isRequired: true },
      { sortOrder: 11, category: "Deficiency Log", label: "Any deficiencies or damage documented in equipment log for corrective action", regulatoryReference: "EM 385-1-1 §30-8.a(12); NDM Ch. 6 §6-6", itemType: "text_input", isRequired: false },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EQUIPMENT INSPECTION — DIVE STATION
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Dive Station",
    description: "Periodic dive station equipment inspection per Navy Dive Manual maintenance schedules and USACE EM 385-1-1 Section 30 equipment requirements.",
    roleScope: "supervisor",
    items: [
      { sortOrder: 1, category: "Air Compressor", label: "Air compressor operational — oil level, belts, and cooling system checked", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7; NDM Ch. 6 §6-7.3", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 2, category: "Air Compressor", label: "Compressor intake positioned away from exhaust and contaminant sources", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7a", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 3, category: "Air Compressor", label: "High-temperature, equipment failure, and CO monitoring alarms functional (oil-lubricated)", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7d", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 4, category: "Air Compressor", label: "Dive supervisor can see and/or hear compressor alarms from dive control station", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7e", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 5, category: "Air Compressor", label: "In-line regulators, sorbent beds, and filters — service date current", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7c", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 6, category: "Air Compressor", label: "Six-month air purity test results current and available", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7h", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "compressor" },
      { sortOrder: 7, category: "HP Air Bank", label: "HP air bank — pressure verified, certification current, secured properly", regulatoryReference: "EM 385-1-1 §30-8.c(5); NDM Ch. 6 §6-7.3", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "air_bank" },
      { sortOrder: 8, category: "Volume Tank", label: "Volume tank — check valve, pressure gauge, relief valve, and drain valve all functional", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7b", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "volume_tank" },
      { sortOrder: 9, category: "Dive Control Panel", label: "Dive control panel — all gauges calibrated and within certification period", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7f", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "control_panel" },
      { sortOrder: 10, category: "Dive Control Panel", label: "Calibration records maintained and available for inspection", regulatoryReference: "EM 385-1-1 §30-8.c(7); ENG FORM 6226 §C.7g", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "control_panel" },
      { sortOrder: 11, category: "Decompression Chamber", label: "Recompression chamber operational — pressure test current, O₂ supply verified", regulatoryReference: "EM 385-1-1 §30-8.a(19); 29 CFR 1910.423; NDM Ch. 21 §21-4", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "chamber" },
      { sortOrder: 12, category: "Rigging", label: "Crane/winch inspected and load-tested per EM 385-1-1 Chapter 16", regulatoryReference: "EM 385-1-1 §30-8.a(23); EM 385-1-1 Ch. 16", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "crane" },
      { sortOrder: 13, category: "Rigging", label: "Diver stage/basket inspected — safety line independent of main lift", regulatoryReference: "EM 385-1-1 §30-8.a(23); NDM Ch. 6 §6-8", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "stage" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EQUIPMENT INSPECTION — COMMUNICATIONS
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Communications Systems",
    description: "Communications equipment inspection per Navy Dive Manual and USACE EM 385-1-1 Section 30 voice communications requirements.",
    roleScope: "tender",
    items: [
      { sortOrder: 1, category: "Primary Comms", label: "Primary two-way voice communication system tested — clear audio in both directions", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.3a; NDM Ch. 6 §6-7.5", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 2, category: "Primary Comms", label: "External speaker on topside unit functional and audible at dive station", regulatoryReference: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.3a (required external speaker)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 3, category: "Primary Comms", label: "Helmet/mask earphone and microphone — no distortion, feedback, or water damage", regulatoryReference: "NDM Ch. 6 §6-7.5; EM 385-1-1 §30-8.c(2)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 4, category: "Primary Comms", label: "Communication cable in umbilical — no breaks, splices inspected, connectors tight", regulatoryReference: "NDM Ch. 6 §6-7.5; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 5, category: "Backup Comms", label: "Backup communication method available and tested (line-pull signals or secondary system)", regulatoryReference: "NDM Ch. 6 §6-7.5; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 6, category: "Backup Comms", label: "Line-pull signal chart posted at dive station (if line-pull is backup method)", regulatoryReference: "NDM Ch. 6 §6-9.2; EM 385-1-1 §30-8.c(5)", itemType: "checkbox", isRequired: true, equipmentCategory: "communications" },
      { sortOrder: 7, category: "Recording", label: "Communication recording system operational (if equipped)", regulatoryReference: "NDM Ch. 6 §6-7.5", itemType: "pass_fail_flag", isRequired: false, equipmentCategory: "communications" },
      { sortOrder: 8, category: "Power", label: "Communication system power supply — battery level or AC power verified", regulatoryReference: "NDM Ch. 6 §6-7.5; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "communications" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EQUIPMENT INSPECTION — PNEUMOFATHOMETER
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Pneumofathometer",
    description: "Pneumofathometer inspection and calibration per Navy Dive Manual and USACE EM 385-1-1 depth monitoring requirements.",
    roleScope: "tender",
    items: [
      { sortOrder: 1, category: "Pneumo Gauge", label: "Pneumofathometer gauge reads zero at surface — calibrated", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2; NDM Ch. 6 §6-7.4", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 2, category: "Pneumo Gauge", label: "Gauge face clean and readable — no fogging, cracking, or needle sticking", regulatoryReference: "NDM Ch. 6 §6-7.4", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 3, category: "Pneumo Hose", label: "Pneumo hose in umbilical — no kinks, blockages, or leaks", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 4, category: "Pneumo Hose", label: "Pneumo hose connection at helmet/mask secure and watertight", regulatoryReference: "NDM Ch. 6 Fig. 6-21 Sheet 2", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 5, category: "Calibration", label: "Depth reading verified against known depth or secondary depth measurement", regulatoryReference: "NDM Ch. 6 §6-7.4; EM 385-1-1 §30-8.c(5)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
      { sortOrder: 6, category: "Calibration", label: "Pneumo air supply valve operational — can be opened and closed smoothly", regulatoryReference: "NDM Ch. 6 §6-7.4", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "pneumo" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EQUIPMENT INSPECTION — VIDEO SYSTEMS
  // ══════════════════════════════════════════════════════════════════════════
  {
    checklistType: "equipment",
    title: "Equipment Inspection — Video Systems",
    description: "Underwater video system inspection for dive operations documentation and monitoring.",
    roleScope: "tender",
    items: [
      { sortOrder: 1, category: "Camera", label: "Camera housing inspected — no cracks, O-ring seals lubricated and seated", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 2, category: "Camera", label: "Camera power — battery charged or external power supply verified", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 3, category: "Camera", label: "Camera lens clean — no scratches or fogging on viewport", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 4, category: "Lighting", label: "Underwater lights operational — output adequate for visibility conditions", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 5, category: "Cable/Transmission", label: "Video cable inspected — no damage, connectors watertight", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 6, category: "Topside Monitor", label: "Topside monitor receiving clear video signal — color and focus verified", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 7, category: "Recording", label: "Video recording system operational — storage capacity sufficient for planned dive", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
      { sortOrder: 8, category: "Mounting", label: "Camera mounting bracket secure on helmet or handheld grip functional", regulatoryReference: "NDM Ch. 6 §6-7 (Ancillary Equipment)", itemType: "pass_fail_flag", isRequired: true, equipmentCategory: "video" },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// SAFETY MEETING TOPIC LIBRARY
// ────────────────────────────────────────────────────────────────────────────

export const SAFETY_TOPICS: Omit<InsertSafetyTopic, "isActive">[] = [
  {
    category: "entanglement",
    title: "Diver Entanglement Prevention and Response",
    description: "Procedures for preventing and responding to diver entanglement in lines, cables, debris, or fishing nets during underwater operations.",
    talkingPoints: [
      "Pre-dive survey of work area for entanglement hazards — lines, cables, nets, debris",
      "Diver carries cutting device accessible with either hand per NDM Ch. 6 §6-5",
      "Umbilical management — tender maintains proper tension and slack control",
      "If entangled: stop, assess, communicate with surface, methodically free yourself",
      "Standby diver deployment procedures for entanglement emergency",
      "Never pull blindly on umbilical — may worsen entanglement",
      "Post-incident reporting and lessons learned documentation",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["NDM Ch. 6 §6-9.3 (Emergency Procedures)", "EM 385-1-1 §30-8.a(9)(f)", "ADCI Consensus Standards §5.0"],
  },
  {
    category: "loss_of_gas",
    title: "Loss of Breathing Gas — Emergency Procedures",
    description: "Emergency response procedures for partial or complete loss of breathing gas supply during diving operations.",
    talkingPoints: [
      "Three sources of air required for SSA operations per EM 385-1-1 §30-8.c(5)",
      "Bailout bottle activation — diver must be able to turn on immediately (ENG FORM 6226 §C.1c)",
      "Reserve air supply must be integral or in-line with primary supply",
      "Diver signals loss of air to surface — tender and DS respond immediately",
      "Controlled ascent procedures — never hold breath during emergency ascent",
      "Compressor failure response — switch to HP bank, deploy standby diver if needed",
      "Post-incident: inspect all gas supply components, document failure mode",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["EM 385-1-1 §30-8.c(5)", "ENG FORM 6226 §C.1a–d", "NDM Ch. 6 §6-9.3", "NDM Ch. 15 §15-6 (Mixed Gas Emergency)"],
  },
  {
    category: "communications_failure",
    title: "Communications Failure — Response Procedures",
    description: "Procedures for responding to loss of voice communications between diver and surface during diving operations.",
    talkingPoints: [
      "All dives shall be terminated if voice communications are lost (EM 385-1-1 §30-8.c(5); ENG FORM 6226 §G.4a)",
      "Backup communication method must be verified before every dive",
      "Line-pull signals — standard signals posted at dive station (NDM Ch. 6 §6-9.2)",
      "Tender maintains physical contact with umbilical at all times to detect line-pull signals",
      "If comms lost: diver signals via line-pull, prepares for controlled ascent",
      "DS assesses situation — may deploy standby diver with working comms",
      "Post-incident: troubleshoot comms system before resuming operations",
    ],
    applicableDiveTypes: ["SSA", "Mixed Gas"],
    regulatoryReferences: ["EM 385-1-1 §30-8.c(5)", "ENG FORM 6226 §G.4a", "NDM Ch. 6 §6-7.5", "NDM Ch. 6 §6-9.2"],
  },
  {
    category: "hypothermia",
    title: "Hypothermia Prevention and Recognition",
    description: "Prevention, recognition, and treatment of hypothermia during diving operations in cold water environments.",
    talkingPoints: [
      "Water conducts heat 25x faster than air — hypothermia risk exists even in moderate temperatures",
      "Appropriate exposure protection required per water temperature (NDM Ch. 3 §3-10; EM 385-1-1 §30-8.c(5))",
      "Hot water suit systems for extended deep dives or cold water operations",
      "Signs of hypothermia: shivering, confusion, slurred speech, loss of dexterity",
      "Diver must report cold stress to surface immediately — DS may terminate dive",
      "Post-dive: warm fluids, dry clothing, monitor for delayed symptoms",
      "Maximum dive time limits based on water temperature per NDM tables",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["NDM Ch. 3 §3-10 (Thermal Protection)", "EM 385-1-1 §30-8.c(5)", "ENG FORM 6226 §C.5"],
  },
  {
    category: "barotrauma",
    title: "Barotrauma Prevention and Recognition",
    description: "Prevention, recognition, and treatment of pressure-related injuries including ear, sinus, and pulmonary barotrauma.",
    talkingPoints: [
      "Equalize early and often during descent — never force equalization",
      "Do not dive with upper respiratory infection or congestion",
      "Ear barotrauma: pain, fullness, hearing loss — stop descent, attempt equalization, ascend if unable",
      "Sinus barotrauma: facial pain, nosebleed — ascend slowly",
      "Pulmonary barotrauma: most serious — never hold breath during ascent",
      "Arterial gas embolism (AGE) symptoms: sudden unconsciousness, neurological deficits after surfacing",
      "Treatment: 100% O₂, position of comfort, immediate recompression per NDM treatment tables",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["NDM Ch. 3 §3-8 (Barotrauma)", "NDM Ch. 20 §20-2 (Diagnosis)", "NDM Ch. 21 §21-4 (Treatment)"],
  },
  {
    category: "equipment_failure",
    title: "Diving Equipment Failure — Emergency Response",
    description: "Emergency procedures for equipment failures including helmet flooding, regulator malfunction, and umbilical damage.",
    talkingPoints: [
      "All equipment must be type specifically designed for diving support systems (EM 385-1-1 §30-8.c(2))",
      "Helmet flooding: switch to bailout, signal surface, controlled ascent",
      "Regulator malfunction: switch to free-flow, activate bailout if needed",
      "Umbilical damage: assess severity, switch to bailout, signal for standby diver",
      "Harness failure: maintain positive buoyancy, signal surface immediately",
      "All equipment checked for proper function before every dive (ENG FORM 6226 §G.7e)",
      "Defective equipment must be tagged out and removed from service immediately",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["EM 385-1-1 §30-8.c(2)", "ENG FORM 6226 §G.7e", "NDM Ch. 6 §6-9.3 (Emergency Procedures)"],
  },
  {
    category: "weather_current",
    title: "Weather and Current Hazard Management",
    description: "Procedures for monitoring and responding to weather changes and current conditions during diving operations.",
    talkingPoints: [
      "Current velocity must be assessed before every dive — SCUBA prohibited above 1 knot (EM 385-1-1 §30-8.b(1)(c))",
      "Weather conditions briefed during pre-dive conference (ENG FORM 6226 §G.3h–j)",
      "Continuous weather monitoring during dive operations — DS authority to terminate",
      "Lightning within 10 miles — all water operations cease immediately",
      "Tidal current changes — plan dives around slack water when possible",
      "Live boating requires DDC acceptance (EM 385-1-1 §30-8.a(5))",
      "Vessel anchoring: two-point anchorage required for SSA from anchored vessels",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["EM 385-1-1 §30-8.b(1)(c)", "EM 385-1-1 §30-8.a(5)", "EM 385-1-1 §30-8.a(16)", "ENG FORM 6226 §G.3h–j"],
  },
  {
    category: "crane_operations",
    title: "Crane Operations Near Divers",
    description: "Safety procedures for crane and lifting operations conducted in support of diving operations.",
    talkingPoints: [
      "All crane operations supporting diving per EM 385-1-1 Chapter 16",
      "Working dives requiring crane communication MUST be in SSA mode (EM 385-1-1 §30-8.a(23)(a))",
      "Crane operator takes instruction from tender/supervisor in direct comms with diver",
      "Crane operations with diver underwater are Critical Lifts — diver participates in Critical Lift Plan",
      "Divers performing rigging must be qualified riggers per EM 385-1-1 Chapter 15",
      "Never position diver under suspended load",
      "Clear communication protocol between diver, tender, and crane operator before operations",
    ],
    applicableDiveTypes: ["SSA"],
    regulatoryReferences: ["EM 385-1-1 §30-8.a(23)", "EM 385-1-1 Ch. 16 (Cranes)", "EM 385-1-1 Ch. 15 (Rigging)", "ENG FORM 6226 §G.7b"],
  },
  {
    category: "cutting_welding",
    title: "Underwater Cutting and Welding Safety",
    description: "Safety procedures for underwater welding and burning operations per Navy Underwater Cutting and Welding Manual.",
    talkingPoints: [
      "Underwater welding and burning limited to SSA mode ONLY (EM 385-1-1 §30-8.a(24)(a))",
      "Equipment per Navy Underwater Cutting and Welding Manual S0300-BB-MAN-010",
      "Diver must wear rubber or neoprene dive suit providing electrical insulation (EM 385-1-1 §30-8.a(24)(c-1))",
      "Insulating gloves with cuff covering wrist minimum (EM 385-1-1 §30-8.a(24)(c-2))",
      "Welding/burning eye shield on helmet with appropriate shade (EM 385-1-1 §30-8.a(24)(c-3))",
      "Electrode/rod de-energized at surface before placed in or retrieved from water",
      "Fire watch maintained topside — monitor for gas accumulation",
    ],
    applicableDiveTypes: ["SSA"],
    regulatoryReferences: ["EM 385-1-1 §30-8.a(24)", "EM 385-1-1 Ch. 10 (Welding)", "S0300-BB-MAN-010 (Navy Cutting/Welding Manual)", "ENG FORM 6226 §G.7c"],
  },
  {
    category: "confined_space",
    title: "Confined Space Diving Operations",
    description: "Safety procedures for diving in enclosed or physically confining spaces such as pipelines, tanks, and intakes.",
    talkingPoints: [
      "SCUBA diving prohibited in enclosed or physically confining spaces (EM 385-1-1 §30-8.b(1)(d))",
      "SSA mode required for all confined space diving operations",
      "Underwater tender/diver stationed at underwater point of entry (ENG FORM 6226 §G.4c)",
      "Lockout/tagout of all systems that could create flow, pressure, or mechanical hazards",
      "Verify no pressure differentials exist — all potential leaks eliminated",
      "Emergency extraction plan specific to confined space geometry",
      "Additional standby diver may be required based on AHA",
      "Continuous communication mandatory — no exceptions",
    ],
    applicableDiveTypes: ["SSA"],
    regulatoryReferences: ["EM 385-1-1 §30-8.b(1)(d)", "EM 385-1-1 Ch. 34 (Confined Spaces)", "ENG FORM 6226 §G.4c", "29 CFR 1910.146"],
  },
  {
    category: "contaminated_water",
    title: "Contaminated Water Diving Operations",
    description: "Safety procedures for diving in polluted or chemically contaminated water environments.",
    talkingPoints: [
      "Diving in contaminated water prohibited unless supporting documentation demonstrates adequate safety measures (EM 385-1-1 §30-8.a(22))",
      "Personnel must be specifically trained for contaminated water diving",
      "Identify contaminants before diving — obtain water quality data and SDS",
      "Minimum protection: vulcanized drysuit with sealed gloves, boots, and full-face helmet",
      "No skin exposure — all suit penetrations sealed",
      "Three-stage decontamination station set up before dive operations begin",
      "Post-dive health monitoring for all exposed personnel",
      "Medical surveillance program required for recurring contaminated water operations",
    ],
    applicableDiveTypes: ["SSA"],
    regulatoryReferences: ["EM 385-1-1 §30-8.a(22)", "29 CFR 1910.120 (HAZWOPER)", "ADCI Consensus Standards §8.0"],
  },
  {
    category: "general",
    title: "Decompression Sickness — Recognition and Response",
    description: "Recognition and emergency response procedures for decompression sickness (DCS) Type I and Type II.",
    talkingPoints: [
      "Type I DCS: joint pain (bends), skin rash, itching, mottling",
      "Type II DCS: neurological symptoms — numbness, weakness, paralysis, visual disturbances, difficulty breathing",
      "Onset may be immediate or delayed up to 24 hours after surfacing",
      "Immediate treatment: 100% O₂ at 15 LPM, position of comfort, transport to recompression chamber",
      "Divers must remain within 60 minutes of recompression chamber for 2 hours after decompression dive (EM 385-1-1 §30-8.a(19)(c))",
      "Record all symptoms: description, depth and time of onset, treatment and results",
      "Contact DAN emergency hotline and/or diving physician immediately",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["NDM Ch. 20 §20-3 (DCS Diagnosis)", "NDM Ch. 21 §21-4 (Treatment Tables)", "EM 385-1-1 §30-8.a(13)(m)", "EM 385-1-1 §30-8.a(19)(c)"],
  },
  {
    category: "general",
    title: "Oxygen Toxicity — CNS and Pulmonary",
    description: "Recognition and prevention of central nervous system (CNS) and pulmonary oxygen toxicity during mixed gas and oxygen decompression operations.",
    talkingPoints: [
      "CNS O₂ toxicity: convulsions, visual disturbances, tinnitus, nausea, twitching, dizziness (VENTID-C mnemonic)",
      "Pulmonary O₂ toxicity: chest tightness, cough, burning sensation — from prolonged O₂ exposure",
      "Monitor O₂ exposure using CNS clock and OTU calculations per NDM tables",
      "Never exceed maximum PO₂ limits for the planned dive profile",
      "If symptoms occur: switch to air/back gas, notify surface, controlled ascent",
      "O₂ breaks during decompression to reduce pulmonary toxicity risk",
      "All team members briefed on O₂ toxicity symptoms before mixed gas operations",
    ],
    applicableDiveTypes: ["Mixed Gas", "SSA"],
    regulatoryReferences: ["NDM Ch. 3 §3-9.3 (O₂ Toxicity)", "NDM Ch. 15 §15-4", "EM 385-1-1 §30-8.c(3)(c)"],
  },
  {
    category: "general",
    title: "Lockout/Tagout Procedures for Dive Operations",
    description: "Lockout/tagout (LOTO) procedures to control hazardous energy sources before and during diving operations.",
    talkingPoints: [
      "LOTO procedures must be followed before diver enters water (ENG FORM 6226 §G.7a)",
      "Clearance holder identified and clearance/permit signed before dive",
      "All potential energy sources identified: hydraulic, pneumatic, electrical, mechanical, gravity",
      "Verify isolation — attempt to start/energize after lockout to confirm zero energy",
      "Each diver and authorized worker applies their own lock",
      "LOTO removal only by the person who applied it — or with documented override procedure",
      "Particular attention to intakes, valves, gates, and pumps near dive site",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["EM 385-1-1 §30-8.a(20)", "ENG FORM 6226 §G.7a", "29 CFR 1910.147 (LOTO Standard)"],
  },
  {
    category: "general",
    title: "Standby Diver Readiness and Deployment",
    description: "Requirements and procedures for standby diver readiness, equipment, and emergency deployment.",
    talkingPoints: [
      "Standby diver required whenever a diver is in the water (EM 385-1-1 §30-8.a(18))",
      "Standby diver fully equipped and gear tested before primary diver leaves surface",
      "Standby diver must not assume other work responsibilities (EM 385-1-1 §30-8.a(18)(c-2))",
      "Standby diver deploys only after DS assesses situation and gives direction (EM 385-1-1 §30-8.a(18)(b))",
      "Standby diver dressed for water and air temperature — heat/cold stress mitigation measures in AHA",
      "If staging area prevents safe immediate entry, standby diver positioned in water at surface",
      "Untethered SCUBA: one tethered standby diver at surface for each buddy pair",
    ],
    applicableDiveTypes: ["SSA", "SCUBA", "Mixed Gas"],
    regulatoryReferences: ["EM 385-1-1 §30-8.a(18)", "ENG FORM 6226 §G.4d", "NDM Ch. 6 §6-9.3"],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// JHA HAZARD LIBRARY — Common commercial diving hazards
// ────────────────────────────────────────────────────────────────────────────

export const JHA_HAZARDS: Omit<InsertJhaHazard, "isActive">[] = [
  {
    category: "environmental",
    hazard: "Strong currents exceeding operational limits",
    description: "Water currents can exceed safe operational limits, increasing diver workload, causing loss of position, umbilical entanglement, and inability to maintain work site.",
    defaultRiskLevel: "high",
    standardControls: [
      "Measure current velocity before every dive — SCUBA prohibited above 1 knot",
      "Plan dives around slack water periods when possible",
      "Use current deflectors or shields at the work site",
      "Increase umbilical management — additional tending personnel if needed",
      "DS authority to terminate dive if conditions deteriorate",
    ],
    requiredPpe: ["Full exposure suit", "Safety harness with tether"],
    applicableOperations: ["All underwater operations in tidal or river environments"],
    regulatoryBasis: "EM 385-1-1 §30-8.b(1)(c); ENG FORM 6226 §G.3i",
  },
  {
    category: "environmental",
    hazard: "Low/zero visibility underwater conditions",
    description: "Reduced visibility from turbidity, silt, or darkness increases risk of disorientation, entanglement, and inability to identify hazards.",
    defaultRiskLevel: "high",
    standardControls: [
      "SCUBA prohibited in visibility less than 3 ft unless line-tended with two-way voice comms",
      "SSA mode preferred for all low-visibility operations",
      "Diver maintains contact with umbilical and reference line at all times",
      "Underwater lighting deployed when available",
      "Reduced work scope and increased communication frequency in zero-vis",
    ],
    requiredPpe: ["Full-face helmet with communications", "Safety harness with tether"],
    applicableOperations: ["All underwater operations"],
    regulatoryBasis: "EM 385-1-1 §30-8.b(1)(f); NDM Ch. 6 §6-9",
  },
  {
    category: "environmental",
    hazard: "Cold water exposure — hypothermia risk",
    description: "Extended exposure to cold water causes progressive hypothermia, reducing diver cognitive function, dexterity, and physical capability.",
    defaultRiskLevel: "high",
    standardControls: [
      "Appropriate thermal protection for water temperature — drysuit, hot water suit as needed",
      "Maximum dive time limits based on water temperature per NDM tables",
      "Diver reports cold stress symptoms immediately — DS may terminate dive",
      "Post-dive warming procedures — warm fluids, dry clothing, shelter",
      "Monitor diver for delayed hypothermia symptoms",
    ],
    requiredPpe: ["Appropriate exposure suit per water temperature", "Gloves", "Booties", "Hood"],
    applicableOperations: ["All cold water operations"],
    regulatoryBasis: "NDM Ch. 3 §3-10; EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.5",
  },
  {
    category: "physiological",
    hazard: "Decompression sickness (DCS)",
    description: "Dissolved inert gas forms bubbles in tissues during ascent, causing joint pain (Type I) or neurological symptoms (Type II) that can be life-threatening.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Strict adherence to decompression tables — no shortcuts or omissions",
      "Recompression chamber on-site for all dives outside NDL or deeper than 100 ft",
      "Divers remain within 60 minutes of chamber for 2 hours after decompression dive",
      "100% O₂ available for immediate treatment — minimum 30 minutes at 15 LPM",
      "12-hour no-fly rule (24 hours after multiple days of repetitive dives)",
      "Record all symptoms: depth, time of onset, description, treatment results",
    ],
    requiredPpe: [],
    applicableOperations: ["All diving operations"],
    regulatoryBasis: "NDM Ch. 20 §20-3; NDM Ch. 21 §21-4; EM 385-1-1 §30-8.a(19)(c); EM 385-1-1 §30-8.a(10)(b)",
  },
  {
    category: "physiological",
    hazard: "Barotrauma — ear, sinus, and pulmonary",
    description: "Pressure changes during descent and ascent can cause injury to air-filled spaces including ears, sinuses, and lungs.",
    defaultRiskLevel: "high",
    standardControls: [
      "Equalize early and often during descent — never force equalization",
      "Do not dive with upper respiratory infection or congestion",
      "Controlled ascent rate — never hold breath",
      "Diver trained to recognize and report barotrauma symptoms immediately",
      "If unable to equalize: stop descent, attempt equalization, ascend if unsuccessful",
    ],
    requiredPpe: [],
    applicableOperations: ["All diving operations"],
    regulatoryBasis: "NDM Ch. 3 §3-8; NDM Ch. 20 §20-2",
  },
  {
    category: "physiological",
    hazard: "Oxygen toxicity — CNS and pulmonary",
    description: "Elevated partial pressure of oxygen can cause CNS toxicity (convulsions) or pulmonary toxicity (lung damage) during mixed gas and O₂ decompression operations.",
    defaultRiskLevel: "high",
    standardControls: [
      "Monitor O₂ exposure using CNS clock and OTU calculations",
      "Never exceed maximum PO₂ limits for planned dive profile",
      "O₂ breaks during decompression to reduce pulmonary toxicity risk",
      "All team members briefed on VENTID-C symptoms before operations",
      "If symptoms occur: switch to air/back gas, notify surface, controlled ascent",
    ],
    requiredPpe: [],
    applicableOperations: ["Mixed gas diving", "Oxygen decompression", "Nitrox operations"],
    regulatoryBasis: "NDM Ch. 3 §3-9.3; NDM Ch. 15 §15-4",
  },
  {
    category: "equipment",
    hazard: "Loss of breathing gas supply",
    description: "Failure of primary air supply from compressor malfunction, hose rupture, or regulator failure, leaving diver without breathing gas.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Three sources of air required for SSA: primary, reserve, and bailout (EM 385-1-1 §30-8.c(5))",
      "Bailout bottle minimum 30 ft³ at ≥90% working PSI — diver can activate immediately",
      "Reserve air supply integral or in-line with primary",
      "All gas supply components inspected before every dive",
      "Diver trained in bailout activation and emergency ascent procedures",
      "Standby diver ready for immediate deployment",
    ],
    requiredPpe: ["Bailout bottle with separate regulator"],
    applicableOperations: ["All SSA and SCUBA operations"],
    regulatoryBasis: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §C.1a–d; NDM Ch. 6 §6-9.3",
  },
  {
    category: "equipment",
    hazard: "Communications system failure",
    description: "Loss of two-way voice communications between diver and surface, preventing coordination and emergency communication.",
    defaultRiskLevel: "high",
    standardControls: [
      "All dives terminated if voice communications are lost (EM 385-1-1 §30-8.c(5))",
      "Backup communication method verified before every dive",
      "Line-pull signal chart posted at dive station",
      "Tender maintains physical contact with umbilical for line-pull detection",
      "Communication system tested before every dive — both directions",
      "Spare communication components available on-site",
    ],
    requiredPpe: [],
    applicableOperations: ["All SSA and mixed gas operations"],
    regulatoryBasis: "EM 385-1-1 §30-8.c(5); ENG FORM 6226 §G.4a; NDM Ch. 6 §6-7.5",
  },
  {
    category: "operational",
    hazard: "Diver entanglement in lines, cables, or debris",
    description: "Diver becomes entangled in umbilical, rigging lines, fishing nets, cables, or underwater debris, restricting movement and potentially trapping the diver.",
    defaultRiskLevel: "high",
    standardControls: [
      "Pre-dive survey of work area for entanglement hazards",
      "Diver carries cutting device accessible with either hand",
      "Umbilical management — tender maintains proper tension and slack",
      "If entangled: stop, assess, communicate, methodically free",
      "Standby diver briefed on entanglement rescue procedures",
      "Never pull blindly on umbilical — may worsen entanglement",
    ],
    requiredPpe: ["Dive knife/cutting device"],
    applicableOperations: ["All underwater operations"],
    regulatoryBasis: "NDM Ch. 6 §6-5; NDM Ch. 6 §6-9.3; EM 385-1-1 §30-8.a(9)(f)",
  },
  {
    category: "operational",
    hazard: "Crane/lifting operations with diver in water",
    description: "Crane or winch operations while diver is underwater create risk of struck-by, crush, or entanglement from suspended loads.",
    defaultRiskLevel: "critical",
    standardControls: [
      "All working dives with crane communication in SSA mode only",
      "Crane operator takes instruction from tender/supervisor in direct comms with diver",
      "Crane operations with diver underwater are Critical Lifts per EM 385-1-1 Ch. 16",
      "Diver participates in Critical Lift Plan development",
      "Never position diver under suspended load",
      "Divers performing rigging must be qualified riggers per Ch. 15",
    ],
    requiredPpe: ["Full SSA diving equipment", "Safety harness"],
    applicableOperations: ["Construction diving", "Salvage operations", "Infrastructure installation"],
    regulatoryBasis: "EM 385-1-1 §30-8.a(23); EM 385-1-1 Ch. 16; ENG FORM 6226 §G.7b",
  },
  {
    category: "operational",
    hazard: "Underwater welding/cutting — electrical and fire hazards",
    description: "Underwater welding and burning operations create electrical shock risk, burn hazards, and potential for gas accumulation and explosion.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Underwater welding/burning limited to SSA mode ONLY",
      "Equipment per Navy Underwater Cutting and Welding Manual S0300-BB-MAN-010",
      "Electrode/rod de-energized at surface before placed in or retrieved from water",
      "Diver wears rubber/neoprene suit providing electrical insulation",
      "Insulating gloves with cuff covering wrist minimum",
      "Welding eye shield on helmet with appropriate shade",
      "Fire watch maintained topside",
    ],
    requiredPpe: ["Insulating dive suit", "Insulating gloves", "Welding eye shield"],
    applicableOperations: ["Underwater welding", "Underwater cutting", "Burning operations"],
    regulatoryBasis: "EM 385-1-1 §30-8.a(24); EM 385-1-1 Ch. 10; S0300-BB-MAN-010; ENG FORM 6226 §G.7c",
  },
  {
    category: "operational",
    hazard: "Confined space diving — entrapment and hazardous atmosphere",
    description: "Diving in enclosed spaces such as pipelines, tanks, and intakes creates risk of entrapment, restricted egress, and exposure to hazardous atmospheres.",
    defaultRiskLevel: "critical",
    standardControls: [
      "SCUBA prohibited in enclosed/physically confining spaces",
      "SSA mode required — continuous voice communications mandatory",
      "Underwater tender/diver stationed at point of entry",
      "Lockout/tagout all systems creating flow, pressure, or mechanical hazards",
      "Verify no pressure differentials — all potential leaks eliminated",
      "Emergency extraction plan specific to confined space geometry",
      "Additional standby diver may be required based on AHA",
    ],
    requiredPpe: ["Full SSA equipment", "Safety harness with tether"],
    applicableOperations: ["Pipeline inspection", "Tank diving", "Intake/outfall work"],
    regulatoryBasis: "EM 385-1-1 §30-8.b(1)(d); EM 385-1-1 Ch. 34; ENG FORM 6226 §G.4c; 29 CFR 1910.146",
  },
  {
    category: "chemical",
    hazard: "Contaminated water exposure",
    description: "Diving in polluted or chemically contaminated water can cause skin irritation, chemical burns, respiratory issues, or long-term health effects.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Prohibited unless supporting documentation demonstrates adequate safety measures and trained personnel",
      "Identify contaminants before diving — obtain water quality data and SDS",
      "Minimum: vulcanized drysuit with sealed gloves, boots, and full-face helmet",
      "No skin exposure — all suit penetrations sealed",
      "Three-stage decontamination station set up before operations",
      "Post-dive health monitoring for all exposed personnel",
      "Medical surveillance program for recurring operations",
    ],
    requiredPpe: ["Vulcanized drysuit", "Sealed gloves", "Sealed boots", "Full-face helmet"],
    applicableOperations: ["Contaminated water diving", "Industrial diving", "Wastewater operations"],
    regulatoryBasis: "EM 385-1-1 §30-8.a(22); 29 CFR 1910.120 (HAZWOPER); ADCI Consensus Standards §8.0",
  },
  {
    category: "electrical",
    hazard: "Electrical shock from power tools or cathodic protection",
    description: "Contact with energized electrical systems, impressed current cathodic protection, or faulty power tools can cause electric shock or electrocution underwater.",
    defaultRiskLevel: "critical",
    standardControls: [
      "Lockout/tagout all electrical systems in the work area before diving",
      "Verify cathodic protection systems are de-energized before diving",
      "Use only approved underwater electrical tools with GFI protection",
      "Power tools de-energized at surface before placed in or retrieved from water",
      "Diver wears insulating gloves when working near electrical systems",
      "Test for stray currents before diver enters water",
      "If diver reports tingling or shock sensation — abort dive immediately",
    ],
    requiredPpe: ["Insulating gloves", "Full exposure suit"],
    applicableOperations: ["Inspection near electrical systems", "Cathodic protection work", "Underwater power tool use"],
    regulatoryBasis: "EM 385-1-1 §30-8.a(20); EM 385-1-1 §30-8.a(24); 29 CFR 1926.1092",
  },
];
