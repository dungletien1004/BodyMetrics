"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { revokeGrant } from "@/lib/oauth/tokens";

/** Revokes the signed-in user's personal grant or one shared-group grant. */
export async function revokeConnection(clientId: string, connectionGroupId: string | null = null) {
  const user = await requireUser();
  await revokeGrant(user.id, clientId, connectionGroupId);
  revalidatePath("/profile");
}
