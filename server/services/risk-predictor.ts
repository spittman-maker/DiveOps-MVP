import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { MlPredictionResult, InsertMlPrediction } from "../../shared/schema";
import { getAnthropicClient, AI_MODEL } from "../ai-client";
import logger from "../logger";

// Simple in-memory TTL cache (1 hour)
const predictionCache = new Map<string, { result: MlPredictionResult; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCacheKey(projectId: string, type: string): string {
  return `${projectId}:${type}`;
}

/**
 * Gather recent project context for AI predictions.
 */
async function gatherProjectContext(projectId: string, lookbackDays: number = 14): Promise<string> {
  const snapshots = await db
    .select()
    .from(schema.analyticsSnapshots)
    .where(eq(schema.analyticsSnapshots.projectId, projectId))
    .orderBy(desc(schema.analyticsSnapshots.snapshotDate))
    .limit(lookbackDays);

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId));

  const recentAnomalies = await db
    .select()
    .from(schema.anomalyFlags)
    .where(
      and(
        eq(schema.anomalyFlags.projectId, projectId),
        eq(schema.anomalyFlags.status, "open")
      )
    )
    .limit(20);

  let context = `Project: ${project?.name || projectId}\n`;
  context += `Client: ${(project as any)?.clientName || "—"}\n`;
  context += `Jobsite: ${(project as any)?.jobsiteName || "—"}\n\n`;

  if (snapshots.length > 0) {
    context += `## Last ${snapshots.length} Days of Analytics:\n`;
    for (const snap of snapshots.reverse()) {
      const m = snap.metrics as schema.AnalyticsMetrics;
      context += `${snap.snapshotDate}: ${m.totalDives} dives, max depth ${m.maxDepthFsw ?? "—"} FSW, `;
      context += `${m.safetyEventCount} safety events, ${m.riskItemsOpen} open risks\n`;
    }
  }

  if (recentAnomalies.length > 0) {
    context += `\n## Open Anomalies (${recentAnomalies.length}):\n`;
    for (const a of recentAnomalies) {
      context += `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description}\n`;
    }
  }

  return context;
}

/**
 * AI-powered risk prediction using Anthropic Claude.
 */
export async function predictRisk(projectId: string): Promise<MlPredictionResult> {
  const cacheKey = getCacheKey(projectId, "risk");
  const cached = predictionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const context = await gatherProjectContext(projectId);
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a commercial diving operations risk analyst. Based on the following project data, provide a risk assessment.

${context}

Respond in JSON format:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "confidence": 0.0-1.0,
  "factors": ["list of key risk factors"],
  "recommendations": ["list of actionable recommendations"]
}

Only output valid JSON, no other text.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let result: MlPredictionResult;

  try {
    const parsed = JSON.parse(text);
    result = {
      riskLevel: parsed.riskLevel,
      confidence: parsed.confidence,
      factors: parsed.factors,
      recommendations: parsed.recommendations,
      rawResponse: text,
    };
  } catch {
    logger.warn({ projectId, text }, "Failed to parse risk prediction response");
    result = {
      riskLevel: "medium",
      confidence: 0.5,
      factors: ["Unable to parse AI response"],
      recommendations: ["Review manually"],
      rawResponse: text,
    };
  }

  // Cache and persist
  predictionCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  const prediction: InsertMlPrediction = {
    projectId,
    predictionType: "risk",
    result,
    modelVersion: AI_MODEL,
    expiresAt: new Date(Date.now() + CACHE_TTL_MS),
  };

  await db.insert(schema.mlPredictions).values(prediction as any);
  logger.info({ projectId, riskLevel: result.riskLevel }, "Risk prediction generated");

  return result;
}

/**
 * AI-powered delay prediction.
 */
export async function predictDelay(projectId: string): Promise<MlPredictionResult> {
  const cacheKey = getCacheKey(projectId, "delay");
  const cached = predictionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const context = await gatherProjectContext(projectId);
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a commercial diving project scheduling analyst. Based on the following project data, predict potential delays.

${context}

Respond in JSON format:
{
  "predictedDelay": <number of hours likely delay, 0 if none>,
  "confidence": 0.0-1.0,
  "delayReasons": ["list of potential delay causes"],
  "recommendations": ["list of mitigation actions"]
}

Only output valid JSON, no other text.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let result: MlPredictionResult;

  try {
    const parsed = JSON.parse(text);
    result = {
      predictedDelay: parsed.predictedDelay,
      confidence: parsed.confidence,
      delayReasons: parsed.delayReasons,
      recommendations: parsed.recommendations,
      rawResponse: text,
    };
  } catch {
    result = {
      predictedDelay: 0,
      confidence: 0.5,
      delayReasons: ["Unable to parse AI response"],
      recommendations: ["Review manually"],
      rawResponse: text,
    };
  }

  predictionCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  await db.insert(schema.mlPredictions).values({
    projectId,
    predictionType: "delay",
    result,
    modelVersion: AI_MODEL,
    expiresAt: new Date(Date.now() + CACHE_TTL_MS),
  } as any);

  return result;
}

/**
 * Crew utilization stats (computed, not AI).
 */
export async function computeCrewUtilization(projectId: string): Promise<MlPredictionResult> {
  const snapshots = await db
    .select()
    .from(schema.analyticsSnapshots)
    .where(eq(schema.analyticsSnapshots.projectId, projectId))
    .orderBy(desc(schema.analyticsSnapshots.snapshotDate))
    .limit(7);

  if (snapshots.length === 0) {
    return { crewUtilization: 0, confidence: 0, factors: ["No data available"] };
  }

  const metrics = snapshots.map((s) => s.metrics as schema.AnalyticsMetrics);
  const avgDivers = metrics.reduce((s, m) => s + m.uniqueDivers, 0) / metrics.length;
  const avgDives = metrics.reduce((s, m) => s + m.totalDives, 0) / metrics.length;
  const utilization = avgDivers > 0 ? Math.min((avgDives / (avgDivers * 3)) * 100, 100) : 0;

  return {
    crewUtilization: Math.round(utilization * 10) / 10,
    confidence: Math.min(snapshots.length / 7, 1),
    factors: [
      `Avg ${avgDivers.toFixed(1)} divers/day`,
      `Avg ${avgDives.toFixed(1)} dives/day`,
      `${snapshots.length} days of data`,
    ],
  };
}