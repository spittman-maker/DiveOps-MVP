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
 * - global work library (once, idempotent via unique index)
 * - one company tenant + default roles + TBD contact defaults
 */

const WORK_LIBRARY = [
  { category: "Demolition", label: "Underwater demolition" },
  { category: "Construction", label: "Underwater construction" },
  { category: "Inspection", label: "Underwater inspection" },
  { category: "Rigging", label: "Underwater rigging" },
  { category: "Concrete", label: "Concrete tremie placement" },
  { category: "Welding-Burning", label: "Underwater welding" },
  { category: "Welding-Burning", label: "Underwater burning" },
  { category: "Emergency Support", label: "Emergency dive support / call-out" },
  { category: "Salvage", label: "Salvage support" },
  { category: "Jetting-Dredging", label: "Jetting / dredging support" },
  { category: "Pipeline Repair", label: "Pipeline repair" },
  { category: "Pile Jacket Installation", label: "Pile jacket installation" },
  { category: "Flange Up", label: "Flange-up / fit-up" },
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
    } else {
      console.log(`  Exists: ${item.category} - ${item.label}`);
    }
  }
}

async function seedCompanyWithDefaultRoles(companyName: string, logoAssetKey?: string) {
  const existingCompany = await db
    .select({ companyId: companies.companyId })
    .from(companies)
    .where(eq(companies.companyName, companyName))
    .limit(1);

  if (existingCompany.length > 0) {
    console.log(`Company "${companyName}" already exists, skipping...`);
    return existingCompany[0].companyId;
  }

  console.log(`Creating company: ${companyName}`);
  const [company] = await db
    .insert(companies)
    .values({ companyName, logoAssetKey })
    .returning({ companyId: companies.companyId });

  console.log("Creating default roles...");
  const insertedRoles = await db
    .insert(companyRoles)
    .values(DEFAULT_ROLES.map((r) => ({ ...r, companyId: company.companyId })))
    .returning({ roleId: companyRoles.roleId });

  console.log("Creating TBD contact defaults...");
  await db.insert(companyContactsDefaults).values(
    insertedRoles.map((r) => ({
      companyId: company.companyId,
      roleId: r.roleId,
      defaultName: "TBD",
      defaultPhone: "TBD",
      defaultEmail: "TBD",
    }))
  );

  return company.companyId;
}

async function main() {
  console.log("Starting seed...\n");
  
  await seedWorkLibraryOnce();
  console.log("");
  
  const companyId = await seedCompanyWithDefaultRoles(
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
