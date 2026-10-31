import { LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";
import { openMyApp } from "./actions";
import { AdminNav } from "./admin-nav";
import { LockedForm } from "./locked-form";

export const metadata: Metadata = { title: "Quản trị · BodyMetrics" };

// The admin area has its own dark header so it never looks like someone's personal data.
// Every page and action also calls requireAdmin(); this check only covers the shell.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-zinc-900 text-zinc-100 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2.5 sm:px-6 md:pb-2.5">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-amber-400" /> BodyMetrics
            <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900">Quản trị</span>
          </Link>
          <AdminNav />
          <div className="ml-auto flex items-center gap-1">
            <LockedForm action={openMyApp}>
              <button
                type="submit"
                title="Về ứng dụng với dữ liệu của bạn"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <LayoutDashboard className="size-4" /> <span className="hidden sm:inline">Ứng dụng của tôi</span>
              </button>
            </LockedForm>
            <span className="hidden max-w-32 truncate px-2 text-sm text-zinc-400 lg:inline">{me.username}</span>
            <LockedForm action={logout}>
              <button
                type="submit"
                aria-label="Đăng xuất"
                title="Đăng xuất"
                className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </LockedForm>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 md:py-8">{children}</main>
    </div>
  );
}
