import { format } from "date-fns";
import { MealEditor } from "@/components/meals/meal-editor";
import { defaultMealType } from "@/components/meals/types";
import { PageHeader } from "@/components/ui";
import { hasAiKey } from "@/lib/ai/client";
import { formatDayLong, isDayKey, todayKey } from "@/lib/dates";
import { getPreviousDayMeals } from "../previous";
import { getRecentFoods } from "../recent";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
// AI calls (photo analysis, weekly report) can take tens of seconds on serverless hosts.
export const maxDuration = 60;

export default async function NewMealPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams;
  const date = isDayKey(dateParam) ? dateParam : todayKey();
  const now = new Date();
  const { userId } = await getViewer();
  const [recentFoods, previousDay] = await Promise.all([getRecentFoods(userId), getPreviousDayMeals(userId, date)]);

  return (
    <>
      <PageHeader title="Thêm bữa ăn" subtitle={formatDayLong(date)} />
      <MealEditor
        mode="new"
        initial={{ date, type: defaultMealType(now), time: format(now, "HH:mm"), note: "", items: [] }}
        recentFoods={recentFoods}
        aiEnabled={hasAiKey()}
        previousDay={previousDay}
      />
    </>
  );
}
