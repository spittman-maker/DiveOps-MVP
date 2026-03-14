import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { passport, hashPassword, requireAuth, requireRole } from "../auth";
import { authLimiter } from "../rate-limit";
import { generateCorrelationId, emitAuditEvent } from "../audit";
import { isEnabled } from "../feature-flags";
import { db } from "../storage";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Type Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function getHeader(req: Request, name: string): string | undefined {
  const val = req.headers[name];
  return Array.isArray(val) ? val[0] : val;
}

function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

// MED-01 FIX: Removed role field from public registration schema.
// Public registration always creates DIVER accounts. Elevated roles
// can only be assigned by admins via the admin user creation endpoint.
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

// Admin-created users still require 8-char minimum password
const adminCreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role: z.enum(["GOD", "ADMIN", "SUPERVISOR", "DIVER"]),
  fullName: z.string().optional(),
  initials: z.string().max(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

const setupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Full name is required"),
  initials: z.string().min(1, "Initials are required").max(4),
  email: z.string().email("Valid email required"),
});

// ────────────────────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────────────────────

export const authRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// AUTH ROUTES
// ──────────────────────────────────────────────────────────────────────────

authRouter.post("/auth/register", authLimiter, async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    // MED-01: Role is always DIVER for public registration (role field removed from schema)

    const existing = await storage.getUserByUsername(data.username);
    if (existing) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const user = await storage.createUser({
      username: data.username,
      password: hashPassword(data.password),
      role: "DIVER",
      fullName: data.fullName || null,
      initials: data.initials || null,
      email: data.email || null,
    });

    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: "Login failed" });
      res.status(201).json({ id: user.id, username: user.username, role: user.role });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    console.error("Register error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

authRouter.post("/auth/login", authLimiter, (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) return next(err);
    if (!user) {
      // Log failed login attempt
      const correlationId = generateCorrelationId();
      const attemptedUsername = (req.body?.username || "").trim();
      emitAuditEvent(
        { correlationId, userId: undefined, ipAddress: req.ip || "unknown" },
        "auth.login_failed",
        { metadata: { username: attemptedUsername, reason: info?.message || "Invalid credentials" } }
      ).catch(() => {});
      return res.status(401).json({ message: info?.message || "Invalid username or password" });
    }
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      const correlationId = generateCorrelationId();
      const ctx = { correlationId, userId: user.id, ipAddress: req.ip || "unknown" };
      emitAuditEvent(ctx, "auth.login", { metadata: { username: user.username, role: user.role } }).catch(() => {});
      req.session.save((err) => {
        if (err) {
          console.error("[auth] Session save error:", err);
          return res.status(500).json({ message: "Session save failed" });
        }
        res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName, mustChangePassword: user.mustChangePassword });
      });
    });
  })(req, res, next);
});

// CRIT-06 FIX: Explicit handler for the commonly-guessed /api/login path.
// Returns a helpful error pointing callers to the correct endpoint.
authRouter.post("/login", (_req: Request, res: Response) => {
  res.status(404).json({
    message: "This endpoint does not exist. Use POST /api/auth/login instead.",
    correctEndpoint: "/api/auth/login",
  });
});

authRouter.post("/auth/logout", (req: Request, res: Response) => {
  const logoutUser = req.user as any;
  req.logout((err) => {
    if (err) return res.status(500).json({ message: "Logout failed" });
    if (logoutUser?.id) {
      const correlationId = generateCorrelationId();
      const ctx = { correlationId, userId: logoutUser.id, ipAddress: req.ip || "unknown" };
      emitAuditEvent(ctx, "auth.logout", { metadata: { username: logoutUser.username } }).catch(() => {});
    }
    res.json({ message: "Logged out" });
  });
});

authRouter.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req);
  const prefs = await storage.getUserPreferences(user.id);
  // Multi-tenant: include companyId and companyName in session
  let companyId = user.companyId || null;
  let companyName: string | null = null;
  let activeCompanyId: string | null = null;
  if (isEnabled("multiTenantOrg")) {
    if (user.role === "GOD" && prefs?.activeCompanyId) {
      activeCompanyId = prefs.activeCompanyId;
      const company = await storage.getCompany(prefs.activeCompanyId);
      if (company) companyName = company.companyName;
    } else if (user.role === "GOD" && companyId) {
      // BUG-01 FIX: GOD user also gets companyName from their own companyId
      const company = await storage.getCompany(companyId);
      if (company) companyName = company.companyName;
    } else if (companyId) {
      const company = await storage.getCompany(companyId);
      if (company) companyName = company.companyName;
    }
  }
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    initials: user.initials,
    activeProjectId: prefs?.activeProjectId,
    mustChangePassword: user.mustChangePassword,
    companyId,
    companyName,
    activeCompanyId,
  });
});

// ──────────────────────────────────────────────────────────────────────────
// SETUP (First-time system initialization)
// ──────────────────────────────────────────────────────────────────────────

authRouter.get("/setup/status", async (_req: Request, res: Response) => {
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    const userCount = Number(result[0]?.count ?? 0);
    res.json({ initialized: userCount > 0, userCount });
  } catch (error) {
    res.status(500).json({ message: "Failed to check setup status" });
  }
});

authRouter.post("/setup/init", async (req: Request, res: Response) => {
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    const userCount = Number(result[0]?.count ?? 0);
    if (userCount > 0) {
      return res.status(403).json({ message: "System already initialized. Contact your administrator." });
    }

    const data = setupSchema.parse(req.body);
    const admin = await storage.createUser({
      username: data.username,
      password: hashPassword(data.password),
      role: "GOD",
      fullName: data.fullName,
      initials: data.initials.toUpperCase(),
      email: data.email,
    });

    req.login(admin, (err) => {
      if (err) return res.status(500).json({ message: "Account created but login failed" });
      res.status(201).json({
        message: "System initialized successfully",
        user: { id: admin.id, username: admin.username, role: admin.role, fullName: admin.fullName },
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    console.error("Setup init error:", error);
    res.status(500).json({ message: "Setup failed" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// SWITCH COMPANY
// ──────────────────────────────────────────────────────────────────────────

// BUG-11 FIX: POST /api/auth/switch-company — GOD users can switch active company context
authRouter.post("/auth/switch-company", requireRole("GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { companyId } = req.body;
    if (!companyId) {
      // Clear active company
      await storage.setActiveCompany(user.id, "");
      return res.json({ message: "Active company cleared" });
    }
    // Verify company exists
    const company = await storage.getCompany(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });
    await storage.setActiveCompany(user.id, companyId);
    return res.json({ message: "Active company set", companyId, companyName: company.companyName });
  } catch (error: any) {
    console.error("Switch company error:", error);
    res.status(500).json({ message: error?.message || "Failed to switch company" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// ──────────────────────────────────────────────────────────────────────────

authRouter.post("/auth/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }
    // BUG-18 FIX: Reject same password
    if (currentPassword && newPassword === currentPassword) {
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    // If user must change password (invite flow), currentPassword is the temp password
    // Otherwise require current password verification
    const fullUser = await storage.getUser(user.id);
    if (!fullUser) return res.status(404).json({ message: "User not found" });

    if (!fullUser.mustChangePassword && currentPassword) {
      // Verify current password
      const crypto = await import("crypto");
      const [salt, hash] = fullUser.password.split(".");
      const derived = crypto.scryptSync(currentPassword, salt, 64).toString("hex");
      if (derived !== hash) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
    }

     await storage.updateUser(user.id, {
      password: hashPassword(newPassword),
      mustChangePassword: false,
    });
    const pwCorrelationId = generateCorrelationId();
    const pwCtx = { correlationId: pwCorrelationId, userId: user.id, ipAddress: req.ip || "unknown" };
    emitAuditEvent(pwCtx, "auth.password_change", { metadata: { username: user.username, forced: fullUser.mustChangePassword } }).catch(() => {});
    res.json({ message: "Password changed successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to change password" });
  }
});
