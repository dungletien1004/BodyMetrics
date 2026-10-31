import { z } from "zod";

/** Shape of a weekly report saved before AI-backed reports were retired. */
export const WeeklyReportSchema = z.object({
  summary: z.string(),
  wins: z.array(z.string()),
  issues: z.array(z.string()),
  recommendations: z.array(z.object({ title: z.string(), detail: z.string() })),
  nextWeekTargets: z.object({
    kcal: z.number(),
    proteinG: z.number(),
    workouts: z.number(),
  }),
});

export type WeeklyReportContent = z.infer<typeof WeeklyReportSchema>;

/** Parse a stored report; null if it isn't the structured JSON shape. */
export function parseReportContent(content: string): WeeklyReportContent | null {
  try {
    const result = WeeklyReportSchema.safeParse(JSON.parse(content));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
