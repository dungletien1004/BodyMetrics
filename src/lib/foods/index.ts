// Static Vietnamese food database and its search. Client-safe: the meal editor searches it in the browser.
import { FOODS, type Food, type FoodPortion } from "./data";

export { FOOD_CATEGORY_LABEL, FOODS, type Food, type FoodCategory, type FoodPortion } from "./data";

/** Lowercase, strip Vietnamese accents (incl. đ) and collapse punctuation to single spaces. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

export interface Nutrition {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

/** Values for `grams` of a food (unrounded). */
export function nutritionFor(food: Food, grams: number): Nutrition {
  const k = grams / 100;
  return { kcal: food.kcal * k, proteinG: food.proteinG * k, carbG: food.carbG * k, fatG: food.fatG * k };
}

/**
 * How well `query` matches `text` (both normalized): 0 = no match.
 * Whole-phrase matches beat every-word-prefix matches, which beat plain substrings.
 */
function scoreText(text: string, q: string, tokens: string[]): number {
  if (text === q) return 100;
  if (text.startsWith(q)) return 85 + (text[q.length] === " " ? 5 : 0);
  if (text.includes(` ${q}`)) return 70;
  const words = text.split(" ");
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) {
    // Bonus when the first query word is the first word of the name ("banh mi" -> "Bánh mì thịt").
    return 55 + (words[0].startsWith(tokens[0]) ? 5 : 0);
  }
  if (q.length >= 3 && text.includes(q)) return 30;
  return 0;
}

interface Indexed {
  food: Food;
  name: string;
  aliases: string[];
}

const INDEX: Indexed[] = FOODS.map((food) => ({ food, name: normalize(food.name), aliases: food.aliases.map(normalize) }));
const BY_NAME = new Map(INDEX.map((i) => [i.name, i.food]));

/** Score of one food for a normalized query; an alias match counts slightly less than the name. */
function scoreFood(i: Indexed, q: string, tokens: string[]): number {
  let best = scoreText(i.name, q, tokens);
  for (const a of i.aliases) best = Math.max(best, scoreText(a, q, tokens) - 3);
  return best;
}

export interface Scored<T> {
  item: T;
  score: number;
}

/** Rank arbitrary named things (e.g. the user's recent foods) with the same rules as the food database. */
export function rankByName<T>(items: T[], query: string, nameOf: (t: T) => string): Scored<T>[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ");
  return items
    .map((item) => ({ item, score: scoreText(normalize(nameOf(item)), q, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || nameOf(a.item).length - nameOf(b.item).length);
}

/** Best matches first; ties go to shorter names, then to the database order (common foods first). */
export function searchFoods(query: string, limit = 8): Scored<Food>[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ");
  // Typed with accents ("phở"): prefer names containing exactly those letters over "phô mai".
  const raw = query.trim().toLowerCase().normalize("NFC");
  const accented = raw !== q;
  const out: (Scored<Food> & { idx: number })[] = [];
  INDEX.forEach((i, idx) => {
    let score = scoreFood(i, q, tokens);
    if (score > 0 && accented && i.food.name.toLowerCase().normalize("NFC").includes(raw)) score += 8;
    if (score > 0) out.push({ item: i.food, score, idx });
  });
  out.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length || a.idx - b.idx);
  return out.slice(0, limit).map(({ item, score }) => ({ item, score }));
}

/** The database food with exactly this name (accent/case-insensitive), to offer its portions again. */
export function findFoodByName(name: string): Food | undefined {
  return BY_NAME.get(normalize(name));
}

/** Portion that `grams` corresponds to, as `qty` × portion (qty in halves, up to 10). */
export function matchPortion(portions: FoodPortion[], grams: number | null): { idx: number; qty: number } | null {
  if (!grams || grams <= 0) return null;
  for (const exact of [true, false]) {
    for (let idx = 0; idx < portions.length; idx++) {
      const qty = grams / portions[idx].g;
      if (exact ? Math.abs(qty - 1) < 1e-6 : Math.abs(qty * 2 - Math.round(qty * 2)) < 1e-6 && qty >= 0.5 && qty <= 10) {
        return { idx, qty: exact ? 1 : Math.round(qty * 2) / 2 };
      }
    }
  }
  return null;
}

const ZERO_KCAL =
  /^(nuoc( loc| suoi| khoang| tinh khiet| loc dong chai)?|water|tra( da| nong| xanh| den| tac| chanh| o long| sen| atiso)?|ca phe( den)?( da| nong)?|cafe( den)?( da| nong)?|americano|espresso|soda|coca zero|pepsi zero|diet coke)( khong duong| khong calo)?$/;

/** Drinks that really have ~0 kcal, so an item with no kcal is not a mistake. */
export function isZeroKcalName(name: string): boolean {
  const n = normalize(name);
  if (!n) return false;
  const food = BY_NAME.get(n);
  if (food) return food.kcal < 5;
  // "trà không đường", "cà phê đen đá không đường" - but not "trà sữa không đường".
  return ZERO_KCAL.test(n) || (/\bkhong (duong|calo)\b/.test(n) && /\b(tra|ca phe|cafe|nuoc|soda)\b/.test(n) && !/\b(sua|tran chau)\b/.test(n));
}
