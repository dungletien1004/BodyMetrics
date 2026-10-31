"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDay, ChartWeek } from "@/lib/analytics";
import { kcal, signed } from "@/lib/format";
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
  TooltipBox,
  useGranularity,
  xAxisProps,
} from "./chart-kit";

type Mode = "flow" | "balance";

/** A day or a week (averages per logged day), in one shape for the chart. */
interface Point {
  key: string;
  label: string;
  title: string;
  note: string | null; // shown in the tooltip under the title
  intake: number | null;
  burn: number | null;
  target: number | null;
  balance: number | null;
}

function fromDays(days: ChartDay[]): Point[] {
  return days.map((d) => ({
    key: d.date,
    label: d.label,
    title: d.longLabel,
    note: d.intake == null ? "Chưa ghi bữa ăn" : d.balance == null ? "Hôm nay, chưa chốt" : null,
    intake: d.intake,
    burn: d.burn,
    target: d.intake == null ? null : d.target,
    balance: d.balance,
  }));
}

function fromWeeks(weeks: ChartWeek[]): Point[] {
  return weeks.map((w) => ({
    key: w.date,
    label: w.label,
    title: w.longLabel,
    note: w.loggedDays ? `TB mỗi ngày · ${w.loggedDays}/${w.days} ngày có ghi` : "Chưa có ngày trọn vẹn có ghi bữa ăn",
    intake: w.intake,
    burn: w.burn,
    target: w.target,
    balance: w.balance,
  }));
}

export function EnergyChart({
  days,
  weeks,
  rangeWeeks,
  plannedDeficit,
}: {
  days: ChartDay[];
  weeks: ChartWeek[];
  rangeWeeks: number;
  plannedDeficit: number;
}) {
  const [mode, setMode] = useState<Mode>("flow");
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
            { value: "flow", label: "Nạp vs tiêu hao" },
            { value: "balance", label: "Thâm hụt" },
          ]}
        />
        <GranularityToggle value={grain} onChange={setGrain} />
      </div>
      {mode === "flow" ? (
        <Legend
          items={[
            { label: "Calo nạp", color: C.intake },
            { label: "Tổng tiêu hao", color: C.burn, kind: "line" },
            { label: "Mục tiêu nạp", color: C.accent, dashed: true },
          ]}
        />
      ) : (
        <Legend
          items={[
            { label: "Thâm hụt", color: C.burn },
            { label: "Dư", color: C.intake },
            { label: `Dự kiến ${signed(-plannedDeficit)}`, color: C.foreground, dashed: true },
          ]}
        />
      )}
      <ChartBox>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap={grain === "day" ? "25%" : "30%"}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} ticks={ticks} minTickGap={grain === "week" ? 6 : 24} />
            <YAxis
              {...axisProps}
              width={mode === "flow" ? 44 : 52}
              tickCount={5}
              tickFormatter={(v: number) => (mode === "flow" ? kcal(v) : signed(v))}
              domain={mode === "flow" ? [0, "auto"] : ["auto", "auto"]}
            />
            <Tooltip
              cursor={{ fill: C.border, fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Point | undefined;
                if (!active || !p) return null;
                const rows = [
                  ...(p.note ? [{ label: p.note, value: "" }] : []),
                  ...(p.intake != null ? [{ label: "Nạp", value: `${kcal(p.intake)} kcal`, color: C.intake }] : []),
                  ...(p.burn != null ? [{ label: "Tổng tiêu hao", value: `${kcal(p.burn)} kcal`, color: C.burn }] : []),
                  ...(p.target != null ? [{ label: "Mục tiêu nạp", value: `${kcal(p.target)} kcal`, color: C.accent, dashed: true }] : []),
                  ...(p.balance != null ? [{ label: p.balance <= 0 ? "Thâm hụt" : "Dư", value: `${signed(p.balance)} kcal` }] : []),
                ];
                return <TooltipBox title={p.title} rows={rows} />;
              }}
            />
            {mode === "flow" ? (
              <>
                <Bar dataKey="intake" fill={C.intake} radius={[4, 4, 0, 0]} maxBarSize={barSize(grain)} isAnimationActive={false} />
                <Line dataKey="burn" stroke={C.burn} strokeWidth={2} dot={grain === "week" ? { r: 3, fill: C.burn } : false} isAnimationActive={false} />
                <Line
                  dataKey="target"
                  stroke={C.accent}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </>
            ) : (
              <>
                <ReferenceLine y={0} stroke={C.muted} />
                <ReferenceLine y={-plannedDeficit} stroke={C.foreground} strokeOpacity={0.6} strokeDasharray="5 4" />
                <Bar dataKey="balance" radius={2} maxBarSize={barSize(grain)} isAnimationActive={false}>
                  {points.map((p) => (
                    <Cell key={p.key} fill={(p.balance ?? 0) <= 0 ? C.burn : C.intake} />
                  ))}
                </Bar>
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBox>
      {grain === "week" && <p className="mt-2 text-xs text-muted">Mỗi cột là trung bình một ngày trong tuần, chỉ tính ngày đã qua có ghi bữa ăn.</p>}
    </>
  );
}
