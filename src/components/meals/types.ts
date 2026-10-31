// Shared meal types and helpers, safe to import from client and server code.

export const MEAL_TYPES = [
  { value: "breakfast", label: "Sáng" },
  { value: "lunch", label: "Trưa" },
  { value: "dinner", label: "Tối" },
  { value: "snack", label: "Ăn vặt" },
] as const;

export type MealType = (typeof MEAL_TYPES)[number]["value"];

export function isMealType(v: unknown): v is MealType {
  return MEAL_TYPES.some((t) => t.value === v);
}

export function mealTypeLabel(v: string): string {
  return MEAL_TYPES.find((t) => t.value === v)?.label ?? v;
}

/** Best guess of the meal type from the time of day. */
export function defaultMealType(d: Date = new Date()): MealType {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 4 && h < 10.5) return "breakfast";
  if (h >= 10.5 && h < 14.5) return "lunch";
  if (h >= 17 && h < 21.5) return "dinner";
  return "snack";
}

/** Items below this confidence are flagged for review. */
export const LOW_CONFIDENCE = 0.6;

/** One food line as sent from the editor to the save action. */
export interface MealItemInput {
  name: string;
  portionG: number | null;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  source: "ai" | "manual";
  confidence: number | null;
}

export interface MealInput {
  date: string; // YYYY-MM-DD
  type: MealType;
  time: string; // HH:mm, local
  note: string;
  items: MealItemInput[];
  photoId: string | null; // photo uploaded in this editing session, to link to the meal
}

/** A recently eaten food, offered as a one-tap quick add. */
export interface RecentFood {
  name: string;
  portionG: number | null;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

/** One meal type's items from the previous day, offered as "Lặp lại bữa … hôm qua". */
export interface PreviousMeal {
  /** Time of the first meal of that type, HH:mm. */
  time: string;
  items: MealItemInput[];
  kcal: number;
}
