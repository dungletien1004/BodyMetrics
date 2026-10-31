import { BodyLogForm } from "@/components/body/body-log-form";
import { DeleteBodyLogButton } from "@/components/body/delete-body-log-button";
import { WeightChart } from "@/components/body/weight-chart";
import { Badge, Button, Card, CardTitle, EmptyState, PageHeader, Select, Stat } from "@/components/ui";
import { bmi } from "@/lib/calc";
import { getWeightSeries } from "@/lib/body";
import { db } from "@/lib/db";
import { formatDayLong, formatDayShort, todayKey } from "@/lib/dates";
import { num, signed } from "@/lib/format";
import { uploadUrl } from "@/lib/storage";
import { getProfile } from "@/lib/summary";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

const RANGES = [30, 90, 180];

export default async function BodyPage({ searchParams }: { searchParams: Promise<{ days?: string; a?: string; b?: string }> }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 90;
  const today = todayKey();

  const { userId } = await getViewer();
  const [profile, series, logs, bodyPhotos] = await Promise.all([
    getProfile(userId),
    getWeightSeries(userId, days),
    db.bodyLog.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 60, include: { photos: true } }),
    db.photo.findMany({ where: { userId, kind: "body" }, orderBy: [{ date: "asc" }, { takenAt: "asc" }] }),
  ]);

  const current = series.latestAvg ?? series.latest;
  // Start weight = first weigh-in; the old profile field only covers accounts with no weigh-ins.
  const start = series.firstWeight ?? profile.startWeightKg;
  // For change since start, "left to goal" and BMI, an old weigh-in (or the start weight) beats showing nothing.
  const lastKnown = current ?? series.latestEver ?? start;
  // Height is a default until onboarding is done, so BMI would be made up.
  const showBmi = profile.onboardedAt != null && lastKnown != null;
  const hasWeights = series.points.some((p) => p.weight != null);

  // Progress photo comparison: defaults to first vs latest.
  const photoA = bodyPhotos.find((p) => p.id === sp.a) ?? bodyPhotos[0];
  const photoB = bodyPhotos.find((p) => p.id === sp.b) ?? bodyPhotos.at(-1);

  return (
    <>
      <PageHeader title="Cơ thể" subtitle="Cân nặng, số đo và ảnh tiến trình. Nên cân vào buổi sáng, cùng điều kiện mỗi ngày." />

      {/* Below lg the two columns dissolve (display: contents) so the weigh-in form can go first. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="contents lg:block lg:space-y-4">
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Hiện tại (TB 7 ngày)"
                value={num(current)}
                unit="kg"
                sub={series.latest ? `Lần cân gần nhất ${num(series.latest)} kg` : series.latestEver ? `Lần cân cuối ${num(series.latestEver)} kg (đã lâu)` : undefined}
              />
              <Stat
                label="7 ngày qua"
                value={series.weekChange != null ? signed(series.weekChange, 1) : "–"}
                unit="kg"
                tone={series.weekChange != null && series.weekChange <= 0 ? "accent" : undefined}
              />
              <Stat
                label="Từ lúc bắt đầu"
                value={lastKnown != null && start != null ? signed(Math.round((lastKnown - start) * 10) / 10, 1) : "–"}
                unit="kg"
                sub={start != null ? `Bắt đầu ${num(start)} kg` : undefined}
              />
              <Stat
                label="Còn lại tới mục tiêu"
                value={lastKnown != null && profile.goalWeightKg ? num(Math.max(0, lastKnown - profile.goalWeightKg)) : "–"}
                unit="kg"
                sub={showBmi ? `BMI ${num(bmi(lastKnown, profile.heightCm))}` : profile.goalWeightKg ? undefined : "Chưa đặt mục tiêu"}
              />
            </div>
          </Card>

          <Card>
            <CardTitle
              action={
                <div className="flex gap-1">
                  {RANGES.map((r) => (
                    <a
                      key={r}
                      href={`?days=${r}`}
                      className={`rounded-lg px-2 py-1 text-xs ${r === days ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface-2"}`}
                    >
                      {r} ngày
                    </a>
                  ))}
                </div>
              }
            >
              Xu hướng cân nặng
            </CardTitle>
            {hasWeights ? (
              <WeightChart data={series.points} goal={profile.goalWeightKg} />
            ) : (
              <EmptyState title={series.latestEver != null ? `Không có lần cân nào trong ${days} ngày qua` : "Chưa có lần cân nào"}>
                Ghi cân nặng ở mục “Ghi chỉ số” để xem xu hướng.
              </EmptyState>
            )}
            <p className="mt-2 text-xs text-muted">Chấm xám: từng lần cân. Đường xanh: trung bình 7 ngày, ít bị nhiễu bởi nước và muối.</p>
          </Card>

          {bodyPhotos.length >= 2 && photoA && photoB && (
            <Card>
              <CardTitle>So sánh ảnh tiến trình</CardTitle>
              <form className="mb-3 grid grid-cols-2 gap-3">
                <input type="hidden" name="days" value={days} />
                {[
                  { name: "a", value: photoA.id },
                  { name: "b", value: photoB.id },
                ].map((s) => (
                  <Select key={s.name} name={s.name} defaultValue={s.value}>
                    {bodyPhotos.map((p, i) => (
                      <option key={p.id} value={p.id}>
                        {formatDayShort(p.date)} · ảnh {i + 1}
                      </option>
                    ))}
                  </Select>
                ))}
                <Button variant="secondary" type="submit" className="col-span-2 sm:col-span-1">
                  So sánh
                </Button>
              </form>
              <div className="grid grid-cols-2 gap-3">
                {[photoA, photoB].map((p, i) => (
                  <figure key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadUrl(p.path)} alt="" className="aspect-[3/4] w-full rounded-xl object-cover" />
                    <figcaption className="mt-1 text-center text-xs text-muted">{formatDayLong(p.date)}</figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="contents lg:block lg:space-y-4">
          <Card id="new" className="scroll-mt-20 max-lg:order-first">
            <CardTitle>Ghi chỉ số</CardTitle>
            <BodyLogForm today={today} />
          </Card>

          <Card>
            <CardTitle>Lịch sử</CardTitle>
            {logs.length === 0 ? (
              <p className="text-sm text-muted">Chưa có dữ liệu.</p>
            ) : (
              <ul className="divide-y divide-border">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{formatDayLong(l.date)}</div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {l.weightKg != null && <Badge>{num(l.weightKg)} kg</Badge>}
                        {l.waistCm != null && <Badge>Eo {num(l.waistCm)} cm</Badge>}
                        {l.bodyFatPct != null && <Badge>Mỡ {num(l.bodyFatPct)}%</Badge>}
                        {l.photos.length > 0 && <Badge>{l.photos.length} ảnh</Badge>}
                      </div>
                      {l.note && <div className="truncate pt-1 text-xs text-muted">{l.note}</div>}
                    </div>
                    {l.photos[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={uploadUrl(l.photos[0].path)} alt="" className="size-11 rounded-lg object-cover" />
                    )}
                    <DeleteBodyLogButton id={l.id} hasPhotos={l.photos.length > 0} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
