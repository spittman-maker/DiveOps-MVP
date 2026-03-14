import type { Express } from "express";
import { createServer, type Server } from "http";
import { generateCorrelationId, type AuditContext } from "./audit";
import type { User, UserRole } from "@shared/schema";

// Domain routers
import { authRouter } from "./routes/auth.router";
import { dashboardRouter } from "./routes/dashboard.router";
import { weatherRouter } from "./routes/weather.router";
import { projectsRouter } from "./routes/projects.router";
import { daysRouter } from "./routes/days.router";
import { logEventsRouter } from "./routes/log-events.router";
import { divesRouter } from "./routes/dives.router";
import { risksRouter } from "./routes/risks.router";
import { divePlansRouter } from "./routes/dive-plans.router";
import { certificationsRouter } from "./routes/certifications.router";
import { companiesRouter } from "./routes/companies.router";
import { exportsRouter } from "./routes/exports.router";
import { adminRouter } from "./routes/admin.router";
import { libraryRouter } from "./routes/library.router";
import { facilitiesRouter } from "./routes/facilities.router";
import { transcriptionRouter } from "./routes/transcription.router";
import { crewHoursRouter } from "./routes/crew-hours.router";
import { conversationsRouter } from "./routes/conversations.router";

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      auditCtx?: AuditContext;
      idempotencyKey?: string;
    }
  }
}

/** Safely extract a single string from Express 5 headers. */
function getHeader(req: Express.Request, name: string): string | undefined {
  const val = (req as any).headers[name];
  return Array.isArray(val) ? val[0] : val;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Correlation ID & Audit Context middleware ───────────────────────────
  app.use((req, _res, next) => {
    const cid = getHeader(req, "x-correlation-id") || generateCorrelationId();
    req.correlationId = cid;
    req.idempotencyKey = getHeader(req, "x-idempotency-key");
    const user = req.user as User | undefined;
    req.auditCtx = {
      correlationId: cid,
      userId: user?.id,
      userRole: user?.role as UserRole | undefined,
      ipAddress: req.ip || req.socket.remoteAddress,
    };
    next();
  });

  // ── Mount domain routers ───────────────────────────────────────────────
  app.use("/api", authRouter);
  app.use("/api", dashboardRouter);
  app.use("/api", weatherRouter);
  app.use("/api", projectsRouter);
  app.use("/api", daysRouter);
  app.use("/api", logEventsRouter);
  app.use("/api", divesRouter);
  app.use("/api", risksRouter);
  app.use("/api", divePlansRouter);
  app.use("/api", certificationsRouter);
  app.use("/api", companiesRouter);
  app.use("/api", exportsRouter);
  app.use("/api", adminRouter);
  app.use("/api", libraryRouter);
  app.use("/api", facilitiesRouter);
  app.use("/api", transcriptionRouter);
  app.use("/api", crewHoursRouter);
  app.use("/api", conversationsRouter);

  // ── Existing route modules (already extracted) ─────────────────────────
  try {
    const { registerKnowledgeBaseRoutes } = await import("./routes/knowledge-base.routes");
    const { registerAnalyticsRoutes } = await import("./routes/analytics.routes");
    const { registerMlRoutes } = await import("./routes/ml.routes");
    const { registerSafetyRoutes } = await import("./routes/safety.routes");
    const { registerDocumentUploadRoutes } = await import("./routes/document-upload.routes");

    registerKnowledgeBaseRoutes(app);
    registerAnalyticsRoutes(app);
    registerMlRoutes(app);
    registerSafetyRoutes(app);
    registerDocumentUploadRoutes(app);
    console.log("[Routes] All route modules registered successfully");
  } catch (error) {
    console.error("[Routes] Failed to register route modules:", error);
  }

  return httpServer;
}
