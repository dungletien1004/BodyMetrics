"use client";

import { useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDay } from "@/lib/analytics";
import { kcal, signed } from "@/lib/format";
import { axisProps, C, ChartBox, gridProps, Legend, Segmented, TooltipBox, xAxisProps } from "./chart-kit";

type Mode = "flow" | "balance";

export function EnergyChart({ days, plannedDeficit }: { days: ChartDay[]; plannedDeficit: number }) {
  const [mode, setMode] = useState<Mode>("flow");

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "flow", label: "Nạp vs tiêu hao" },
            { value: "balance", label: "Thâm hụt / dư" },
          ]}
        />
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
            { label: "Thâm hụt (nạp < tiêu hao)", color: C.burn },
            { label: "Dư (nạp > tiêu hao)", color: C.intake },
            { label: `Thâm hụt dự kiến ${signed(-plannedDeficit)}`, color: C.foreground, dashed: true },
          ]}
        />
      )}
      <ChartBox>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap="20%">
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis
              {...axisProps}
              width={mode === "flow" ? 44 : 52}
              tickFormatter={(v: number) => (mode === "flow" ? kcal(v) : signed(v))}
              domain={mode === "flow" ? [0, "auto"] : ["auto", "auto"]}
            />
            <Tooltip
              cursor={{ fill: C.border, fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as ChartDay | undefined;
                if (!active || !d) return null;
                return (
                  <TooltipBox
                    title={d.longLabel}
                    rows={
                      d.intake == null
                        ? [{ label: "Chưa ghi bữa ăn", value: "" }, { label: "Tổng tiêu hao", value: `${kcal(d.burn)} kcal`, color: C.burn }]
                        : [
                            { label: "Nạp", value: `${kcal(d.intake)} kcal`, color: C.intake },
                            { label: "Tổng tiêu hao", value: `${kcal(d.burn)} kcal`, color: C.burn },
                            { label: "Mục tiêu nạp", value: `${kcal(d.target)} kcal`, color: C.accent, dashed: true },
                            d.balance == null
                              ? { label: "Hôm nay, chưa chốt", value: "" }
                              : { label: d.balance <= 0 ? "Thâm hụt" : "Dư", value: `${signed(d.balance)} kcal` },
                          ]
                    }
                  />
                );
              }}
            />
            {mode === "flow" ? (
              <>
                <Bar dataKey="intake" fill={C.intake} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Line dataKey="burn" stroke={C.burn} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="target" stroke={C.accent} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              </>
            ) : (
              <>
                <ReferenceLine y={0} stroke={C.muted} />
                <ReferenceLine y={-plannedDeficit} stroke={C.foreground} strokeOpacity={0.6} strokeDasharray="5 4" />
                <Bar dataKey="balance" radius={2} maxBarSize={18} isAnimationActive={false}>
                  {days.map((d) => (
                    <Cell key={d.date} fill={(d.balance ?? 0) <= 0 ? C.burn : C.intake} />
                  ))}
                </Bar>
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBox>
    </>
  );
}
