import type { Express, Request, Response } from "express";
import { getParam, getQuery, validateBody, getTodayDate } from "./_helpers";
import { analyticsComputeSchema } from "./_schemas";
import {
  computeDaySnapshot,
  computeProjectTrends,
  computeProjectSummary,
} from "../services/analytics-aggregator";
import { requireAuth } from "../auth";
import logger from "../logger";

export function registerAnalyticsRoutes(app: Express): void {
  // HIGH-02 FIX: All analytics routes now require authentication.

  // Get analytics snapshot for a project + date
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

  // Get project trends over a date range
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

  // Compute and store a day snapshot
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

  // Get project summary (all-time)
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
