import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Sparkles, Utensils } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { DeleteMealButton } from "@/components/meals/delete-meal-button";
import { MEAL_TYPES } from "@/components/meals/types";
import { Card, CardTitle, EmptyState, LinkButton, PageHeader, Progress, Stat } from "@/components/ui";
import { formatDayLong, isDayKey, shiftDay, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { kcal, num } from "@/lib/format";
import { uploadUrl } from "@/lib/storage";
import { getDaySummary } from "@/lib/summary";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MealsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams;
  const today = todayKey();
  const date = isDayKey(dateParam) ? dateParam : today;

  const { userId } = await getViewer();
  const [summary, meals] = await Promise.all([
    getDaySummary(userId, date),
    db.meal.findMany({
      where: { userId, date },
      orderBy: { eatenAt: "asc" },
      include: { items: true, photos: { orderBy: { takenAt: "asc" }, take: 1 } },
    }),
  ]);

  const remaining = summary.targetKcal - summary.intakeKcal;
  // Suggested split of the remaining energy: ~28% fat, the rest carbs after protein.
  const fatTarget = Math.round((summary.targetKcal * 0.28) / 9);
  const carbTarget = Math.max(0, Math.round((summary.targetKcal - summary.proteinTargetG * 4 - fatTarget * 9) / 4));
  const macros = [
    { label: "Đạm", value: summary.proteinG, target: summary.proteinTargetG, color: "bg-protein", sub: "mục tiêu" },
    { label: "Tinh bột", value: summary.carbG, target: carbTarget, color: "bg-carb", sub: "gợi ý" },
    { label: "Béo", value: summary.fatG, target: fatTarget, color: "bg-fat", sub: "gợi ý" },
  ];

  return (
    <>
      <PageHeader
        title="Ăn uống"
        subtitle={date === today ? "Hôm nay" : undefined}
        action={
          <LinkButton href={`/meals/new?date=${date}`}>
            <Plus className="size-4" /> Thêm bữa
          </LinkButton>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-1">
        <Link href={`/meals?date=${shiftDay(date, -1)}`} aria-label="Ngày trước" className="rounded-xl p-2 text-muted hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-center">
          <div className="font-medium">{formatDayLong(date)}</div>
          {date !== today && (
            <Link href="/meals" className="text-xs text-accent">
              Về hôm nay
            </Link>
          )}
        </div>
        {date < today ? (
          <Link href={`/meals?date=${shiftDay(date, 1)}`} aria-label="Ngày sau" className="rounded-xl p-2 text-muted hover:bg-surface-2">
            <ChevronRight className="size-5" />
          </Link>
        ) : (
          <span className="p-2 text-border" aria-hidden>
            <ChevronRight className="size-5" />
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 lg:order-2">
          <Card>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Đã ăn" value={kcal(summary.intakeKcal)} unit="kcal" tone="intake" />
              <Stat label="Mục tiêu" value={kcal(summary.targetKcal)} unit="kcal" />
              <Stat
                label={remaining >= 0 ? "Còn lại" : "Vượt"}
                value={kcal(Math.abs(remaining))}
                unit="kcal"
                tone={remaining >= 0 ? "accent" : "danger"}
              />
            </div>
            <div className="mt-3">
              <Progress value={summary.intakeKcal} max={summary.targetKcal} color={remaining >= 0 ? "bg-intake" : "bg-danger"} />
            </div>
            {summary.exerciseKcal > 0 && (
              <p className="mt-2 text-xs text-muted">Mục tiêu đã cộng {kcal(summary.exerciseKcal)} kcal từ buổi tập.</p>
            )}

            <div className="mt-4 space-y-3">
              {macros.map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{m.label}</span>
                    <span className="tabular-nums text-muted">
                      <span className="font-medium text-foreground">{num(m.value, 0)}</span> / {num(m.target, 0)} g{" "}
                      <span className="text-xs">({m.sub})</span>
                    </span>
                  </div>
                  <Progress value={m.value} max={m.target} color={m.color} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:order-1">
          {meals.length === 0 ? (
            <EmptyState title="Chưa có bữa ăn nào">
              <p>Chụp ảnh bữa ăn để AI ước lượng calo, hoặc nhập tay.</p>
              <div className="mt-4 flex justify-center">
                <LinkButton href={`/meals/new?date=${date}`}>
                  <Sparkles className="size-4" /> Thêm bữa ăn
                </LinkButton>
              </div>
            </EmptyState>
          ) : (
            MEAL_TYPES.map((t) => {
              const group = meals.filter((m) => m.type === t.value);
              if (group.length === 0) return null;
              const groupKcal = group.reduce((a, m) => a + m.items.reduce((s, i) => s + i.kcal, 0), 0);
              return (
                <Card key={t.value}>
                  <CardTitle action={<span className="text-sm font-semibold tabular-nums text-intake">{kcal(groupKcal)} kcal</span>}>
                    {t.label}
                  </CardTitle>
                  <ul className="divide-y divide-border">
                    {group.map((m) => {
                      const mealKcal = m.items.reduce((s, i) => s + i.kcal, 0);
                      const photo = m.photos[0];
                      return (
                        <li key={m.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                          <Link href={`/meals/${m.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                            {photo ? (
                              <Image
                                src={uploadUrl(photo.path)}
                                alt=""
                                width={64}
                                height={64}
                                unoptimized
                                className="size-16 shrink-0 rounded-xl object-cover"
                              />
                            ) : (
                              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                                <Utensils className="size-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-xs text-muted">{format(m.eatenAt, "HH:mm")}</span>
                                <span className="font-semibold tabular-nums">{kcal(mealKcal)} kcal</span>
                              </div>
                              <ul className="mt-0.5 space-y-0.5 text-sm">
                                {m.items.map((i) => (
                                  <li key={i.id} className="flex justify-between gap-2">
                                    <span className="truncate">
                                      {i.name}
                                      {i.portionG ? <span className="text-muted"> · {num(i.portionG, 0)} g</span> : null}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-muted">{kcal(i.kcal)}</span>
                                  </li>
                                ))}
                              </ul>
                              {m.note && <p className="mt-1 truncate text-xs text-muted">{m.note}</p>}
                            </div>
                          </Link>
                          <DeleteMealButton id={m.id} compact />
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
