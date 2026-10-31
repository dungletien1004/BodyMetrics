"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDay, ChartWeek } from "@/lib/analytics";
import { num } from "@/lib/format";
import {
  axisProps,
  barSize,
  C,
  ChartBox,
  GranularityToggle,
  gridProps,
  Legend,
  mondayTicks,
  Segmented,
  Swatch,
  TooltipBox,
  useGranularity,
  xAxisProps,
  type Granularity,
} from "./chart-kit";

type Mode = "share" | "grams";

/** Same words as the protein card on the analytics page. */
const MACRO_LABEL = { protein: "Đạm", carb: "Tinh bột", fat: "Béo" } as const;

/** A day or a week (averages per logged day); grams are null when nothing was logged. */
interface Point {
  key: string;
  label: string;
  title: string;
  note: string | null;
  p: number | null;
  c: number | null;
  f: number | null;
  pPct: number | null;
  cPct: number | null;
  fPct: number | null;
  pTarget: number | null;
}

function point(
  base: { key: string; label: string; title: string; note: string | null },
  g: { p: number; c: number; f: number } | null,
  pTarget: number | null,
): Point {
  const total = g ? g.p * 4 + g.c * 4 + g.f * 9 : 0;
  const pct = (k: number) => (total > 0 ? Math.round((k / total) * 1000) / 10 : null);
  return {
    ...base,
    p: g?.p ?? null,
    c: g?.c ?? null,
    f: g?.f ?? null,
    pPct: g ? pct(g.p * 4) : null,
    cPct: g ? pct(g.c * 4) : null,
    fPct: g ? pct(g.f * 9) : null,
    pTarget,
  };
}

function fromDays(days: ChartDay[]): Point[] {
  return days.map((d) =>
    point(
      { key: d.date, label: d.label, title: d.longLabel, note: d.logged ? null : "Chưa ghi bữa ăn" },
      d.logged ? { p: d.proteinG, c: d.carbG, f: d.fatG } : null,
      d.proteinTargetG,
    ),
  );
}

function fromWeeks(weeks: ChartWeek[]): Point[] {
  return weeks.map((w) =>
    point(
      {
        key: w.date,
        label: w.label,
        title: w.longLabel,
        note: w.loggedDays ? `TB mỗi ngày · ${w.loggedDays}/${w.days} ngày có ghi` : "Chưa có ngày trọn vẹn có ghi bữa ăn",
      },
      w.proteinG != null && w.carbG != null && w.fatG != null ? { p: w.proteinG, c: w.carbG, f: w.fatG } : null,
      w.proteinTargetG,
    ),
  );
}

export function MacroChart({ days, weeks, rangeWeeks }: { days: ChartDay[]; weeks: ChartWeek[]; rangeWeeks: number }) {
  const [mode, setMode] = useState<Mode>("share");
  const [grain, setGrain] = useGranularity(rangeWeeks);
  const points = useMemo(() => (grain === "day" ? fromDays(days) : fromWeeks(weeks)), [grain, days, weeks]);
  const ticks = grain === "day" ? mondayTicks(days) : undefined;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "share", label: "% năng lượng" },
            { value: "grams", label: "Gram" },
          ]}
        />
        <GranularityToggle value={grain} onChange={setGrain} />
      </div>
      {mode === "share" ? <ShareChart points={points} grain={grain} ticks={ticks} /> : <GramPanels points={points} grain={grain} ticks={ticks} />}
      {grain === "week" && <p className="mt-2 text-xs text-muted">Mỗi cột là trung bình một ngày trong tuần, chỉ tính ngày đã qua có ghi bữa ăn.</p>}
    </>
  );
}

function ShareChart({ points, grain, ticks }: { points: Point[]; grain: Granularity; ticks?: string[] }) {
  // Surface-colored gaps between segments, only while bars are wide enough to spare them.
  const gap = grain === "week" || points.length <= 31 ? { stroke: C.surface, strokeWidth: 1 } : {};
  return (
    <>
      <Legend
        items={[
          { label: MACRO_LABEL.protein, color: C.protein },
          { label: MACRO_LABEL.carb, color: C.carb },
          { label: MACRO_LABEL.fat, color: C.fat },
        ]}
      />
      <ChartBox>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={grain === "day" ? "25%" : "30%"}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} ticks={ticks} minTickGap={grain === "week" ? 6 : 24} />
            <YAxis {...axisProps} width={40} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              cursor={{ fill: C.border, fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as Point | undefined;
                if (!active || !d) return null;
                if (d.p == null) return <TooltipBox title={d.title} rows={[{ label: d.note ?? "Chưa ghi bữa ăn", value: "" }]} />;
                const v = (pct: number | null, g: number | null) => `${num(pct, 0)}% · ${num(g, 0)} g`;
                return (
                  <TooltipBox
                    title={d.title}
                    rows={[
                      ...(d.note ? [{ label: d.note, value: "" }] : []),
                      { label: MACRO_LABEL.protein, value: v(d.pPct, d.p), color: C.protein },
                      { label: MACRO_LABEL.carb, value: v(d.cPct, d.c), color: C.carb },
                      { label: MACRO_LABEL.fat, value: v(d.fPct, d.f), color: C.fat },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="pPct" stackId="m" fill={C.protein} {...gap} maxBarSize={barSize(grain)} isAnimationActive={false} />
            <Bar dataKey="cPct" stackId="m" fill={C.carb} {...gap} maxBarSize={barSize(grain)} isAnimationActive={false} />
            <Bar dataKey="fPct" stackId="m" fill={C.fat} {...gap} radius={[4, 4, 0, 0]} maxBarSize={barSize(grain)} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>
    </>
  );
}

/** Grams as three small charts, each on its own axis: a stacked total of g says nothing. */
function GramPanels({ points, grain, ticks }: { points: Point[]; grain: Granularity; ticks?: string[] }) {
  const panels = [
    { key: "p", label: MACRO_LABEL.protein, color: C.protein, target: true },
    { key: "c", label: MACRO_LABEL.carb, color: C.carb, target: false },
    { key: "f", label: MACRO_LABEL.fat, color: C.fat, target: false },
  ] as const;
  return (
    <div className="space-y-3">
      {panels.map((m, i) => {
        const values = points.map((p) => p[m.key]).filter((v): v is number => v != null);
        const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        const last = i === panels.length - 1;
        return (
          <div key={m.key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Swatch color={m.color} />
                {m.label}
                {m.target && (
                  <span className="ml-2 flex items-center gap-1.5 font-normal text-muted">
                    <Swatch color={C.foreground} dashed /> Mục tiêu
                  </span>
                )}
              </span>
              <span className="text-muted tabular-nums">TB {num(mean, 0)} g/ngày</span>
            </div>
            <div className={last ? "h-28" : "h-20"}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -8 }} barCategoryGap={grain === "day" ? "25%" : "30%"}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} ticks={ticks} minTickGap={grain === "week" ? 6 : 24} hide={!last} />
                  <YAxis {...axisProps} width={40} domain={[0, "auto"]} tickCount={3} tickFormatter={(v: number) => num(v, 0)} />
                  <Tooltip
                    cursor={{ fill: C.border, fillOpacity: 0.4 }}
                    content={({ active, payload }) => {
                      const d = payload?.[0]?.payload as Point | undefined;
                      if (!active || !d) return null;
                      const g = d[m.key];
                      return (
                        <TooltipBox
                          title={d.title}
                          rows={[
                            ...(d.note ? [{ label: d.note, value: "" }] : []),
                            ...(g != null ? [{ label: m.label, value: `${num(g, 0)} g`, color: m.color }] : []),
                            ...(m.target && d.pTarget != null
                              ? [{ label: "Mục tiêu", value: `${num(d.pTarget, 0)} g`, color: C.foreground, dashed: true }]
                              : []),
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey={m.key} fill={m.color} radius={[3, 3, 0, 0]} maxBarSize={barSize(grain)} isAnimationActive={false} />
                  {m.target && (
                    <Line
                      dataKey="pTarget"
                      stroke={C.foreground}
                      strokeOpacity={0.6}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
