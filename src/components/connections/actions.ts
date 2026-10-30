"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { revokeGrant } from "@/lib/oauth/tokens";

/** Revokes every token the signed-in user granted to this connector client. */
export async function revokeConnection(clientId: string) {
  const user = await requireUser();
  await revokeGrant(user.id, clientId);
  revalidatePath("/profile");
}
