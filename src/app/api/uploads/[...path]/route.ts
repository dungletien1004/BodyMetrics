import { cookies } from "next/headers";
import { getCurrentUser, VIEW_AS_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { readImage } from "@/lib/storage";
import { serveUpload } from "@/lib/uploads/serve";

// Serves a photo only to its owner (or to an admin currently viewing that owner's data).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const user = await getCurrentUser();
  const viewAsId = user?.role === "admin" ? (await cookies()).get(VIEW_AS_COOKIE)?.value : undefined;
  return serveUpload({
    path,
    user,
    viewAsId,
    resolveViewAsUserId: async (id) => (await db.user.findUnique({ where: { id }, select: { id: true } }))?.id ?? null,
    readImage,
  });
}
