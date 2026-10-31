import { format } from "date-fns";
import { notFound } from "next/navigation";
import { DeleteMealButton } from "@/components/meals/delete-meal-button";
import { MealEditor } from "@/components/meals/meal-editor";
import { RepeatMealButton } from "@/components/meals/repeat-meal-button";
import { isMealType, mealTypeLabel } from "@/components/meals/types";
import { PageHeader } from "@/components/ui";
import { formatDayLong } from "@/lib/dates";
import { db } from "@/lib/db";
import { uploadUrl } from "@/lib/storage";
import { getRecentFoods } from "../recent";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await getViewer();
  const [meal, recentFoods] = await Promise.all([
    db.meal.findFirst({ where: { id, userId }, include: { items: true, photos: { orderBy: { takenAt: "asc" } } } }),
    getRecentFoods(userId),
  ]);
  if (!meal) notFound();

  return (
    <>
      <PageHeader
        title={`Bữa ${mealTypeLabel(meal.type).toLowerCase()}`}
        subtitle={`${formatDayLong(meal.date)} · ${format(meal.eatenAt, "HH:mm")}`}
        action={
          <div className="flex flex-wrap items-start gap-2">
            {meal.items.length > 0 && <RepeatMealButton mealId={meal.id} />}
            <DeleteMealButton id={meal.id} redirectTo={`/meals?date=${meal.date}`} />
          </div>
        }
      />
      <MealEditor
        mode="edit"
        mealId={meal.id}
        initial={{
          date: meal.date,
          type: isMealType(meal.type) ? meal.type : "snack",
          time: format(meal.eatenAt, "HH:mm"),
          note: meal.note ?? "",
          items: meal.items.map((i) => ({
            name: i.name,
            portionG: i.portionG,
            kcal: i.kcal,
            proteinG: i.proteinG,
            carbG: i.carbG,
            fatG: i.fatG,
            source: i.source === "ai" ? "ai" : "manual",
            confidence: i.confidence,
          })),
        }}
        existingPhotos={meal.photos.map((p) => ({ id: p.id, url: uploadUrl(p.path) }))}
        recentFoods={recentFoods}
      />
    </>
  );
}
