import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { AnalyticsMetrics } from "../../shared/schema";

/**
 * Compute a daily analytics snapshot for a given project day.
 * Aggregates dives, log events, risks, and daily summary data.
 */
export async function computeDaySnapshot(
  projectId: string,
  dayId: string,
  snapshotDate: string
): Promise<schema.AnalyticsSnapshot> {
  // Fetch all data for this day in parallel
  const [dives, logEvents, riskItems, dailySummary] = await Promise.all([
    db.select().from(schema.dives).where(eq(schema.dives.dayId, dayId)),
    db.select().from(schema.logEvents).where(eq(schema.logEvents.dayId, dayId)),
    db.select().from(schema.riskItems).where(eq(schema.riskItems.dayId, dayId)),
    db.select().from(schema.dailySummaries).where(eq(schema.dailySummaries.dayId, dayId)),
  ]);

  // Compute dive metrics
  const depths = dives.map((d) => d.maxDepthFsw).filter((d): d is number => d != null);
  const bottomTimes = dives
    .map((d) => {
      if (!d.rbTime || !d.lbTime) return null;
      return (d.lbTime.getTime() - d.rbTime.getTime()) / 60000;
    })
    .filter((t): t is number => t != null && t > 0);

  const uniqueDiverIds = new Set(
    dives.map((d) => d.diverId || d.diverDisplayName).filter(Boolean)
  );

  const divesPerDiver: Record<string, number> = {};
  for (const dive of dives) {
    const key = dive.diverDisplayName || dive.diverId || "unknown";
    divesPerDiver[key] = (divesPerDiver[key] || 0) + 1;
  }

  // Count event categories
  const safetyEventCount = logEvents.filter((e) => e.category === "safety").length;
  const directiveCount = logEvents.filter((e) => e.category === "directive").length;

  // Risk counts
  const riskItemsOpened = riskItems.length;
  const riskItemsClosed = riskItems.filter((r) => r.status === "closed").length;
  const riskItemsOpen = riskItems.filter((r) => r.status === "open").length;

  // Decomp dives
  const decompDivesCount = dives.filter((d) => d.decompRequired === "Y").length;

  const summary = dailySummary[0];

  const metrics: AnalyticsMetrics = {
    totalDives: dives.length,
    avgBottomTimeMin:
      bottomTimes.length > 0
        ? Math.round((bottomTimes.reduce((a, b) => a + b, 0) / bottomTimes.length) * 10) / 10
        : null,
    maxDepthFsw: depths.length > 0 ? Math.max(...depths) : null,
    avgDepthFsw:
      depths.length > 0
        ? Math.round((depths.reduce((a, b) => a + b, 0) / depths.length) * 10) / 10
        : null,
    decompDivesCount,
    uniqueDivers: uniqueDiverIds.size,
    totalLogEvents: logEvents.length,
    safetyEventCount,
    directiveCount,
    riskItemsOpened,
    riskItemsClosed,
    riskItemsOpen,
    hoursWorked: summary?.hoursWorked ?? null,
    personnelCount: summary?.personnelCount ?? null,
    divesPerDiver,
    weatherSummary: summary?.weather ?? null,
  };

  // Upsert snapshot
  const existing = await db
    .select()
    .from(schema.analyticsSnapshots)
    .where(
      and(
        eq(schema.analyticsSnapshots.projectId, projectId),
        eq(schema.analyticsSnapshots.snapshotDate, snapshotDate)
      )
    );

  if (existing.length > 0) {
    const [updated] = await db
      .update(schema.analyticsSnapshots)
      .set({ metrics, dayId, updatedAt: new Date() })
      .where(eq(schema.analyticsSnapshots.id, existing[0].id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(schema.analyticsSnapshots)
    .values({ projectId, dayId, snapshotDate, metrics })
    .returning();
  return created!;
}

/**
 * Compute project-level trends over a date range.
 */
export async function computeProjectTrends(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<{
  snapshots: schema.AnalyticsSnapshot[];
  averages: {
    avgDivesPerDay: number;
    avgDepth: number | null;
    avgBottomTime: number | null;
    totalSafetyEvents: number;
    totalRisksOpened: number;
    totalDives: number;
    daysTracked: number;
  };
}> {
  const snapshots = await db
    .select()
    .from(schema.analyticsSnapshots)
    .where(
      and(
        eq(schema.analyticsSnapshots.projectId, projectId),
        sql`${schema.analyticsSnapshots.snapshotDate} >= ${startDate}`,
        sql`${schema.analyticsSnapshots.snapshotDate} <= ${endDate}`
      )
    )
    .orderBy(schema.analyticsSnapshots.snapshotDate);

  const daysTracked = snapshots.length;
  if (daysTracked === 0) {
    return {
      snapshots: [],
      averages: {
        avgDivesPerDay: 0,
        avgDepth: null,
        avgBottomTime: null,
        totalSafetyEvents: 0,
        totalRisksOpened: 0,
        totalDives: 0,
        daysTracked: 0,
      },
    };
  }

  const totalDives = snapshots.reduce((s, snap) => s + (snap.metrics as AnalyticsMetrics).totalDives, 0);
  const depths = snapshots
    .map((s) => (s.metrics as AnalyticsMetrics).avgDepthFsw)
    .filter((d): d is number => d != null);
  const bottomTimes = snapshots
    .map((s) => (s.metrics as AnalyticsMetrics).avgBottomTimeMin)
    .filter((t): t is number => t != null);
  const totalSafetyEvents = snapshots.reduce(
    (s, snap) => s + (snap.metrics as AnalyticsMetrics).safetyEventCount,
    0
  );
  const totalRisksOpened = snapshots.reduce(
    (s, snap) => s + (snap.metrics as AnalyticsMetrics).riskItemsOpened,
    0
  );

  return {
    snapshots,
    averages: {
      avgDivesPerDay: Math.round((totalDives / daysTracked) * 10) / 10,
      avgDepth:
        depths.length > 0
          ? Math.round((depths.reduce((a, b) => a + b, 0) / depths.length) * 10) / 10
          : null,
      avgBottomTime:
        bottomTimes.length > 0
          ? Math.round((bottomTimes.reduce((a, b) => a + b, 0) / bottomTimes.length) * 10) / 10
          : null,
      totalSafetyEvents,
      totalRisksOpened,
      totalDives,
      daysTracked,
    },
  };
}

/**
 * Get a project-level summary (all-time stats).
 */
export async function computeProjectSummary(projectId: string): Promise<{
  totalDays: number;
  totalDives: number;
  totalLogEvents: number;
  totalRisks: number;
  openRisks: number;
  avgDivesPerDay: number;
  maxDepthEver: number | null;
  safetyEventRate: number;
}> {
  const snapshots = await db
    .select()
    .from(schema.analyticsSnapshots)
    .where(eq(schema.analyticsSnapshots.projectId, projectId));

  const totalDays = snapshots.length;
  if (totalDays === 0) {
    return {
      totalDays: 0,
      totalDives: 0,
      totalLogEvents: 0,
      totalRisks: 0,
      openRisks: 0,
      avgDivesPerDay: 0,
      maxDepthEver: null,
      safetyEventRate: 0,
    };
  }

  const totalDives = snapshots.reduce((s, snap) => s + (snap.metrics as AnalyticsMetrics).totalDives, 0);
  const totalLogEvents = snapshots.reduce(
    (s, snap) => s + (snap.metrics as AnalyticsMetrics).totalLogEvents,
    0
  );
  const totalRisks = snapshots.reduce(
    (s, snap) => s + (snap.metrics as AnalyticsMetrics).riskItemsOpened,
    0
  );
  const openRisks = snapshots.reduce(
    (s, snap) => s + (snap.metrics as AnalyticsMetrics).riskItemsOpen,
    0
  );
  const safetyEvents = snapshots.reduce(
    (s, snap) => s + (snap.metrics as AnalyticsMetrics).safetyEventCount,
    0
  );
  const depths = snapshots
    .map((s) => (s.metrics as AnalyticsMetrics).maxDepthFsw)
    .filter((d): d is number => d != null);

  return {
    totalDays,
    totalDives,
    totalLogEvents,
    totalRisks,
    openRisks,
    avgDivesPerDay: Math.round((totalDives / totalDays) * 10) / 10,
    maxDepthEver: depths.length > 0 ? Math.max(...depths) : null,
    safetyEventRate: totalDays > 0 ? Math.round((safetyEvents / totalDays) * 100) / 100 : 0,
  };
}