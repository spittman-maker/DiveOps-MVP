import { z } from "zod";

export const analyticsComputeSchema = z.object({
  projectId: z.string().min(1),
  dayId: z.string().min(1),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const anomalyUpdateSchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved", "false_positive"]),
  resolvedBy: z.string().optional(),
});