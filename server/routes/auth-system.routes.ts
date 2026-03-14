import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import type { User } from "@shared/schema";

interface RegisterAuthSystemRoutesDeps {
  authLimiter: any;
  registerSchema: z.ZodTypeAny;
  hashPassword: (password: string) => string;
  passport: any;
  requireAuth: (req: Request, res: Response, next: NextFunction) => unknown;
  requireRole: (...roles: any[]) => (req: Request, res: Response, next: NextFunction) => unknown;
  generateCorrelationId: () => string;
  emitAuditEvent: (ctx: any, action: any, data: any) => Promise<unknown>;
  storage: any;
  isEnabled: (flag: string) => boolean;
  db: any;
  schema: any;
  sql: any;
  getUser: (req: Request) => User;
}

export function registerAuthSystemRoutes(app: Express, deps: RegisterAuthSystemRoutesDeps) {
  const {
    authLimiter,
    registerSchema,
    hashPassword,
    passport,
    requireAuth,
    requireRole,
    generateCorrelationId,
    emitAuditEvent,
    storage,
    isEnabled,
    db,
    schema,
    sql,
    getUser,
  } = deps;

  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const data = registerSchema.parse(req.body);

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

  app.post("/api/auth/login", authLimiter, (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
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

  app.post("/api/login", (_req: Request, res: Response) => {
    res.status(404).json({
      message: "This endpoint does not exist. Use POST /api/auth/login instead.",
      correctEndpoint: "/api/auth/login",
    });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
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

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const user = getUser(req);
    const prefs = await storage.getUserPreferences(user.id);
    let companyId = user.companyId || null;
    let companyName: string | null = null;
    let activeCompanyId: string | null = null;
    if (isEnabled("multiTenantOrg")) {
      if (user.role === "GOD" && prefs?.activeCompanyId) {
        activeCompanyId = prefs.activeCompanyId;
        const company = await storage.getCompany(prefs.activeCompanyId);
        if (company) companyName = company.companyName;
      } else if (user.role === "GOD" && companyId) {
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

  app.get("/api/setup/status", async (_req: Request, res: Response) => {
    try {
      const result = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
      const userCount = Number(result[0]?.count ?? 0);
      res.json({ initialized: userCount > 0, userCount });
    } catch {
      res.status(500).json({ message: "Failed to check setup status" });
    }
  });

  const setupSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().min(1, "Full name is required"),
    initials: z.string().min(1, "Initials are required").max(4),
    email: z.string().email("Valid email required"),
  });

  app.post("/api/setup/init", async (req: Request, res: Response) => {
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

  app.post("/api/auth/switch-company", requireRole("GOD"), async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { companyId } = req.body;
      if (!companyId) {
        await storage.setActiveCompany(user.id, "");
        return res.json({ message: "Active company cleared" });
      }
      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ message: "Company not found" });
      await storage.setActiveCompany(user.id, companyId);
      return res.json({ message: "Active company set", companyId, companyName: company.companyName });
    } catch (error: any) {
      console.error("Switch company error:", error);
      res.status(500).json({ message: error?.message || "Failed to switch company" });
    }
  });

  app.post("/api/seed", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Seed endpoint is disabled in production" });
    }
    const seedToken = process.env.DEV_SEED_TOKEN;
    if (!seedToken) {
      return res.status(403).json({ message: "Seed endpoint disabled: DEV_SEED_TOKEN is not configured" });
    }
    if (req.body?.seedToken !== seedToken) {
      return res.status(403).json({ message: "Invalid seed token" });
    }
    try {
      const generatedPasswords: Record<string, string> = {
        god: randomBytes(12).toString("base64url"),
        supervisor: randomBytes(12).toString("base64url"),
        diver: randomBytes(12).toString("base64url"),
      };

      let god = await storage.getUserByUsername("spittman@precisionsubsea.com");
      if (!god) god = await storage.getUserByUsername("god");
      if (!god) {
        god = await storage.createUser({
          username: "spittman@precisionsubsea.com",
          password: hashPassword(generatedPasswords.god),
          role: "GOD",
          fullName: "S. Pittman",
          initials: "SP",
          email: "spittman@precisionsubsea.com",
        });
      }

      let supervisor = await storage.getUserByUsername("supervisor");
      if (!supervisor) {
        supervisor = await storage.createUser({
          username: "supervisor",
          password: hashPassword(generatedPasswords.supervisor),
          role: "SUPERVISOR",
          fullName: "John Smith",
          initials: "JS",
          email: "jsmith@navydive.console",
        });
      }

      let diver = await storage.getUserByUsername("diver");
      if (!diver) {
        diver = await storage.createUser({
          username: "diver",
          password: hashPassword(generatedPasswords.diver),
          role: "DIVER",
          fullName: "Mike Johnson",
          initials: "MJ",
          email: "mjohnson@navydive.console",
        });
      }

      const projects = await storage.getAllProjects();
      let project = projects.find((p: any) => p.name === "Pearl Harbor Inspection");
      if (!project) {
        project = await storage.createProject({
          name: "Pearl Harbor Inspection",
          clientName: "NAVFAC Pacific",
          jobsiteName: "Pearl Harbor Naval Shipyard",
          jobsiteAddress: "1 Dry Dock Way, Pearl Harbor, HI 96860",
          jobsiteLat: "21.3544",
          jobsiteLng: "-157.9501",
          timezone: "Pacific/Honolulu",
          emergencyContacts: [
            { name: "Base Emergency", role: "Emergency Services", phone: "808-555-0911" },
            { name: "NAVFAC POC", role: "Client Representative", phone: "808-555-1234" },
          ],
        });

        await storage.addProjectMember({ projectId: project.id, userId: god.id, role: "GOD" });
        await storage.addProjectMember({ projectId: project.id, userId: supervisor.id, role: "SUPERVISOR" });
        await storage.addProjectMember({ projectId: project.id, userId: diver.id, role: "DIVER" });
      }

      const showPasswords = process.env.DEV_SEED_SHOW_PASSWORDS === "true" && process.env.NODE_ENV === "development";

      if (showPasswords) {
        console.info("[seed] Generated temporary credentials:", generatedPasswords);
      }

      res.json({
        message: "Seed data created",
        users: { god: god.username, supervisor: supervisor.username, diver: diver.username },
        project: { id: project.id, name: project.name },
        ...(showPasswords ? { temporaryPasswords: generatedPasswords } : {}),
      });
    } catch (error) {
      console.error("Seed error:", error);
      res.status(500).json({ message: "Seed failed" });
    }
  });
}
