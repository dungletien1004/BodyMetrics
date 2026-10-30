"use server";

import { redirect } from "next/navigation";
import { stopViewAs } from "@/lib/auth";

/** Leave read-only "view as" mode and return to the admin user list. */
export async function exitViewAs() {
  await stopViewAs();
  redirect("/admin");
}
