import { MobileNav, MobileTopBar, SideNav } from "@/components/nav";
import { requireUser } from "@/lib/auth";

// Everything under (app) needs a signed-in user; the middleware has already checked the
// cookie signature, this also rejects sessions revoked by a password change.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <div className="flex min-h-dvh">
        <SideNav username={user.username} />
        <div className="min-w-0 flex-1">
          <MobileTopBar />
          <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 sm:px-6 md:pt-8 md:pb-10">{children}</main>
        </div>
      </div>
      <MobileNav />
    </>
  );
}
