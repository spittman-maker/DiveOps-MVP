import type { Request, Response } from "express";
import { storage } from "../storage";

/** Get authenticated user or throw 401. */
export function getUser(req: Request): { id: string; role: string } {
  const user = (req as any).user;
  if (!user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return user;
}

/** Safely extract a route param as string. */
export function getParam(req: Request, name: string): string {
  const val = req.params[name];
  const str = Array.isArray(val) ? val[0] : val;
  if (!str) throw Object.assign(new Error(`Missing param: ${name}`), { status: 400 });
  return str;
}

/** Safely extract a query param as string. */
export function getQuery(req: Request, name: string): string | undefined {
  const val = req.query[name];
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  return undefined;
}

/** Validate request body against a Zod schema. */
export function validateBody<T>(schema: { parse: (data: unknown) => T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err: any) {
    const message = err.errors ? err.errors.map((e: any) => e.message).join(", ") : "Invalid request body";
    throw Object.assign(new Error(message), { status: 400 });
  }
}

/** Get today's date as YYYY-MM-DD. */
export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}