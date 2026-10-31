"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDay } from "@/lib/analytics";
import { num } from "@/lib/format";
import { axisProps, C, ChartBox, gridProps, Legend, mondayTicks, TooltipBox, xAxisProps } from "./chart-kit";

export function WeightChart({ days, goalKg }: { days: ChartDay[]; goalKg: number | null }) {
  const values = days.flatMap((d) => [d.weight, d.weightMa]).filter((v): v is number => v != null);
  let lo = Math.min(...values);
  const hi = Math.max(...values);
  // Show the goal line only when it is close enough not to flatten the trend.
  const showGoal = goalKg != null && goalKg >= lo - 3 && goalKg <= hi + 3;
  if (showGoal) lo = Math.min(lo, goalKg);
  const domain = [Math.floor(lo - 0.5), Math.ceil(Math.max(hi, showGoal ? goalKg : hi) + 0.5)];

  return (
    <>
      <Legend
        items={[
          { label: "Lần cân", color: C.muted, kind: "dot" },
          { label: "Trung bình 7 ngày", color: C.accent, kind: "line" },
          ...(showGoal ? [{ label: "Mục tiêu", color: C.foreground, dashed: true }] : []),
        ]}
      />
      <ChartBox>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} ticks={mondayTicks(days)} />
            <YAxis {...axisProps} domain={domain} width={40} tickFormatter={(v: number) => num(v, 0)} allowDecimals={false} />
            {showGoal && (
              <ReferenceLine
                y={goalKg}
                stroke={C.foreground}
                strokeOpacity={0.6}
                strokeDasharray="5 4"
                label={{ value: `${num(goalKg)} kg`, position: "insideBottomRight", fill: C.muted, fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: C.border }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as ChartDay | undefined;
                if (!active || !d) return null;
                return (
                  <TooltipBox
                    title={d.longLabel}
                    rows={[
                      { label: "Cân", value: d.weight != null ? `${num(d.weight)} kg` : "–", color: C.muted },
                      { label: "TB 7 ngày", value: d.weightMa != null ? `${num(d.weightMa)} kg` : "–", color: C.accent },
                    ]}
                  />
                );
              }}
            />
            <Line
              dataKey="weight"
              stroke="none"
              isAnimationActive={false}
              dot={{ r: 3.5, fill: C.muted, stroke: C.surface, strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: C.muted, stroke: C.surface, strokeWidth: 2 }}
            />
            <Line dataKey="weightMa" stroke={C.accent} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBox>
    </>
  );
}
