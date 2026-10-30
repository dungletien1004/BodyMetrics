// Small pieces shared by the user list and the user detail page. Server components.
import { differenceInCalendarDays } from "date-fns";
import { Eye } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { formatDayShort, parseDay, todayKey } from "@/lib/dates";
import { num, signed } from "@/lib/format";
import { viewAs } from "./actions";

// ui.tsx Badge sets its own colours and cn() does not merge classes, so these use their own pill.
function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap", className)}>{children}</span>;
}

export function RoleBadge({ role }: { role: string }) {
  return role === "admin" ? (
    <Pill className="bg-amber-400/20 font-medium text-amber-600">Quản trị</Pill>
  ) : (
    <Pill className="bg-surface-2 text-muted">Người dùng</Pill>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Pill className="bg-accent/10 text-accent">Hoạt động</Pill>
  ) : (
    <Pill className="bg-danger/10 font-medium text-danger">Đã khóa</Pill>
  );
}

/** "Hôm nay", "Hôm qua", "3 ngày trước (27/10)" or "Chưa có". */
export function lastActivityLabel(day: string | null): string {
  if (!day) return "Chưa có";
  const ago = differenceInCalendarDays(parseDay(todayKey()), parseDay(day));
  if (ago <= 0) return "Hôm nay";
  if (ago === 1) return "Hôm qua";
  return `${ago} ngày trước (${formatDayShort(day)})`;
}

/** Weight change in kg; a loss is shown in the accent colour. */
export function WeightChange({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">–</span>;
  return (
    <span className={cn("tabular-nums whitespace-nowrap", value < 0 ? "text-accent" : value > 0 ? "text-intake" : "text-muted")}>
      {signed(value, 1)} kg
    </span>
  );
}

export function Weight({ value }: { value: number | null }) {
  return value == null ? <span className="text-muted">–</span> : <span className="tabular-nums whitespace-nowrap">{num(value)} kg</span>;
}

export function ViewAsButton({ userId, self }: { userId: string; self: boolean }) {
  return (
    <form action={viewAs.bind(null, userId)}>
      <Button type="submit" variant="secondary" title={self ? "Mở dữ liệu của bạn" : "Xem dữ liệu ở chế độ chỉ xem"}>
        <Eye className="size-4" /> Xem dữ liệu
      </Button>
    </form>
  );
}
