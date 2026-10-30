import { Eye } from "lucide-react";
import { MobileNav, MobileTopBar, SideNav } from "@/components/nav";
import { getViewer } from "@/lib/auth";
import { exitViewAs } from "./view-as-actions";

// Everything under (app) needs a signed-in user; the middleware has already checked the
// cookie signature, getViewer also rejects revoked sessions and resolves admin "view as".
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const isAdmin = viewer.user.role === "admin";
  return (
    <>
      <div className="flex min-h-dvh">
        <SideNav username={viewer.user.username} isAdmin={isAdmin} />
        <div className="min-w-0 flex-1">
          <MobileTopBar isAdmin={isAdmin} />
          {viewer.viewingAs && (
            <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-black md:top-0">
              <span className="flex items-center gap-2">
                <Eye className="size-4" />
                Đang xem dữ liệu của <b>{viewer.viewingAs.name || viewer.viewingAs.username}</b> (chỉ xem)
              </span>
              <form action={exitViewAs}>
                <button type="submit" className="rounded-lg bg-black/15 px-3 py-1 font-medium hover:bg-black/25">
                  Thoát
                </button>
              </form>
            </div>
          )}
          <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 sm:px-6 md:pt-8 md:pb-10">
            {/* Read-only view of another user's data: every form control is disabled. */}
            <fieldset disabled={viewer.readOnly} className="contents">
              {children}
            </fieldset>
          </main>
        </div>
      </div>
      <MobileNav />
    </>
  );
}
