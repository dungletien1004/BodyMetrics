import { readImage } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const img = path.length === 1 ? await readImage(path[0]) : null;
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
