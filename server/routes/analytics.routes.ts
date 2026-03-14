import type { Express, Request, Response } from "express";
import { getParam, getQuery, getUser, validateBody, getTodayDate } from "./_helpers";
import { analyticsComputeSchema, snapshotTriggerSchema } from "./_schemas";
import {
  computeDaySnapshot,
  computeProjectTrends,
  computeProjectSummary,
} from "../services/analytics-aggregator";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitAuditEvent } from "../audit";
import logger from "../logger";
import type { User } from "@shared/schema";

export function registerAnalyticsRoutes(app: Express): void {
  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/projects/:projectId/analytics
  // Get analytics snapshots for a project, optionally filtered by date range.
  // Requires: authenticated user
  // ──────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/projects/:projectId/analytics",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const startDate = getQuery(req, "startDate");
        const endDate = getQuery(req, "endDate");

        const snapshots = await storage.getAnalyticsSnapshots(
          projectId,
          startDate,
          endDate
        );

        res.json({ snapshots, count: snapshots.length });
      } catch (err: any) {
        logger.error({ err }, "Failed to get analytics snapshots");
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/projects/:projectId/analytics/snapshot
  // Trigger a new analytics snapshot for a specific day.
  // Requires: SUPERVISOR, ADMIN, or GOD role
  // ──────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/projects/:projectId/analytics/snapshot",
    requireRole("SUPERVISOR", "ADMIN", "GOD"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const { dayId, snapshotDate } = validateBody(snapshotTriggerSchema, req.body);

        const snapshot = await computeDaySnapshot(projectId, dayId, snapshotDate);

        // Audit log
        const user = req.user as User;
        await emitAuditEvent(
          {
            correlationId: (req as any).correlationId || `snap-${Date.now()}`,
            userId: user.id,
            userRole: user.role,
            projectId,
            dayId,
          },
          "analytics.snapshot",
          {
            targetId: String(snapshot.id),
            targetType: "analytics_snapshot",
            metadata: { snapshotDate, dayId, projectId },
          }
        );

        res.status(201).json(snapshot);
      } catch (err: any) {
        logger.error({ err }, "Failed to trigger analytics snapshot");
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Legacy routes (backward compatibility with existing frontend)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/analytics/:projectId/snapshot", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const date = getQuery(req, "date") || getTodayDate();
      const startDate = getQuery(req, "startDate") || date;
      const endDate = getQuery(req, "endDate") || date;

      const result = await computeProjectTrends(projectId, startDate, endDate);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "Analytics snapshot failed");
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/analytics/:projectId/trends", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const startDate = getQuery(req, "startDate");
      const endDate = getQuery(req, "endDate");

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate query params required" });
      }

      const result = await computeProjectTrends(projectId, startDate, endDate);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "Analytics trends failed");
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post("/api/analytics/compute", requireAuth, async (req: Request, res: Response) => {
    try {
      const { projectId, dayId, snapshotDate } = validateBody(analyticsComputeSchema, req.body);
      const snapshot = await computeDaySnapshot(projectId, dayId, snapshotDate);
      res.json(snapshot);
    } catch (err: any) {
      logger.error({ err }, "Analytics compute failed");
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/analytics/:projectId/summary", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const summary = await computeProjectSummary(projectId);
      res.json(summary);
    } catch (err: any) {
      logger.error({ err }, "Analytics summary failed");
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}
