import { getViewer } from "@/lib/auth";
import { readImage } from "@/lib/storage";

// Serves a photo only to its owner (or to an admin currently viewing that owner's data).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const viewer = await getViewer();
  const img = path.length === 1 ? await readImage(path[0], viewer.userId) : null;
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
