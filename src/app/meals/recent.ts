import "server-only";
import type { RecentFood } from "@/components/meals/types";
import { db } from "@/lib/db";

/** Distinct recently eaten foods with the values from their latest entry. */
export async function getRecentFoods(limit = 40): Promise<RecentFood[]> {
  const items = await db.mealItem.findMany({
    orderBy: [{ meal: { eatenAt: "desc" } }],
    take: 400,
    select: { name: true, portionG: true, kcal: true, proteinG: true, carbG: true, fatG: true },
  });
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const i of items) {
    const key = i.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(i);
    if (out.length >= limit) break;
  }
  return out;
}
