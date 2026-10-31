export interface MealItemForDuplicateCheck {
  name: string;
  portionG: number | null;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

function duplicateKey(item: MealItemForDuplicateCheck): string {
  const name = item.name
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
  return JSON.stringify([name, item.portionG, item.kcal, item.proteinG, item.carbG, item.fatG]);
}

/** True when two food rows repeat the same name, portion and nutrition values. */
export function areDuplicateMealItems(a: MealItemForDuplicateCheck, b: MealItemForDuplicateCheck): boolean {
  return duplicateKey(a) === duplicateKey(b);
}

export function hasDuplicateMealItems(items: MealItemForDuplicateCheck[]): boolean {
  const keys = new Set<string>();
  for (const item of items) {
    const key = duplicateKey(item);
    if (keys.has(key)) return true;
    keys.add(key);
  }
  return false;
}
