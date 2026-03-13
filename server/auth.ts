import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { User as AppUser, UserRole } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

function verifyPassword(password: string, stored: string): boolean {
  if (!stored.includes(".")) {
    return false;
  }
  const [salt, hash] = stored.split(".");
  const derived = crypto.scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hash, "hex");

  if (derived.length !== storedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, storedHash);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}.${hash}`;
}

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const trimmedUsername = username.trim();
      const trimmedPassword = password.trim();
      const user = await storage.getUserByUsername(trimmedUsername);
      if (!user) {
        return done(null, false, { message: "Invalid username or password" });
      }

      if (!verifyPassword(trimmedPassword, user.password)) {
        return done(null, false, { message: "Invalid username or password" });
      }

      return done(null, user);
    } catch (error) {
      console.error(`[auth] Error during login:`, error);
      return done(error);
    }
  })
);

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as AppUser).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export { passport, hashPassword, verifyPassword };

// ────────────────────────────────────────────────────────────────────────────
// RBAC Middleware
// ────────────────────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = req.user as AppUser;
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }

    next();
  };
}

// Helper to check if user can write LogEvents (SUPERVISOR, ADMIN, GOD)
export function canWriteLogEvents(role: UserRole): boolean {
  return ["SUPERVISOR", "ADMIN", "GOD"].includes(role);
}

// Helper to check if user is GOD
export function isGod(role: UserRole): boolean {
  return role === "GOD";
}

// Helper to check if user is Admin or higher
export function isAdminOrHigher(role: UserRole): boolean {
  return ["ADMIN", "GOD"].includes(role);
}
