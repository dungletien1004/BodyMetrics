// Small pieces shared by the user list and the user detail page. Server components.
import { differenceInCalendarDays } from "date-fns";
import { Eye } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { formatDayShort, parseDay, shiftDay, todayKey } from "@/lib/dates";
import { num, signed } from "@/lib/format";
import { viewAs } from "./actions";
import { LockedForm } from "./locked-form";

/** No meal, workout or body log for this many days counts as "stopped logging". */
export const STALE_DAYS = 3;

// ui.tsx Badge sets its own colours and cn() does not merge classes, so these use their own pill.
function Pill({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap", className)}>
      {children}
    </span>
  );
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

/** Still on the password an admin set (new account or reset). */
export function MustChangeBadge() {
  return (
    <Pill className="bg-surface-2 text-muted" title="Người dùng phải đổi mật khẩu ở lần đăng nhập tới">
      Chờ đổi mật khẩu
    </Pill>
  );
}

function daysAgo(day: string): number {
  return differenceInCalendarDays(parseDay(todayKey()), parseDay(day));
}

/**
 * "Ngưng ghi 5 ngày" when the last log is STALE_DAYS or more ago; "Chưa ghi gì" for an account
 * older than that with nothing logged. Nothing for locked accounts or people who log regularly.
 */
export function ActivityBadge({ lastActivity, createdAt, active }: { lastActivity: string | null; createdAt: Date; active: boolean }) {
  if (!active) return null;
  if (lastActivity) {
    const ago = daysAgo(lastActivity);
    return ago >= STALE_DAYS ? <Pill className="bg-intake/15 font-medium text-intake">Ngưng ghi {ago} ngày</Pill> : null;
  }
  return differenceInCalendarDays(new Date(), createdAt) >= STALE_DAYS ? (
    <Pill className="bg-intake/15 font-medium text-intake">Chưa ghi gì</Pill>
  ) : null;
}

/** "Hôm nay", "Hôm qua", "3 ngày trước (27/10)" or "Chưa có". */
export function lastActivityLabel(day: string | null): string {
  if (!day) return "Chưa có";
  const ago = daysAgo(day);
  if (ago <= 0) return "Hôm nay";
  if (ago === 1) return "Hôm qua";
  return `${ago} ngày trước (${formatDayShort(day)})`;
}

/**
 * Weight change in kg over `range` days; a loss is shown in the accent colour. When there is
 * no change to show, says why instead of a bare dash.
 */
export function WeightChange({ value, latestDate, range }: { value: number | null; latestDate: string | null; range: number }) {
  if (value == null) {
    const why = !latestDate
      ? "Chưa có lần cân"
      : latestDate <= shiftDay(todayKey(), -range)
        ? `Không cân trong ${range} ngày`
        : "Chưa đủ 2 lần cân";
    return <span className="text-muted">{why}</span>;
  }
  return (
    <span className={cn("tabular-nums whitespace-nowrap", value < 0 ? "text-accent" : value > 0 ? "text-intake" : "text-muted")}>
      {value === 0 ? "±0" : signed(value, 1)} kg
    </span>
  );
}

export function Weight({ value }: { value: number | null }) {
  return value == null ? (
    <span className="text-muted">Chưa có lần cân</span>
  ) : (
    <span className="tabular-nums whitespace-nowrap">{num(value)} kg</span>
  );
}

export function ViewAsButton({ userId, self }: { userId: string; self: boolean }) {
  return (
    <LockedForm action={viewAs.bind(null, userId)}>
      <Button type="submit" variant="secondary" title={self ? "Mở dữ liệu của bạn" : "Xem dữ liệu ở chế độ chỉ xem"}>
        <Eye className="size-4" /> Xem dữ liệu
      </Button>
    </LockedForm>
  );
}
