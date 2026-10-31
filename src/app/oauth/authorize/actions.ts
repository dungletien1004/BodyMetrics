"use server";

import { redirect } from "next/navigation";
import { endSession, safeNext } from "@/lib/auth";

/** "Không phải bạn?": sign out, then sign in again and come back to the same consent request. */
export async function switchAccount(authorizeUrl: string) {
  await endSession();
  const next = safeNext(authorizeUrl);
  redirect(next.startsWith("/oauth/authorize?") ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
