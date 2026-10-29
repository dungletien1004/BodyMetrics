"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDay } from "@/lib/analytics";
import { num } from "@/lib/format";
import { axisProps, C, ChartBox, gridProps, Legend, Segmented, TooltipBox, xAxisProps } from "./chart-kit";

type Mode = "grams" | "share";

interface Row extends ChartDay {
  p: number | null;
  c: number | null;
  f: number | null;
  pPct: number | null;
  cPct: number | null;
  fPct: number | null;
}

export function MacroChart({ days }: { days: ChartDay[] }) {
  const [mode, setMode] = useState<Mode>("grams");
  const rows: Row[] = useMemo(
    () =>
      days.map((d) => {
        const pk = d.proteinG * 4;
        const ck = d.carbG * 4;
        const fk = d.fatG * 9;
        const total = pk + ck + fk;
        const pct = (x: number) => (d.logged && total > 0 ? Math.round((x / total) * 1000) / 10 : null);
        return {
          ...d,
          p: d.logged ? d.proteinG : null,
          c: d.logged ? d.carbG : null,
          f: d.logged ? d.fatG : null,
          pPct: pct(pk),
          cPct: pct(ck),
          fPct: pct(fk),
        };
      }),
    [days],
  );
  const share = mode === "share";
  // Surface-colored gaps between segments, only while bars are wide enough to spare them.
  const gap = days.length <= 31 ? { stroke: C.surface, strokeWidth: 1 } : {};
  const keys = share ? (["pPct", "cPct", "fPct"] as const) : (["p", "c", "f"] as const);

  return (
    <>
      <div className="mb-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "grams", label: "Gram" },
            { value: "share", label: "% năng lượng" },
          ]}
        />
      </div>
      <Legend
        items={[
          { label: "Protein", color: C.protein },
          { label: "Carb", color: C.carb },
          { label: "Chất béo", color: C.fat },
          ...(share ? [] : [{ label: "Mục tiêu protein", color: C.foreground, dashed: true }]),
        ]}
      />
      <ChartBox>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="20%">
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis
              {...axisProps}
              width={40}
              domain={share ? [0, 100] : [0, "auto"]}
              ticks={share ? [0, 25, 50, 75, 100] : undefined}
              tickFormatter={(v: number) => (share ? `${v}%` : num(v, 0))}
            />
            <Tooltip
              cursor={{ fill: C.border, fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as Row | undefined;
                if (!active || !d) return null;
                if (!d.logged) return <TooltipBox title={d.longLabel} rows={[{ label: "Chưa ghi bữa ăn", value: "" }]} />;
                const v = (g: number, pct: number | null) => (share ? `${num(pct)}%` : `${num(g, 0)} g`);
                return (
                  <TooltipBox
                    title={d.longLabel}
                    rows={[
                      { label: "Protein", value: v(d.proteinG, d.pPct), color: C.protein },
                      { label: "Carb", value: v(d.carbG, d.cPct), color: C.carb },
                      { label: "Chất béo", value: v(d.fatG, d.fPct), color: C.fat },
                      ...(share ? [] : [{ label: "Mục tiêu protein", value: `${num(d.proteinTargetG, 0)} g`, color: C.foreground, dashed: true }]),
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey={keys[0]} stackId="m" fill={C.protein} {...gap} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey={keys[1]} stackId="m" fill={C.carb} {...gap} maxBarSize={18} isAnimationActive={false} />
            <Bar
              dataKey={keys[2]}
              stackId="m"
              fill={C.fat}
              {...gap}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
            {!share && (
              <Line
                dataKey="proteinTargetG"
                stroke={C.foreground}
                strokeOpacity={0.6}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBox>
    </>
  );
}
