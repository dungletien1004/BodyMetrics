export interface UploadUser {
  id: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
}

interface ServeUploadOptions {
  path: string[];
  user: UploadUser | null;
  viewAsId?: string;
  resolveViewAsUserId: (id: string) => Promise<string | null>;
  readImage: (id: string, userId: string) => Promise<{ data: Uint8Array; mime: string } | null>;
}

/** Serve an image without using page-oriented auth helpers that may redirect. */
export async function serveUpload({ path, user, viewAsId, resolveViewAsUserId, readImage }: ServeUploadOptions): Promise<Response> {
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });

  let userId = user.id;
  if (user.role === "admin" && viewAsId && viewAsId !== user.id) {
    userId = (await resolveViewAsUserId(viewAsId)) ?? user.id;
  }

  const image = path.length === 1 ? await readImage(path[0], userId) : null;
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(image.data), {
    headers: { "Content-Type": image.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
