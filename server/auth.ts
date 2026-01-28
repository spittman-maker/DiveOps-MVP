import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { User, UserRole } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";

// For this MVP, we'll use a simple password comparison
// In production, use bcrypt or similar
function verifyPassword(password: string, hash: string): boolean {
  return password === hash;
}

function hashPassword(password: string): string {
  return password;
}

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return done(null, false, { message: "Invalid username or password" });
      }

      if (!verifyPassword(password, user.password)) {
        return done(null, false, { message: "Invalid username or password" });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  })
);

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as User).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export { passport, hashPassword };

// ────────────────────────────────────────────────────────────────────────────
// RBAC Middleware
// ────────────────────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface User extends User {}
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

    const user = req.user as User;
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
