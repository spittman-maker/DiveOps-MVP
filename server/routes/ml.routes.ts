import type { Express, Request, Response } from "express";
import { getParam, validateBody } from "./_helpers";
import { anomalyUpdateSchema } from "./_schemas";
import { predictRisk, predictDelay, computeCrewUtilization } from "../services/risk-predictor";
import { detectAnomalies } from "../services/anomaly-detector";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { requireAuth, requireRole } from "../auth";
import logger from "../logger";

export function registerMlRoutes(app: Express): void {
  // HIGH-02 FIX: All ML routes now require authentication.

  // Risk prediction for a project
  app.get("/api/ml/:projectId/risk", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const result = await predictRisk(projectId);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "Risk prediction failed");
      res.status(500).json({ error: err.message });
    }
  });

  // Delay prediction for a project
  app.get("/api/ml/:projectId/delay", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const result = await predictDelay(projectId);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "Delay prediction failed");
      res.status(500).json({ error: err.message });
    }
  });

  // Crew utilization stats
  app.get("/api/ml/:projectId/crew", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const result = await computeCrewUtilization(projectId);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "Crew utilization failed");
      res.status(500).json({ error: err.message });
    }
  });

  // Get anomaly flags for a project
  app.get("/api/ml/:projectId/anomalies", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const flags = await db
        .select()
        .from(schema.anomalyFlags)
        .where(eq(schema.anomalyFlags.projectId, projectId))
        .orderBy(schema.anomalyFlags.detectedAt);
      res.json({ flags, count: flags.length });
    } catch (err: any) {
      logger.error({ err }, "Anomaly flags fetch failed");
      res.status(500).json({ error: err.message });
    }
  });

  // Update anomaly flag status (admin only)
  app.patch("/api/ml/anomalies/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(getParam(req, "id"), 10);
      const { status, resolvedBy } = validateBody(anomalyUpdateSchema, req.body);

      const updates: Record<string, unknown> = { status };
      if (status === "resolved") {
        updates.resolvedAt = new Date();
        if (resolvedBy) updates.resolvedBy = resolvedBy;
      }

      const [updated] = await db
        .update(schema.anomalyFlags)
        .set(updates)
        .where(eq(schema.anomalyFlags.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: "Anomaly flag not found" });
      res.json(updated);
    } catch (err: any) {
      logger.error({ err }, "Anomaly update failed");
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Run anomaly detection for a project day
  app.post("/api/ml/:projectId/detect", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const { dayId, snapshotDate } = req.body;
      if (!dayId || !snapshotDate) {
        return res.status(400).json({ error: "dayId and snapshotDate required" });
      }

      const anomalies = await detectAnomalies(projectId, dayId, snapshotDate);
      res.json({ anomalies, count: anomalies.length });
    } catch (err: any) {
      logger.error({ err }, "Anomaly detection failed");
      res.status(500).json({ error: err.message });
    }
  });
}
