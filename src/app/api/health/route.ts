import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness check for the host: 200 when the database answers. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
