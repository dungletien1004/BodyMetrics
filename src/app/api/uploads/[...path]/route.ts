import { readFile } from "node:fs/promises";
import { resolveUpload } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const abs = resolveUpload(path.join("/"));
  if (!abs) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(abs);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
