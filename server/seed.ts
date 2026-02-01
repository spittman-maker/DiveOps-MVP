import { db } from "./db";
import {
  companies,
  companyRoles,
  companyContactsDefaults,
  workLibraryItems,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Seeds:
 * - global work library (idempotent via unique index on category+label)
 * - one company tenant + default roles + TBD contact defaults (idempotent)
 */

const WORK_LIBRARY = [
  { category: "Demolition", label: "Underwater demolition" },
  { category: "Construction", label: "Underwater construction" },
  { category: "Inspection", label: "Underwater inspection" },
  { category: "Inspection", label: "Hull cleaning" },
  { category: "Inspection", label: "Pipeline inspection" },
  { category: "Inspection", label: "Structural inspection" },
  { category: "Inspection", label: "NDT (Non-Destructive Testing)" },
  { category: "Inspection", label: "Jacket leg inspection" },
  { category: "Inspection", label: "Riser inspection" },
  { category: "Inspection", label: "Pile inspection" },
  { category: "Inspection", label: "Mooring inspection" },
  { category: "Inspection", label: "Cathodic protection survey" },
  { category: "Inspection", label: "Sacrificial anode survey" },
  { category: "Rigging", label: "Underwater rigging" },
  { category: "Rigging", label: "Anchor handling" },
  { category: "Concrete", label: "Concrete tremie placement" },
  { category: "Concrete", label: "Concrete repair" },
  { category: "Welding-Burning", label: "Underwater welding" },
  { category: "Welding-Burning", label: "Underwater cutting" },
  { category: "Emergency Support", label: "Emergency dive support / call-out" },
  { category: "Salvage", label: "Salvage operations" },
  { category: "Salvage", label: "Search and recovery" },
  { category: "Salvage", label: "Debris removal" },
  { category: "Jetting-Dredging", label: "Jetting / dredging support" },
  { category: "Jetting-Dredging", label: "Hydro-jetting" },
  { category: "Jetting-Dredging", label: "Marine growth removal" },
  { category: "Pipeline Repair", label: "Pipeline repair" },
  { category: "Pipeline Repair", label: "Hot tap operations" },
  { category: "Pipeline Repair", label: "Cold tap operations" },
  { category: "Equipment", label: "Subsea equipment installation" },
  { category: "Equipment", label: "Subsea equipment recovery" },
  { category: "Equipment", label: "Valve operation" },
  { category: "Equipment", label: "Flange connection/disconnection" },
  { category: "Equipment", label: "Anode installation/replacement" },
  { category: "Pile Jacket", label: "Pile jacket installation" },
  { category: "Flange Up", label: "Flange-up / fit-up" },
  { category: "Special", label: "Confined space entry" },
  { category: "Photography", label: "Underwater photography/video" },
] as const;

const DEFAULT_ROLES = [
  { roleName: "Ops/PM", sortOrder: 10 },
  { roleName: "Diving Superintendent", sortOrder: 20 },
  { roleName: "Dive Supervisor", sortOrder: 30 },
  { roleName: "HSE", sortOrder: 40 },
  { roleName: "Chamber Operator", sortOrder: 50 },
] as const;

async function seedWorkLibraryOnce() {
  console.log("Seeding work library items...");
  for (const item of WORK_LIBRARY) {
    const existing = await db
      .select({ label: workLibraryItems.label })
      .from(workLibraryItems)
      .where(and(eq(workLibraryItems.category, item.category), eq(workLibraryItems.label, item.label)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(workLibraryItems).values(item);
      console.log(`  Added: ${item.category} - ${item.label}`);
    }
  }
  console.log(`  Total: ${WORK_LIBRARY.length} items in library`);
}

async function ensureCompanyWithRoles(companyName: string, logoAssetKey?: string) {
  let existingCompany = await db
    .select({ companyId: companies.companyId })
    .from(companies)
    .where(eq(companies.companyName, companyName))
    .limit(1);

  let companyId: string;
  
  if (existingCompany.length > 0) {
    companyId = existingCompany[0].companyId;
    console.log(`Company "${companyName}" exists (${companyId}), ensuring roles...`);
  } else {
    console.log(`Creating company: ${companyName}`);
    const [company] = await db
      .insert(companies)
      .values({ companyName, logoAssetKey })
      .returning({ companyId: companies.companyId });
    companyId = company.companyId;
  }

  for (const role of DEFAULT_ROLES) {
    const existingRole = await db
      .select({ roleId: companyRoles.roleId })
      .from(companyRoles)
      .where(and(
        eq(companyRoles.companyId, companyId),
        eq(companyRoles.roleName, role.roleName)
      ))
      .limit(1);

    if (existingRole.length === 0) {
      const [newRole] = await db
        .insert(companyRoles)
        .values({ ...role, companyId })
        .returning({ roleId: companyRoles.roleId });
      
      await db.insert(companyContactsDefaults).values({
        companyId,
        roleId: newRole.roleId,
        defaultName: "TBD",
        defaultPhone: "TBD",
        defaultEmail: "TBD",
      });
      console.log(`  Added role: ${role.roleName} with TBD defaults`);
    } else {
      const existingDefault = await db
        .select({ companyId: companyContactsDefaults.companyId })
        .from(companyContactsDefaults)
        .where(and(
          eq(companyContactsDefaults.companyId, companyId),
          eq(companyContactsDefaults.roleId, existingRole[0].roleId)
        ))
        .limit(1);
      
      if (existingDefault.length === 0) {
        await db.insert(companyContactsDefaults).values({
          companyId,
          roleId: existingRole[0].roleId,
          defaultName: "TBD",
          defaultPhone: "TBD",
          defaultEmail: "TBD",
        });
        console.log(`  Added TBD defaults for existing role: ${role.roleName}`);
      }
    }
  }

  return companyId;
}

async function main() {
  console.log("Starting seed...\n");
  
  await seedWorkLibraryOnce();
  console.log("");
  
  const companyId = await ensureCompanyWithRoles(
    "Precision SubSea Group LLC",
    "assets/logos/precision.jpg"
  );

  console.log("\nSeed complete!");
  console.log("company_id =", companyId);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
