"use client";

import { Activity, BarChart3, Dumbbell, Images, LayoutDashboard, LogOut, Scale, ShieldCheck, User, UserCircle, Utensils } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import { cn } from "./ui";

const LINKS = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/meals", label: "Ăn uống", icon: Utensils },
  { href: "/workouts", label: "Tập luyện", icon: Dumbbell },
  { href: "/body", label: "Cơ thể", icon: Scale },
  { href: "/analytics", label: "Phân tích", icon: BarChart3 },
  { href: "/gallery", label: "Ảnh", icon: Images },
  { href: "/profile", label: "Hồ sơ", icon: User },
];

// Bottom bar on phones shows the five most used sections.
const MOBILE = ["/", "/meals", "/workouts", "/body", "/analytics"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

interface Account {
  username: string;
  name: string;
}

export function SideNav({ account, isAdmin }: { account: Account; isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 md:flex">
      <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-lg font-semibold">
        <Activity className="size-5 text-accent" /> BodyMetrics
      </Link>
      <ul className="space-y-1">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                isActive(pathname, href) ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          </li>
        ))}
        {isAdmin && (
          <li>
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground"
            >
              <ShieldCheck className="size-4" /> Quản trị
            </Link>
          </li>
        )}
      </ul>
      <form action={logout} className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 pt-4">
        <span className="min-w-0 truncate text-sm text-muted" title={account.username}>
          {account.name || account.username}
        </span>
        <button type="submit" aria-label="Đăng xuất" title="Đăng xuất" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground">
          <LogOut className="size-4" />
        </button>
      </form>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {LINKS.filter((l) => MOBILE.includes(l.href)).map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px]",
                isActive(pathname, href) ? "text-accent" : "text-muted",
              )}
            >
              <Icon className="size-5" /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Logout sits behind the account button so a stray tap on the top bar never signs you out.
function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tài khoản"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn("rounded-lg p-2 hover:bg-surface-2", open ? "bg-surface-2 text-foreground" : "text-muted")}
      >
        <UserCircle className="size-5" />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-sm font-medium">{account.name || account.username}</div>
            <div className="truncate text-xs text-muted">@{account.username}</div>
          </div>
          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            <User className="size-4 text-muted" /> Hồ sơ
          </Link>
          <form action={logout}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface-2">
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function MobileTopBar({ account, isAdmin }: { account: Account; isAdmin: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Activity className="size-5 text-accent" /> BodyMetrics
      </Link>
      <div className="flex gap-1">
        {isAdmin && (
          <Link href="/admin" aria-label="Quản trị" className="rounded-lg p-2 text-muted hover:bg-surface-2">
            <ShieldCheck className="size-5" />
          </Link>
        )}
        <Link href="/gallery" aria-label="Ảnh" className="rounded-lg p-2 text-muted hover:bg-surface-2">
          <Images className="size-5" />
        </Link>
        <AccountMenu account={account} />
      </div>
    </header>
  );
}
