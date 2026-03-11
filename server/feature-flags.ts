import { db } from "./storage";
import { sql } from "drizzle-orm";

export interface FeatureFlags {
  closeDay: boolean;
  riskCreation: boolean;
  exportGeneration: boolean;
  aiProcessing: boolean;
  safetyTab: boolean;
  multiTenantOrg: boolean;
}

const defaults: FeatureFlags = {
  closeDay: true,
  riskCreation: true,
  exportGeneration: true,
  aiProcessing: true,
  safetyTab: true,
  multiTenantOrg: false, // OFF by default; enabled explicitly after migration
};

let overrides: Partial<FeatureFlags> = {};

export function getFlags(): FeatureFlags {
  return { ...defaults, ...overrides };
}

export function isEnabled(flag: keyof FeatureFlags): boolean {
  return getFlags()[flag];
}

export function setFlag(flag: keyof FeatureFlags, value: boolean): void {
  overrides[flag] = value;
  console.warn(`[FEATURE-FLAG] ${flag} set to ${value}`);
}

export function resetFlags(): void {
  overrides = {};
  console.warn("[FEATURE-FLAG] All flags reset to defaults");
}

export function getFlagStatus(): Record<string, boolean> {
  const flags = getFlags();
  return { ...flags };
}
