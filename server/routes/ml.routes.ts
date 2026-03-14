import type { Express, Request, Response } from "express";
import { getParam, getUser, validateBody } from "./_helpers";
import { anomalyUpdateSchema, anomalyDetectSchema, predictionGenerateSchema } from "./_schemas";
import { predictRisk, predictDelay, computeCrewUtilization } from "../services/risk-predictor";
import { detectAnomalies } from "../services/anomaly-detector";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitAuditEvent } from "../audit";
import logger from "../logger";
import type { User } from "@shared/schema";

export function registerMlRoutes(app: Express): void {
  // ══════════════════════════════════════════════════════════════════════════
  // ANOMALY ROUTES — /api/projects/:projectId/anomalies
  // ══════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/projects/:projectId/anomalies
  // Get anomaly flags for a project.
  // Requires: authenticated user
  // ──────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/projects/:projectId/anomalies",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const flags = await storage.getAnomalyFlagsByProject(projectId);
        res.json({ flags, count: flags.length });
      } catch (err: any) {
        logger.error({ err }, "Failed to get anomaly flags");
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/projects/:projectId/anomalies/detect
  // Trigger anomaly detection for a project day.
  // Requires: SUPERVISOR, ADMIN, or GOD role
  // ──────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/projects/:projectId/anomalies/detect",
    requireRole("SUPERVISOR", "ADMIN", "GOD"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const { dayId, snapshotDate, lookbackDays } = validateBody(anomalyDetectSchema, req.body);

        const anomalies = await detectAnomalies(projectId, dayId, snapshotDate, lookbackDays);

        // Audit log
        const user = req.user as User;
        await emitAuditEvent(
          {
            correlationId: (req as any).correlationId || `anom-${Date.now()}`,
            userId: user.id,
            userRole: user.role,
            projectId,
            dayId,
          },
          "anomaly.detect",
          {
            targetType: "anomaly_flag",
            metadata: {
              snapshotDate,
              dayId,
              projectId,
              anomaliesDetected: anomalies.length,
              lookbackDays: lookbackDays || 14,
            },
          }
        );

        res.status(201).json({ anomalies, count: anomalies.length });
      } catch (err: any) {
        logger.error({ err }, "Anomaly detection failed");
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/projects/:projectId/anomalies/:id
  // Update anomaly flag (acknowledge, dismiss, resolve).
  // Requires: SUPERVISOR, ADMIN, or GOD role
  // ──────────────────────────────────────────────────────────────────────────
  app.patch(
    "/api/projects/:projectId/anomalies/:id",
    requireRole("SUPERVISOR", "ADMIN", "GOD"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const id = parseInt(getParam(req, "id"), 10);
        if (isNaN(id)) {
          return res.status(400).json({ error: "Invalid anomaly flag ID — must be a number" });
        }

        const { status, resolvedBy } = validateBody(anomalyUpdateSchema, req.body);
        const user = req.user as User;

        const updates: Record<string, unknown> = { status };
        if (status === "resolved" || status === "false_positive") {
          updates.resolvedAt = new Date();
          updates.resolvedBy = resolvedBy || user.id;
        }

        const updated = await storage.updateAnomalyFlag(id, updates as any);
        if (!updated) {
          return res.status(404).json({ error: "Anomaly flag not found" });
        }

        // Determine audit action based on status
        const auditAction = status === "acknowledged" ? "anomaly.acknowledge" as const : "anomaly.dismiss" as const;

        await emitAuditEvent(
          {
            correlationId: (req as any).correlationId || `anom-upd-${Date.now()}`,
            userId: user.id,
            userRole: user.role,
            projectId,
          },
          auditAction,
          {
            targetId: String(id),
            targetType: "anomaly_flag",
            before: { status: "open" },
            after: { status, resolvedBy: updates.resolvedBy || null },
            metadata: { projectId, anomalyId: id },
          }
        );

        res.json(updated);
      } catch (err: any) {
        logger.error({ err }, "Anomaly flag update failed");
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // PREDICTION ROUTES — /api/projects/:projectId/predictions
  // ══════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/projects/:projectId/predictions
  // Get latest ML predictions for a project.
  // Requires: authenticated user
  // ──────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/projects/:projectId/predictions",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const type = typeof req.query.type === "string" ? req.query.type : undefined;

        const prediction = await storage.getLatestMlPrediction(projectId, type);
        if (!prediction) {
          return res.json({ prediction: null, message: "No predictions available for this project" });
        }

        res.json({ prediction });
      } catch (err: any) {
        logger.error({ err }, "Failed to get ML predictions");
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/projects/:projectId/predictions/generate
  // Trigger risk/delay/crew prediction generation.
  // Requires: SUPERVISOR, ADMIN, or GOD role
  // ──────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/projects/:projectId/predictions/generate",
    requireRole("SUPERVISOR", "ADMIN", "GOD"),
    async (req: Request, res: Response) => {
      try {
        const projectId = getParam(req, "projectId");
        const { predictionType } = validateBody(predictionGenerateSchema, req.body);

        let result;
        switch (predictionType) {
          case "delay":
            result = await predictDelay(projectId);
            break;
          case "crew_utilization":
            result = await computeCrewUtilization(projectId);
            break;
          case "risk":
          default:
            result = await predictRisk(projectId);
            break;
        }

        // Audit log
        const user = req.user as User;
        await emitAuditEvent(
          {
            correlationId: (req as any).correlationId || `pred-${Date.now()}`,
            userId: user.id,
            userRole: user.role,
            projectId,
          },
          "prediction.generate",
          {
            targetType: "ml_prediction",
            metadata: {
              projectId,
              predictionType,
              riskLevel: result.riskLevel || null,
              confidence: result.confidence || null,
            },
          }
        );

        res.status(201).json({ prediction: result, predictionType });
      } catch (err: any) {
        logger.error({ err }, "Prediction generation failed");
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // LEGACY ROUTES (backward compatibility with existing frontend)
  // ══════════════════════════════════════════════════════════════════════════

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

  app.get("/api/ml/:projectId/anomalies", requireAuth, async (req: Request, res: Response) => {
    try {
      const projectId = getParam(req, "projectId");
      const flags = await storage.getAnomalyFlagsByProject(projectId);
      res.json({ flags, count: flags.length });
    } catch (err: any) {
      logger.error({ err }, "Anomaly flags fetch failed");
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/ml/anomalies/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(getParam(req, "id"), 10);
      const { status, resolvedBy } = validateBody(anomalyUpdateSchema, req.body);

      const updates: Record<string, unknown> = { status };
      if (status === "resolved") {
        updates.resolvedAt = new Date();
        if (resolvedBy) updates.resolvedBy = resolvedBy;
      }

      const updated = await storage.updateAnomalyFlag(id, updates as any);
      if (!updated) return res.status(404).json({ error: "Anomaly flag not found" });
      res.json(updated);
    } catch (err: any) {
      logger.error({ err }, "Anomaly update failed");
      res.status(err.status || 500).json({ error: err.message });
    }
  });

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
