import { Camera, Dumbbell, MessageCircle, Scale, X } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WeightChart } from "@/components/body/weight-chart";
import { Card, CardTitle, EmptyState, PageHeader, Progress, Stat, cn } from "@/components/ui";
import { getWeightSeries } from "@/lib/body";
import { db } from "@/lib/db";
import { formatDayLong, parseDay, shiftDay, todayKey } from "@/lib/dates";
import { kcal, num, signed } from "@/lib/format";
import { uploadUrl } from "@/lib/storage";
import { getDaySummaries, getProfile } from "@/lib/summary";
import { getViewer } from "@/lib/auth";
import { clampNote, energyPlan, rateLabel } from "@/lib/calc";
import { listGrants } from "@/lib/oauth/tokens";
import { dismissClaudeTip } from "./dashboard-actions";

export const dynamic = "force-dynamic";

const MEAL_LABEL: Record<string, string> = { breakfast: "Sáng", lunch: "Trưa", dinner: "Tối", snack: "Ăn vặt" };
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export default async function DashboardPage() {
  const today = todayKey();
  const { userId, readOnly } = await getViewer();
  const profile = await getProfile(userId);
  // Until onboarding is done every target here would come from default values; admins viewing
  // someone else (read-only) get a notice instead, since they can't fill it in for them.
  if (!profile.onboardedAt && !readOnly) redirect("/onboarding");
  const [week, series, meals, workouts, showClaudeTip] = await Promise.all([
    getDaySummaries(userId, shiftDay(today, -6), today),
    getWeightSeries(userId, 30),
    db.meal.findMany({
      where: { userId, date: today },
      orderBy: { eatenAt: "asc" },
      include: { items: { select: { kcal: true, name: true } }, photos: { take: 1 } },
    }),
    db.workout.findMany({
      where: { userId, date: today },
      orderBy: { startedAt: "asc" },
      include: { entries: { select: { kcal: true, exercise: { select: { name: true } } } } },
    }),
    claudeTipWanted(userId, readOnly),
  ]);

  const t = week.at(-1)!;
  const remaining = t.targetKcal - t.intakeKcal;
  const plan = energyPlan(profile, t.weightKg);
  const hasWeights = series.points.some((p) => p.weight != null);
  // Only days with meals logged count toward intake/deficit figures.
  const loggedDays = week.filter((d) => d.mealsLogged > 0);
  const weekBalance = sum(loggedDays.map((d) => d.balance));

  return (
    <>
      <PageHeader
        title={profile.name ? `Chào ${profile.name}` : "Hôm nay"}
        subtitle={formatDayLong(today)}
        action={
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
            <QuickAction href={`/meals/new?date=${today}`} icon={<Camera className="size-5 sm:size-4" />} label="Chụp món ăn" primary />
            <QuickAction href={`/workouts/new?date=${today}`} icon={<Dumbbell className="size-5 sm:size-4" />} label="Ghi buổi tập" />
            <QuickAction href="/body#new" icon={<Scale className="size-5 sm:size-4" />} label="Cân" />
          </div>
        }
      />

      {!profile.onboardedAt && (
        // Plain section, not Card: Card's own border/background classes would win over these (cn has no merge).
        <section className="mb-4 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm">
            Người dùng này chưa hoàn tất thiết lập ban đầu (giới tính, năm sinh, chiều cao, mục tiêu). Các mục tiêu calo và đạm dưới đây
            dựa trên giá trị mặc định, không phải số liệu thật.
          </p>
        </section>
      )}

      {showClaudeTip && (
        <section className="mb-4 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <MessageCircle className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Ghi bằng ảnh qua Claude</p>
            <p className="mt-0.5 text-sm text-muted">
              Kết nối BodyMetrics với Claude để gửi ảnh món ăn, ghi cân nặng và buổi tập ngay trong cuộc trò chuyện.
            </p>
            <Link href="/profile#ket-noi-claude" className="mt-1 inline-block text-sm font-medium text-accent">
              Cách kết nối →
            </Link>
          </div>
          <form action={dismissClaudeTip}>
            <button type="submit" aria-label="Ẩn gợi ý" className="-m-1 rounded-lg p-1 text-muted hover:bg-surface-2">
              <X className="size-4" />
            </button>
          </form>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Năng lượng hôm nay</CardTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Đã ăn" value={kcal(t.intakeKcal)} unit="kcal" tone="intake" sub={`Mục tiêu ${kcal(t.targetKcal)}`} />
            <Stat
              label={remaining >= 0 ? "Còn được ăn" : "Vượt mục tiêu"}
              value={kcal(Math.abs(remaining))}
              unit="kcal"
              tone={remaining >= 0 ? "accent" : "danger"}
            />
            <Stat label="Tiêu hao" value={kcal(t.totalBurn)} unit="kcal" tone="burn" sub={`Tập luyện ${kcal(t.exerciseKcal)}`} />
            {t.mealsLogged > 0 ? (
              <Stat
                label="Cân bằng"
                value={signed(t.balance)}
                unit="kcal"
                tone={t.balance <= 0 ? "accent" : "danger"}
                sub={t.balance <= 0 ? "Đang thâm hụt" : "Đang dư"}
              />
            ) : (
              <Stat label="Cân bằng" value="–" sub="Ghi bữa ăn để tính" />
            )}
          </div>
          <div className="mt-4">
            <Progress value={t.intakeKcal} max={t.targetKcal} color={remaining >= 0 ? "bg-intake" : "bg-danger"} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Macro label="Đạm" value={t.proteinG} target={t.proteinTargetG} color="bg-protein" />
            <Macro label="Tinh bột" value={t.carbG} color="bg-carb" />
            <Macro label="Béo" value={t.fatG} color="bg-fat" />
          </div>
        </Card>

        <Card>
          <CardTitle action={<Link href="/body" className="text-xs text-accent">Chi tiết</Link>}>Cân nặng</CardTitle>
          <div className="flex items-end justify-between">
            <Stat label="TB 7 ngày" value={num(series.latestAvg ?? series.latest)} unit="kg" />
            {series.weekChange != null && (
              <span className={cn("text-sm font-medium", series.weekChange <= 0 ? "text-accent" : "text-danger")}>
                {signed(series.weekChange, 1)} kg / tuần
              </span>
            )}
          </div>
          {hasWeights ? (
            <WeightChart data={series.points} goal={profile.goalWeightKg} height={150} />
          ) : (
            <p className="mt-3 text-sm text-muted">Chưa có lần cân nào.</p>
          )}
          {profile.onboardedAt && profile.goalWeightKg != null && (
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
              <p>
                Mục tiêu {num(profile.goalWeightKg)} kg · kế hoạch {rateLabel(plan.kgPerWeek)} kg/tuần
                {plan.weeksToGoal ? `, ≈ ${plan.weeksToGoal} tuần nữa` : ""}
              </p>
              {plan.clamped && <p className="mt-1 text-danger">{clampNote(plan.bmr)}</p>}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle action={<Link href={`/meals?date=${today}`} className="text-xs text-accent">Xem tất cả</Link>}>
            Bữa ăn hôm nay
          </CardTitle>
          {meals.length === 0 ? (
            <EmptyState title="Chưa ghi bữa nào">Chụp ảnh món ăn để AI ước lượng calo.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {meals.map((m) => (
                <li key={m.id}>
                  <Link href={`/meals/${m.id}`} className="flex items-center gap-3 rounded-xl p-1 hover:bg-surface-2">
                    {m.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={uploadUrl(m.photos[0].path)} alt="" className="size-11 rounded-lg object-cover" />
                    ) : (
                      <div className="grid size-11 place-items-center rounded-lg bg-surface-2 text-xs text-muted">
                        {MEAL_LABEL[m.type]?.slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{MEAL_LABEL[m.type] ?? m.type}</div>
                      <div className="truncate text-xs text-muted">{m.items.map((i) => i.name).join(", ")}</div>
                    </div>
                    <span className="text-sm tabular-nums">{kcal(m.items.reduce((a, i) => a + i.kcal, 0))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle action={<Link href="/workouts" className="text-xs text-accent">Xem tất cả</Link>}>Tập luyện hôm nay</CardTitle>
          {workouts.length === 0 ? (
            <EmptyState title="Chưa có buổi tập">Ghi buổi tập để tính calo tiêu hao.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {workouts.map((w) => (
                <li key={w.id}>
                  <Link href={`/workouts/${w.id}`} className="block rounded-xl p-2 hover:bg-surface-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>{w.durationMin} phút</span>
                      <span className="tabular-nums text-burn">{kcal(w.kcalOverride ?? w.entries.reduce((a, e) => a + e.kcal, 0))} kcal</span>
                    </div>
                    <div className="truncate text-xs text-muted">{w.entries.map((e) => e.exercise.name).join(", ")}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle action={<Link href="/analytics" className="text-xs text-accent">Phân tích</Link>}>7 ngày qua</CardTitle>
          <WeekBars days={week} />
          {loggedDays.length > 0 ? (
            <div className="mt-3 flex justify-between text-xs text-muted">
              <span>TB ăn {kcal(avg(loggedDays.map((d) => d.intakeKcal)))} kcal/ngày</span>
              <span>
                {weekBalance <= 0 ? "Thâm hụt" : "Dư"} {kcal(Math.abs(weekBalance))} kcal
              </span>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">Chưa có bữa ăn nào trong 7 ngày qua.</p>
          )}
        </Card>
      </div>
    </>
  );
}

/** The "connect Claude" card: only for the owner, until dismissed or a connector is granted. */
async function claudeTipWanted(userId: string, readOnly: boolean): Promise<boolean> {
  if (readOnly || (await cookies()).get("bm_hide_claude_tip")?.value === userId) return false;
  return (await listGrants(userId)).length === 0;
}

function QuickAction({ href, icon, label, primary }: { href: string; icon: ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-xs leading-tight font-medium transition sm:min-h-0 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
        primary ? "bg-accent text-accent-fg hover:opacity-90" : "border border-border bg-surface hover:bg-surface-2",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function Macro({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          {value}
          {target ? ` / ${target}` : ""} g
        </span>
      </div>
      <Progress value={value} max={target ?? Math.max(value, 1)} color={color} />
    </div>
  );
}

function WeekBars({ days }: { days: Awaited<ReturnType<typeof getDaySummaries>> }) {
  const max = Math.max(...days.map((d) => Math.max(d.intakeKcal, d.targetKcal)), 1);
  return (
    <div className="flex h-32 items-end gap-2">
      {days.map((d) => {
        const over = d.intakeKcal > d.targetKcal;
        return (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-1">
            <div className="relative w-full flex-1">
              <div
                className="absolute inset-x-0 border-t border-dashed border-muted/60"
                style={{ bottom: `${(d.targetKcal / max) * 100}%` }}
                title={`Mục tiêu ${kcal(d.targetKcal)}`}
              />
              <div
                className={cn("absolute inset-x-1 bottom-0 rounded-t-md", d.mealsLogged === 0 ? "bg-surface-2" : over ? "bg-danger/80" : "bg-intake")}
                style={{ height: `${d.mealsLogged === 0 ? 4 : (d.intakeKcal / max) * 100}%` }}
                title={`${kcal(d.intakeKcal)} kcal`}
              />
            </div>
            <span className="text-[10px] text-muted">{WEEKDAY[parseDay(d.date).getDay()]}</span>
          </div>
        );
      })}
    </div>
  );
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

function avg(xs: number[]) {
  return xs.length ? sum(xs) / xs.length : 0;
}
