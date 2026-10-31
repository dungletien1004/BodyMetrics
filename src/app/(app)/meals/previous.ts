import "server-only";
import { format } from "date-fns";
import type { MealType, PreviousMeal } from "@/components/meals/types";
import { isMealType } from "@/components/meals/types";
import { shiftDay } from "@/lib/dates";
import { db } from "@/lib/db";

/** Meals of the day before `date`, merged per meal type: the source for "Lặp lại bữa hôm qua". */
export async function getPreviousDayMeals(userId: string, date: string): Promise<Partial<Record<MealType, PreviousMeal>>> {
  const meals = await db.meal.findMany({
    where: { userId, date: shiftDay(date, -1) },
    orderBy: { eatenAt: "asc" },
    include: { items: true },
  });
  const out: Partial<Record<MealType, PreviousMeal>> = {};
  for (const m of meals) {
    if (!isMealType(m.type) || !m.items.length) continue;
    const entry = (out[m.type] ??= { time: format(m.eatenAt, "HH:mm"), items: [], kcal: 0 });
    for (const i of m.items) {
      entry.items.push({
        name: i.name,
        portionG: i.portionG,
        kcal: i.kcal,
        proteinG: i.proteinG,
        carbG: i.carbG,
        fatG: i.fatG,
        source: i.source === "ai" ? "ai" : "manual",
        confidence: i.confidence,
      });
      entry.kcal += i.kcal;
    }
  }
  return out;
}
