import { Flame, Gauge, Scale, Target } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EnergyChart } from "@/components/charts/energy-chart";
import { MacroChart } from "@/components/charts/macro-chart";
import { WeightChart } from "@/components/charts/weight-chart";
import { Card, CardTitle, cn, EmptyState, LinkButton, PageHeader, Progress, Stat } from "@/components/ui";
import { getAnalytics, parseWeeks, RANGE_WEEKS, type Analytics } from "@/lib/analytics";
import { formatDayShort } from "@/lib/dates";
import { kcal, num, signed } from "@/lib/format";
import { getProfile } from "@/lib/summary";
import { WeeklyReports } from "./weekly-reports";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
// AI calls (photo analysis, weekly report) can take tens of seconds on serverless hosts.
export const maxDuration = 60;

const fullDate = (key: string) => key.split("-").reverse().join("/");

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ weeks?: string | string[] }> }) {
  const weeks = parseWeeks((await searchParams).weeks);
  const viewer = await getViewer();
  const [a, profile] = await Promise.all([getAnalytics(viewer.userId, weeks), getProfile(viewer.userId)]);
  const hasWeights = a.days.some((d) => d.weight != null);
  const hasMeals = a.loggedDays > 0;

  return (
    <>
      <PageHeader
        title="Phân tích"
        subtitle={`${formatDayShort(a.from)} – ${formatDayShort(a.to)} · ${a.loggedDays}/${a.days.length - 1} ngày trọn vẹn có ghi bữa ăn`}
        action={<RangeSelector weeks={weeks} />}
      />

      {!hasWeights && !hasMeals ? (
        <EmptyState title="Chưa có dữ liệu trong khoảng này">
          <p>Ghi bữa ăn và cân nặng vài ngày để xem xu hướng, mức thâm hụt và TDEE thực tế.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <LinkButton href="/meals/new">Ghi bữa ăn</LinkButton>
            <LinkButton href="/body" variant="secondary">
              Ghi cân nặng
            </LinkButton>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <HeadlineStats a={a} />

          <Card>
            <CardTitle action={<GoalNote a={a} />}>Cân nặng</CardTitle>
            {hasWeights ? (
              <WeightChart days={a.days} goalKg={a.goalWeightKg} />
            ) : (
              <EmptyState title="Chưa có lần cân nào">
                Cân vào buổi sáng, sau khi đi vệ sinh, để số liệu ổn định. <Link href="/body" className="text-accent underline">Ghi cân nặng</Link>
              </EmptyState>
            )}
          </Card>

          <Card>
            <CardTitle>Năng lượng</CardTitle>
            {hasMeals ? (
              <EnergyChart days={a.days} plannedDeficit={profile.dailyDeficit} />
            ) : (
              <EmptyState title="Chưa ghi bữa ăn nào">
                <Link href="/meals/new" className="text-accent underline">Ghi bữa ăn</Link> để so sánh calo nạp với tiêu hao.
              </EmptyState>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardTitle>Macro mỗi ngày</CardTitle>
              {hasMeals ? <MacroChart days={a.days} /> : <EmptyState title="Chưa có dữ liệu macro" />}
            </Card>
            <ProteinCard a={a} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TdeeCard a={a} />
            <GoalCard a={a} />
          </div>

          <WeeklyTable a={a} />
        </div>
      )}

      <div className="mt-4">
        <WeeklyReports userId={viewer.userId} readOnly={viewer.readOnly} />
      </div>
    </>
  );
}

function RangeSelector({ weeks }: { weeks: number }) {
  return (
    <nav aria-label="Khoảng thời gian" className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm">
      {RANGE_WEEKS.map((w) => (
        <Link
          key={w}
          href={`/analytics?weeks=${w}`}
          aria-current={w === weeks ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 transition",
            w === weeks ? "bg-accent font-medium text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          {w} tuần
        </Link>
      ))}
    </nav>
  );
}

function StatCard({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="relative">
      <div className="absolute top-5 right-5 hidden text-muted sm:block">{icon}</div>
      {children}
    </Card>
  );
}

function HeadlineStats({ a }: { a: Analytics }) {
  const avgBalance = a.avgBalance;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={<Scale className="size-4" />}>
        <Stat label="Cân nặng (TB 7 ngày)" value={num(a.currentWeight)} unit="kg" sub={a.trendKgPerWeek != null ? `${signed(a.trendKgPerWeek, 1)} kg/tuần` : "Chưa đủ dữ liệu"} />
      </StatCard>
      <StatCard icon={<Gauge className="size-4" />}>
        <Stat
          label="Cân bằng TB / ngày"
          value={avgBalance != null ? signed(avgBalance) : "–"}
          unit="kcal"
          tone={avgBalance != null && avgBalance <= 0 ? "burn" : "intake"}
          sub={avgBalance != null ? (avgBalance <= 0 ? "Thâm hụt" : "Dư calo") : undefined}
        />
      </StatCard>
      <StatCard icon={<Flame className="size-4" />}>
        <Stat label="Chuỗi ghi chép" value={a.streak} unit="ngày" sub={a.streak > 0 ? "Liên tiếp tới nay" : "Ghi bữa ăn hôm nay nhé"} />
      </StatCard>
      <StatCard icon={<Target className="size-4" />}>
        <Stat
          label="Đạt protein"
          value={a.loggedDays ? Math.round((a.proteinHitDays / a.loggedDays) * 100) : "–"}
          unit="%"
          sub={`${a.proteinHitDays}/${a.loggedDays} ngày có ghi`}
        />
      </StatCard>
    </div>
  );
}

function GoalNote({ a }: { a: Analytics }) {
  if (a.goalWeightKg == null)
    return (
      <Link href="/profile" className="text-xs text-accent">
        Đặt mục tiêu
      </Link>
    );
  if (a.currentWeight == null) return null;
  const left = a.currentWeight - a.goalWeightKg;
  return (
    <span className="text-xs text-muted">
      Mục tiêu {num(a.goalWeightKg)} kg{left > 0 ? ` · còn ${num(left)} kg` : " · đã đạt 🎉"}
    </span>
  );
}

function ProteinCard({ a }: { a: Analytics }) {
  const pct = a.loggedDays ? Math.round((a.proteinHitDays / a.loggedDays) * 100) : 0;
  const target = a.days.at(-1)?.proteinTargetG ?? 0;
  const m = a.avgMacros;
  const totalKcal = m ? m.proteinG * 4 + m.carbG * 4 + m.fatG * 9 : 0;
  const share = (k: number) => (totalKcal ? Math.round((k / totalKcal) * 100) : 0);
  return (
    <Card className="space-y-4">
      <CardTitle>Protein & tỉ lệ macro</CardTitle>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span>Ngày đạt mục tiêu protein</span>
          <span className="font-semibold tabular-nums">{pct}%</span>
        </div>
        <Progress value={a.proteinHitDays} max={a.loggedDays} color="bg-protein" />
        <p className="mt-1.5 text-xs text-muted">
          {a.proteinHitDays}/{a.loggedDays} ngày có ghi đạt ≥ {target} g. Protein đủ giúp giữ cơ khi giảm cân.
        </p>
      </div>
      {m && (
        <div>
          <div className="mb-2 text-sm">Trung bình mỗi ngày</div>
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
            <div className="bg-protein" style={{ width: `${share(m.proteinG * 4)}%` }} />
            <div className="bg-carb" style={{ width: `${share(m.carbG * 4)}%` }} />
            <div className="bg-fat" style={{ width: `${share(m.fatG * 9)}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            {[
              { label: "Protein", g: m.proteinG, k: m.proteinG * 4, cls: "bg-protein" },
              { label: "Carb", g: m.carbG, k: m.carbG * 4, cls: "bg-carb" },
              { label: "Chất béo", g: m.fatG, k: m.fatG * 9, cls: "bg-fat" },
            ].map((x) => (
              <div key={x.label}>
                <dt className="flex items-center gap-1.5 text-xs text-muted">
                  <span className={cn("size-2 rounded-sm", x.cls)} />
                  {x.label}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {x.g} g <span className="text-xs font-normal text-muted">{share(x.k)}%</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}

function TdeeCard({ a }: { a: Analytics }) {
  const t = a.tdee;
  if (!t)
    return (
      <Card>
        <CardTitle>TDEE thực tế</CardTitle>
        <EmptyState title="Chưa đủ dữ liệu">
          Cần ít nhất 14 ngày gần nhất, trong đó ≥ 70% số ngày có ghi bữa ăn và ≥ 5 lần cân. Ghi đều thêm vài ngày nhé.
        </EmptyState>
      </Card>
    );
  const r = t.result;
  const diff = r.tdee - t.formulaTdee;
  return (
    <Card className="space-y-4">
      <CardTitle>TDEE thực tế ({t.windowDays} ngày)</CardTitle>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Từ dữ liệu của bạn" value={kcal(r.tdee)} unit="kcal/ngày" tone="accent" />
        <Stat label="Theo công thức" value={kcal(t.formulaTdee)} unit="kcal/ngày" sub="BMR × hệ số + buổi tập" />
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-muted">
        <p>
          Trong {t.windowDays} ngày qua bạn ghi bữa ăn {r.daysLogged} ngày, ăn trung bình <b className="text-foreground">{kcal(r.avgIntake)} kcal</b>, và
          xu hướng cân nặng là <b className="text-foreground">{signed(r.weightTrendKgPerWeek, 1)} kg/tuần</b> ({r.weighIns} lần cân). Mỗi kg mỡ ≈ 7.700 kcal,
          nên cơ thể bạn thực tế đốt khoảng <b className="text-foreground">{kcal(r.tdee)} kcal/ngày</b>.
        </p>
        <p>
          {Math.abs(diff) < 100
            ? "Con số này gần khớp với công thức, nghĩa là mục tiêu calo trong app đang khá sát với bạn."
            : diff > 0
              ? `Cao hơn công thức ${kcal(diff)} kcal: có thể bạn vận động thường ngày nhiều hơn hệ số trong hồ sơ, hoặc một phần cân giảm là nước. Nếu xu hướng này giữ được 3–4 tuần, bạn có thể ăn thêm một chút mà vẫn giảm cân.`
              : `Thấp hơn công thức ${kcal(-diff)} kcal: thường do ghi thiếu món (dầu ăn, đồ uống, ăn vặt) hoặc khẩu phần ước lượng thấp; cũng có thể hệ số vận động trong hồ sơ đang cao. Thử cân đồ ăn vài ngày để kiểm tra.`}
        </p>
      </div>
    </Card>
  );
}

function GoalCard({ a }: { a: Analytics }) {
  let body: ReactNode;
  if (a.goalWeightKg == null)
    body = (
      <EmptyState title="Chưa đặt cân nặng mục tiêu">
        <Link href="/profile" className="text-accent underline">
          Đặt mục tiêu trong hồ sơ
        </Link>{" "}
        để xem ngày dự kiến đạt được.
      </EmptyState>
    );
  else if (a.currentWeight != null && a.currentWeight <= a.goalWeightKg)
    body = <p className="text-sm">Bạn đã đạt mục tiêu {num(a.goalWeightKg)} kg. Có thể đặt mục tiêu mới hoặc chuyển sang duy trì.</p>;
  else if (a.trendKgPerWeek == null)
    body = <p className="text-sm text-muted">Cần ít nhất 5 lần cân trong 4 tuần gần nhất để tính xu hướng.</p>;
  else if (a.goalDate == null)
    body = (
      <p className="text-sm text-muted">
        Xu hướng hiện tại là {signed(a.trendKgPerWeek, 1)} kg/tuần, chưa giảm nên chưa dự báo được ngày đạt mục tiêu. Xem lại mức thâm hụt ở biểu đồ năng
        lượng.
      </p>
    );
  else
    body = (
      <div className="space-y-3">
        <Stat label="Dự kiến đạt mục tiêu" value={fullDate(a.goalDate)} sub={`khoảng ${a.weeksToGoal} tuần nữa`} tone="accent" />
        <p className="text-sm leading-relaxed text-muted">
          Từ {num(a.currentWeight)} kg (trung bình 7 ngày) xuống {num(a.goalWeightKg)} kg với tốc độ hiện tại {signed(a.trendKgPerWeek, 1)} kg/tuần.
          {a.trendKgPerWeek < -1 && " Tốc độ này khá nhanh. Giảm 0,5–1% cân nặng mỗi tuần thường dễ duy trì và giữ cơ tốt hơn."}
        </p>
      </div>
    );
  return (
    <Card>
      <CardTitle>Dự báo mục tiêu</CardTitle>
      {body}
    </Card>
  );
}

function WeeklyTable({ a }: { a: Analytics }) {
  return (
    <Card className="px-0 sm:px-0">
      <div className="px-4 sm:px-5">
        <CardTitle>Tổng kết theo tuần</CardTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border text-right">
              <th className="py-2 pr-2 pl-4 text-left font-medium sm:pl-5">Tuần</th>
              <th className="px-2 py-2 font-medium">Nạp TB</th>
              <th className="px-2 py-2 font-medium">Tiêu hao TB</th>
              <th className="px-2 py-2 font-medium">Cân bằng TB</th>
              <th className="px-2 py-2 font-medium">Cân (TB 7 ngày)</th>
              <th className="px-2 py-2 font-medium">Buổi tập</th>
              <th className="py-2 pr-4 pl-2 font-medium sm:pr-5">Ngày ghi</th>
            </tr>
          </thead>
          <tbody>
            {a.weekRows.map((w) => (
              <tr key={w.weekStart} className="border-b border-border text-right last:border-0">
                <td className="py-2 pr-2 pl-4 text-left whitespace-nowrap sm:pl-5">
                  {w.label}
                  {w.days < 7 && <span className="ml-1 text-xs text-muted">(đang diễn ra)</span>}
                </td>
                <td className="px-2 py-2">{w.avgIntake != null ? kcal(w.avgIntake) : "–"}</td>
                <td className="px-2 py-2">{w.avgBurn != null ? kcal(w.avgBurn) : "–"}</td>
                <td className={cn("px-2 py-2", w.avgBalance != null && (w.avgBalance <= 0 ? "text-burn" : "text-intake"))}>
                  {w.avgBalance != null ? signed(w.avgBalance) : "–"}
                </td>
                <td className={cn("px-2 py-2", w.maChange != null && w.maChange < 0 && "text-accent")}>
                  {w.maChange != null ? `${signed(w.maChange, 1)} kg` : "–"}
                </td>
                <td className="px-2 py-2">{w.workouts}</td>
                <td className="py-2 pr-4 pl-2 sm:pr-5">
                  {w.loggedDays}/{w.days}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-4 text-xs text-muted sm:px-5">
        Trung bình tính trên các ngày đã qua có ghi bữa ăn (chưa tính hôm nay). Cân bằng âm = thâm hụt.
      </p>
    </Card>
  );
}
