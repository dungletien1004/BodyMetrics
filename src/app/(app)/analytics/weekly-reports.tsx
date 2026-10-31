import { CheckCircle2, ChevronDown, Lightbulb, Target, TriangleAlert } from "lucide-react";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { hasAiKey } from "@/lib/ai/client";
import { parseReportContent, type WeeklyReportContent } from "@/lib/ai/report";
import { formatDayShort, shiftDay, todayKey, weekStartKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { kcal } from "@/lib/format";
import { ReportButton } from "./report-button";

const weekLabel = (ws: string) => `${formatDayShort(ws)}–${formatDayShort(shiftDay(ws, 6))}`;

export async function WeeklyReports({ userId, readOnly = false }: { userId: string; readOnly?: boolean }) {
  const reports = await db.weeklyReport.findMany({ where: { userId }, orderBy: { weekStart: "desc" }, take: 26 });
  const lastWeek = shiftDay(weekStartKey(todayKey()), -7);
  const hasLastWeek = reports.some((r) => r.weekStart === lastWeek);
  const aiReady = hasAiKey() && !readOnly;

  return (
    <Card>
      <CardTitle>Báo cáo tuần (AI)</CardTitle>

      {aiReady ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
          <p className="text-sm">
            Tuần vừa rồi <span className="font-medium">{weekLabel(lastWeek)}</span>
            {hasLastWeek ? " đã có báo cáo." : " chưa có báo cáo."}
          </p>
          <ReportButton
            weekStart={lastWeek}
            label={hasLastWeek ? "Tạo lại báo cáo" : "Tạo báo cáo tuần"}
            variant={hasLastWeek ? "secondary" : "primary"}
          />
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-dashed border-border p-3 text-sm text-muted">
          Chưa có <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY</code> trong <code className="rounded bg-surface-2 px-1">.env</code>, nên
          chưa tạo được báo cáo AI. Thêm key rồi khởi động lại app. Các biểu đồ ở trên vẫn hoạt động bình thường.
        </div>
      )}

      {reports.length === 0 ? (
        <EmptyState title="Chưa có báo cáo nào">Mỗi tuần, AI đọc số liệu ăn uống, tập luyện, cân nặng và viết nhận xét kèm mục tiêu tuần tới.</EmptyState>
      ) : (
        <div className="space-y-3">
          {reports.map((r, i) => {
            const content = parseReportContent(r.content);
            return (
              <details key={r.id} open={i === 0} className="group rounded-xl border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
                  <span className="font-medium">Tuần {weekLabel(r.weekStart)}</span>
                  <span className="flex items-center gap-2">
                    <Badge>Tạo {r.createdAt.toLocaleDateString("vi-VN")}</Badge>
                    <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
                  </span>
                </summary>
                <div className="border-t border-border p-3 sm:p-4">
                  {content ? <ReportBody report={content} /> : <p className="text-sm whitespace-pre-wrap">{r.content}</p>}
                  {aiReady && r.weekStart !== lastWeek && (
                    <div className="mt-4">
                      <ReportButton weekStart={r.weekStart} label="Tạo lại" variant="secondary" />
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ReportBody({ report }: { report: WeeklyReportContent }) {
  const t = report.nextWeekTargets;
  return (
    <div className="space-y-4 text-sm">
      <p className="leading-relaxed">{report.summary}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {report.wins.length > 0 && (
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 font-medium text-accent">
              <CheckCircle2 className="size-4" /> Điểm làm tốt
            </h3>
            <ul className="list-disc space-y-1 pl-5 marker:text-muted">
              {report.wins.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}
        {report.issues.length > 0 && (
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 font-medium text-intake">
              <TriangleAlert className="size-4" /> Cần cải thiện
            </h3>
            <ul className="list-disc space-y-1 pl-5 marker:text-muted">
              {report.issues.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {report.recommendations.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 font-medium">
            <Lightbulb className="size-4 text-carb" /> Gợi ý cho tuần tới
          </h3>
          <ol className="space-y-2">
            {report.recommendations.map((r, i) => (
              <li key={r.title} className="rounded-xl bg-surface-2 p-3">
                <div className="font-medium">
                  {i + 1}. {r.title}
                </div>
                <p className="mt-0.5 text-muted">{r.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 font-medium">
          <Target className="size-4 text-burn" /> Mục tiêu tuần tới
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <TargetTile label="Calo / ngày" value={kcal(t.kcal)} unit="kcal" />
          <TargetTile label="Đạm / ngày" value={kcal(t.proteinG)} unit="g" />
          <TargetTile label="Buổi tập" value={String(t.workouts)} unit="buổi" />
        </div>
      </section>
    </div>
  );
}

function TargetTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-border p-2.5 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
      </div>
    </div>
  );
}
