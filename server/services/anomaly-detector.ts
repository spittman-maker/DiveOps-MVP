import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { AnalyticsMetrics, InsertAnomalyFlag } from "../../shared/schema";
import logger from "../logger";

/**
 * Z-score based statistical anomaly detection.
 * Compares current day metrics against rolling historical averages.
 */

interface AnomalyCheck {
  anomalyType: schema.AnomalyType;
  sourceType: schema.AnomalySourceType;
  severity: schema.AnomalySeverity;
  description: string;
  details: Record<string, unknown>;
}

function zScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Run anomaly detection for a project day.
 * Compares today's snapshot against the last N days of history.
 */
export async function detectAnomalies(
  projectId: string,
  dayId: string,
  snapshotDate: string,
  lookbackDays: number = 14
): Promise<schema.AnomalyFlag[]> {
  // Get historical snapshots
  const snapshots = await db
    .select()
    .from(schema.analyticsSnapshots)
    .where(
      and(
        eq(schema.analyticsSnapshots.projectId, projectId),
        sql`${schema.analyticsSnapshots.snapshotDate} < ${snapshotDate}`
      )
    )
    .orderBy(desc(schema.analyticsSnapshots.snapshotDate))
    .limit(lookbackDays);

  // Get today's snapshot
  const [todaySnap] = await db
    .select()
    .from(schema.analyticsSnapshots)
    .where(
      and(
        eq(schema.analyticsSnapshots.projectId, projectId),
        eq(schema.analyticsSnapshots.snapshotDate, snapshotDate)
      )
    );

  if (!todaySnap) {
    logger.warn({ projectId, snapshotDate }, "No snapshot found for anomaly detection");
    return [];
  }

  const today = todaySnap.metrics as AnalyticsMetrics;
  const history = snapshots.map((s) => s.metrics as AnalyticsMetrics);
  const anomalies: AnomalyCheck[] = [];

  // Need at least 3 days of history for meaningful stats
  if (history.length < 3) {
    // Use absolute thresholds instead
    if (today.maxDepthFsw && today.maxDepthFsw > 190) {
      anomalies.push({
        anomalyType: "depth_spike",
        sourceType: "dive",
        severity: today.maxDepthFsw > 220 ? "critical" : "high",
        description: `Maximum depth ${today.maxDepthFsw} FSW exceeds safety threshold`,
        details: { maxDepth: today.maxDepthFsw, threshold: 190 },
      });
    }
    if (today.safetyEventCount > 3) {
      anomalies.push({
        anomalyType: "safety_escalation",
        sourceType: "log_event",
        severity: today.safetyEventCount > 5 ? "high" : "medium",
        description: `${today.safetyEventCount} safety events detected — elevated count`,
        details: { count: today.safetyEventCount, threshold: 3 },
      });
    }
  } else {
    // Z-score based detection

    // Depth spike detection
    const depthValues = history.map((h) => h.maxDepthFsw).filter((d): d is number => d != null);
    if (today.maxDepthFsw && depthValues.length >= 3) {
      const z = zScore(today.maxDepthFsw, mean(depthValues), stdDev(depthValues));
      if (Math.abs(z) > 2.5) {
        anomalies.push({
          anomalyType: "depth_spike",
          sourceType: "dive",
          severity: Math.abs(z) > 3.5 ? "critical" : Math.abs(z) > 3 ? "high" : "medium",
          description: `Max depth ${today.maxDepthFsw} FSW is ${z.toFixed(1)} std devs from mean (${mean(depthValues).toFixed(0)} FSW)`,
          details: { maxDepth: today.maxDepthFsw, zScore: z, mean: mean(depthValues), stdDev: stdDev(depthValues) },
        });
      }
    }

    // Dive count anomaly
    const diveCountValues = history.map((h) => h.totalDives);
    if (diveCountValues.length >= 3) {
      const z = zScore(today.totalDives, mean(diveCountValues), stdDev(diveCountValues));
      if (Math.abs(z) > 2) {
        anomalies.push({
          anomalyType: "dive_count_anomaly",
          sourceType: "dive",
          severity: Math.abs(z) > 3 ? "high" : "medium",
          description: `Dive count ${today.totalDives} is ${z.toFixed(1)} std devs from mean (${mean(diveCountValues).toFixed(1)})`,
          details: { count: today.totalDives, zScore: z, mean: mean(diveCountValues) },
        });
      }
    }

    // Risk density anomaly
    const riskValues = history.map((h) => h.riskItemsOpened);
    if (riskValues.length >= 3) {
      const z = zScore(today.riskItemsOpened, mean(riskValues), stdDev(riskValues));
      if (z > 2) {
        anomalies.push({
          anomalyType: "risk_density",
          sourceType: "risk",
          severity: z > 3 ? "high" : "medium",
          description: `${today.riskItemsOpened} new risks opened — ${z.toFixed(1)} std devs above mean (${mean(riskValues).toFixed(1)})`,
          details: { risksOpened: today.riskItemsOpened, zScore: z, mean: mean(riskValues) },
        });
      }
    }

    // Safety escalation
    const safetyValues = history.map((h) => h.safetyEventCount);
    if (safetyValues.length >= 3) {
      const z = zScore(today.safetyEventCount, mean(safetyValues), stdDev(safetyValues));
      if (z > 2) {
        anomalies.push({
          anomalyType: "safety_escalation",
          sourceType: "log_event",
          severity: z > 3 ? "critical" : z > 2.5 ? "high" : "medium",
          description: `${today.safetyEventCount} safety events — ${z.toFixed(1)} std devs above mean (${mean(safetyValues).toFixed(1)})`,
          details: { count: today.safetyEventCount, zScore: z, mean: mean(safetyValues) },
        });
      }
    }
  }

  // Missing data detection (always check)
  if (today.totalDives === 0 && today.totalLogEvents === 0) {
    anomalies.push({
      anomalyType: "missing_data",
      sourceType: "analytics",
      severity: "medium",
      description: "No dives or log events recorded for this day — possible data gap",
      details: { totalDives: 0, totalLogEvents: 0 },
    });
  }

  // Persist anomaly flags
  const created: schema.AnomalyFlag[] = [];
  for (const anomaly of anomalies) {
    const flag: InsertAnomalyFlag = {
      projectId,
      dayId,
      sourceType: anomaly.sourceType,
      anomalyType: anomaly.anomalyType,
      severity: anomaly.severity,
      status: "open",
      description: anomaly.description,
      details: anomaly.details,
    };

    const [inserted] = await db
      .insert(schema.anomalyFlags)
      .values(flag)
      .returning();
    created.push(inserted!);
  }

  if (created.length > 0) {
    logger.info(
      { projectId, dayId, snapshotDate, anomalyCount: created.length },
      "Anomalies detected"
    );
  }

  return created;
}