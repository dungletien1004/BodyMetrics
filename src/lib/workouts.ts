// Workout helpers shared by server pages, server actions and the client builder.
// Pure functions only - DB queries live in src/app/workouts/queries.ts.
import type { Intensity } from "./calc";

export type Category = "strength" | "cardio" | "hiit" | "other";

export const CATEGORIES: Category[] = ["strength", "cardio", "hiit", "other"];

export const CATEGORY_LABEL: Record<Category, string> = {
  strength: "Sức mạnh",
  cardio: "Cardio",
  hiit: "HIIT",
  other: "Khác",
};

export const INTENSITIES: Intensity[] = ["light", "moderate", "vigorous"];

export function isCategory(s: unknown): s is Category {
  return typeof s === "string" && (CATEGORIES as string[]).includes(s);
}

export function isIntensity(s: unknown): s is Intensity {
  return typeof s === "string" && (INTENSITIES as string[]).includes(s);
}

export function categoryLabel(s: string): string {
  return isCategory(s) ? CATEGORY_LABEL[s] : s;
}

/** Library order: strength, cardio, hiit, other, then by name. */
export function compareExercises(a: { category: string; name: string }, b: { category: string; name: string }): number {
  const rank = (c: string) => (isCategory(c) ? CATEGORIES.indexOf(c) : CATEGORIES.length);
  return rank(a.category) - rank(b.category) || a.name.localeCompare(b.name, "vi");
}

/** Strength minutes guessed from the number of sets until the user types their own. */
export const MINUTES_PER_SET = 3;
export const DEFAULT_CARDIO_MINUTES = 30;

export interface SetLike {
  reps: number | null;
  weightKg: number | null;
}

/** Sum of reps x kg; sets without a weight (bodyweight) count as 0. */
export function setsVolume(sets: SetLike[]): number {
  return sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weightKg ?? 0), 0);
}

/** Epley estimated one-rep max: kg x (1 + reps/30). A single rep is the max itself. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Heaviest set (ties broken by reps), or null when no set has a weight. */
export function bestSet<T extends SetLike>(sets: T[]): T | null {
  let best: T | null = null;
  for (const s of sets) {
    if (!s.weightKg || !s.reps) continue;
    if (!best || s.weightKg > best.weightKg! || (s.weightKg === best.weightKg && s.reps > best.reps!)) best = s;
  }
  return best;
}

export function best1RM(sets: SetLike[]): number {
  return sets.reduce((m, s) => Math.max(m, epley1RM(s.weightKg ?? 0, s.reps ?? 0)), 0);
}

/** Workout burn: the smartwatch number when set, otherwise the sum of entry estimates. */
export function workoutKcal(w: { kcalOverride: number | null; entries: { kcal: number }[] }): number {
  return w.kcalOverride ?? w.entries.reduce((a, e) => a + e.kcal, 0);
}

const kgFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** "3 × 10 × 60 kg" when every set matches, else "10×60 · 8×65 · 6×70 kg". */
export function setsSummary(sets: SetLike[]): string {
  const done = sets.filter((s) => s.reps || s.weightKg);
  if (!done.length) return "";
  const same = done.every((s) => s.reps === done[0].reps && s.weightKg === done[0].weightKg);
  const one = (s: SetLike) => [s.reps ?? "?", s.weightKg ? kgFmt.format(s.weightKg) : null].filter((x) => x != null).join("×");
  if (same) {
    const s = done[0];
    return `${done.length} × ${s.reps ?? "?"}${s.weightKg ? ` × ${kgFmt.format(s.weightKg)} kg` : " lần"}`;
  }
  return done.map(one).join(" · ") + (done.some((s) => s.weightKg) ? " kg" : "");
}

/** Local "HH:mm" of a timestamp. */
export function timeOfDay(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// What the builder submits. Kcal is deliberately absent: the server recomputes it.
export interface WorkoutPayload {
  date: string;
  startTime: string; // HH:mm
  durationMin: number | null; // null -> sum of entry minutes
  kcalOverride: number | null;
  note: string;
  entries: {
    exerciseId: string;
    durationMin: number;
    intensity: Intensity;
    distanceKm: number | null;
    sets: SetLike[];
  }[];
}

/** Builder prefill from a stored workout (edit or "repeat"). */
export function payloadFromWorkout(
  w: {
    date: string;
    startedAt: Date;
    durationMin: number;
    kcalOverride: number | null;
    note: string | null;
    entries: { exerciseId: string; durationMin: number; intensity: string; distanceKm: number | null; sets: SetLike[] }[];
  },
  overrides: Partial<WorkoutPayload> = {},
): WorkoutPayload {
  const activeSum = Math.round(w.entries.reduce((a, e) => a + e.durationMin, 0));
  return {
    date: w.date,
    startTime: timeOfDay(w.startedAt),
    durationMin: w.durationMin === activeSum ? null : w.durationMin, // null keeps following the entries

    kcalOverride: w.kcalOverride,
    note: w.note ?? "",
    entries: w.entries.map((e) => ({
      exerciseId: e.exerciseId,
      durationMin: e.durationMin,
      intensity: isIntensity(e.intensity) ? e.intensity : "moderate",
      distanceKm: e.distanceKm,
      sets: e.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
    })),
    ...overrides,
  };
}
