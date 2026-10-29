"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { createWeeklyReport } from "./actions";

export function ReportButton({ weekStart, label, variant = "primary" }: { weekStart: string; label: string; variant?: "primary" | "secondary" }) {
  const [state, action, pending] = useActionState(createWeeklyReport, null);
  return (
    <form action={action} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="weekStart" value={weekStart} />
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {pending ? "Đang viết báo cáo…" : label}
      </Button>
      {pending && <p className="text-xs text-muted">Thường mất 20–60 giây.</p>}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
