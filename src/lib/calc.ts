// Energy and body math. Pure functions only - no DB access here.

export type Sex = "male" | "female";
export type Intensity = "light" | "moderate" | "vigorous";

export const KCAL_PER_KG_FAT = 7700;

export const INTENSITY_FACTOR: Record<Intensity, number> = {
  light: 0.8,
  moderate: 1,
  vigorous: 1.25,
};

export const INTENSITY_LABEL: Record<Intensity, string> = {
  light: "Nhẹ",
  moderate: "Vừa",
  vigorous: "Nặng",
};

export interface EnergyProfile {
  sex: string;
  birthYear: number;
  heightCm: number;
  activityFactor: number;
  dailyDeficit: number;
  proteinPerKg: number;
}

export function ageFrom(birthYear: number, now = new Date()): number {
  return now.getFullYear() - birthYear;
}

/** Mifflin-St Jeor resting energy, kcal/day. */
export function bmr(p: Pick<EnergyProfile, "sex" | "birthYear" | "heightCm">, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * ageFrom(p.birthYear);
  return Math.round(p.sex === "female" ? base - 161 : base + 5);
}

/** Everyday burn without logged workouts. */
export function baselineTdee(p: EnergyProfile, weightKg: number): number {
  return Math.round(bmr(p, weightKg) * p.activityFactor);
}

/**
 * Net kcal burned by an activity: (MET x intensity - 1) x kg x hours.
 * The resting 1 MET is subtracted because BMR already counts it.
 */
export function exerciseKcal(met: number, weightKg: number, minutes: number, intensity: Intensity = "moderate"): number {
  const effectiveMet = met * INTENSITY_FACTOR[intensity];
  return Math.max(0, Math.round((effectiveMet - 1) * weightKg * (minutes / 60)));
}

/** Intake target for a day: baseline + that day's exercise - deficit, never below BMR. */
export function intakeTarget(p: EnergyProfile, weightKg: number, exerciseKcalToday: number): number {
  const target = baselineTdee(p, weightKg) + exerciseKcalToday - p.dailyDeficit;
  return Math.max(bmr(p, weightKg), Math.round(target));
}

export function proteinTarget(p: Pick<EnergyProfile, "proteinPerKg">, weightKg: number): number {
  return Math.round(p.proteinPerKg * weightKg);
}

export function kcalFromMacros(proteinG: number, carbG: number, fatG: number): number {
  return Math.round(proteinG * 4 + carbG * 4 + fatG * 9);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** Trailing moving average; null entries are skipped, output is null until a value exists. */
export function movingAverage(values: (number | null)[], window = 7): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return slice.length ? Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100 : null;
  });
}

/** Least-squares slope of y over x. */
export function slope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export interface DayEnergyRecord {
  intakeKcal: number | null; // null when nothing was logged that day
  weightKg: number | null;
}

export interface AdaptiveTdee {
  tdee: number;
  weightTrendKgPerWeek: number;
  avgIntake: number;
  daysLogged: number;
  weighIns: number;
}

/**
 * Real-world TDEE from the user's own data: average intake minus the energy implied
 * by the weight trend. Needs consecutive days, oldest first.
 */
export function adaptiveTdee(days: DayEnergyRecord[], minDays = 14): AdaptiveTdee | null {
  if (days.length < minDays) return null;
  const intakes = days.map((d) => d.intakeKcal).filter((v): v is number => v != null && v > 0);
  const weights = days.flatMap((d, i) => (d.weightKg != null ? [{ x: i, y: d.weightKg }] : []));
  if (intakes.length < Math.ceil(days.length * 0.7) || weights.length < 5) return null;
  const kgPerDay = slope(weights);
  if (kgPerDay == null) return null;
  const avgIntake = intakes.reduce((a, b) => a + b, 0) / intakes.length;
  return {
    tdee: Math.round(avgIntake - kgPerDay * KCAL_PER_KG_FAT),
    weightTrendKgPerWeek: Math.round(kgPerDay * 7 * 100) / 100,
    avgIntake: Math.round(avgIntake),
    daysLogged: intakes.length,
    weighIns: weights.length,
  };
}

/** Weeks to reach goal at a given weekly loss rate, or null if not losing. */
export function weeksToGoal(currentKg: number, goalKg: number, kgPerWeek: number): number | null {
  if (kgPerWeek >= 0 || currentKg <= goalKg) return null;
  return Math.ceil((currentKg - goalKg) / -kgPerWeek);
}
