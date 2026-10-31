"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";

/**
 * Hides the "Ghi bằng ảnh qua Claude" card on the dashboard. The cookie (read in page.tsx) holds
 * the user id, so dismissing it doesn't hide it for another account on the same browser.
 */
export async function dismissClaudeTip() {
  const userId = await requireWriter();
  (await cookies()).set("bm_hide_claude_tip", userId, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax", httpOnly: true });
  revalidatePath("/");
}
