"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

export interface WeightPoint {
  label: string; // dd/MM
  weight: number | null;
  avg: number | null;
}

export function WeightChart({ data, goal, height = 240 }: { data: WeightPoint[]; goal?: number | null; height?: number }) {
  const values = data.flatMap((d) => [d.weight, d.avg]).filter((v): v is number => v != null);
  if (goal) values.push(goal);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);

  return (
    <div style={{ height }} className="w-full text-xs">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            domain={[min, max]}
            allowDecimals={false}
            tickCount={5}
            tick={{ fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}
            labelStyle={{ color: "var(--muted)" }}
            formatter={(v, name) => [`${Number(v).toFixed(1)} kg`, name === "avg" ? "TB 7 ngày" : "Cân nặng"]}
          />
          {goal && (
            <ReferenceLine
              y={goal}
              stroke="var(--accent)"
              strokeDasharray="4 4"
              label={{ value: "Mục tiêu", fill: "var(--accent)", position: "insideTopRight", fontSize: 11 }}
            />
          )}
          <Scatter dataKey="weight" fill="var(--muted)" fillOpacity={0.55} />
          <Line dataKey="avg" stroke="var(--accent)" strokeWidth={2.5} dot={false} connectNulls type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
