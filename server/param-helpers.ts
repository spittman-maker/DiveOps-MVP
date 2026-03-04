import type { Request } from "express";

/** Safely extract a route param as string (Express 5 returns string | string[]). */
export function getParamAsString(req: Request, name: string): string | undefined {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

/** Safely extract a query param as string. */
export function getQueryAsString(req: Request, name: string): string | undefined {
  const val = req.query[name];
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  return undefined;
}

/** Get a required route param or throw 400. */
export function getRequiredParam(req: Request, name: string): string {
  const val = getParamAsString(req, name);
  if (!val) throw Object.assign(new Error(`Missing required param: ${name}`), { status: 400 });
  return val;
}

/** Get a query param as string array. */
export function getQueryAsArray(req: Request, name: string): string[] {
  const val = req.query[name];
  if (!val) return [];
  if (typeof val === "string") return [val];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string");
  return [];
}