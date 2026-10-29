"use client";

// Shared bits for the Recharts charts: theme colors (CSS vars, so light/dark follow the
// app theme), axis styling, tooltip box, legend and a small segmented toggle.
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export const C = {
  intake: "var(--intake)",
  burn: "var(--burn)",
  accent: "var(--accent)",
  protein: "var(--protein)",
  carb: "var(--carb)",
  fat: "var(--fat)",
  muted: "var(--muted)",
  border: "var(--border)",
  surface: "var(--surface)",
  foreground: "var(--foreground)",
  danger: "var(--danger)",
} as const;

export const axisProps = {
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: C.border },
} as const;

export const xAxisProps = { ...axisProps, dataKey: "label", interval: "preserveStartEnd", minTickGap: 24 } as const;

export const gridProps = { stroke: C.border, strokeDasharray: "3 3", vertical: false } as const;

export function ChartBox({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("h-60 w-full sm:h-72 [&_.recharts-surface]:outline-none", className)}>{children}</div>;
}

export function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="min-w-40 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{title}</div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              {r.color && <Swatch color={r.color} dashed={r.dashed} />}
              {r.label}
            </span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Swatch({ color, kind = "box", dashed }: { color: string; kind?: "box" | "line" | "dot"; dashed?: boolean }) {
  if (kind === "line" || dashed)
    return <span className="inline-block w-3.5 border-t-2" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />;
  return <span className={cn("inline-block size-2.5", kind === "dot" ? "rounded-full" : "rounded-sm")} style={{ background: color }} />;
}

export function Legend({ items }: { items: { label: string; color: string; kind?: "box" | "line" | "dot"; dashed?: boolean }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} kind={i.kind} dashed={i.dashed} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface-2 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-lg px-2.5 py-1 transition",
            value === o.value ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
