import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { jwtVerify, SignJWT } from "jose";
import { db } from "./db";
import { deleteImage, MAX_UPLOAD_BYTES, saveImage } from "./storage";

// Photos attached to a saved meal or workout: from the app's own photo cards, from a link Claude
// passes, or uploaded by Claude's code sandbox through a short-lived signed URL.

export type PhotoTarget = { kind: "meal" | "workout"; id: string };

export const MAX_PHOTOS_PER_ENTRY = 6;

/** The page section where a saved meal / workout shows its photos. */
export function photoPagePath(t: PhotoTarget): string {
  return t.kind === "meal" ? `/meals/${t.id}#anh-bua-an` : `/workouts/${t.id}#anh-buoi-tap`;
}

async function findTarget(userId: string, t: PhotoTarget) {
  const select = { id: true, date: true, _count: { select: { photos: true } } } as const;
  return t.kind === "meal"
    ? db.meal.findFirst({ where: { id: t.id, userId }, select })
    : db.workout.findFirst({ where: { id: t.id, userId }, select });
}

export type AttachResult = { ok: true; photoIds: string[] } | { ok: false; error: string };

/** Store `files` and attach them to the user's meal / workout (at most MAX_PHOTOS_PER_ENTRY in all). */
export async function attachPhotos(userId: string, t: PhotoTarget, files: File[]): Promise<AttachResult> {
  const target = await findTarget(userId, t);
  if (!target) return { ok: false, error: t.kind === "meal" ? "Không tìm thấy bữa ăn." : "Không tìm thấy buổi tập." };
  if (!files.length) return { ok: false, error: "Chưa chọn ảnh." };
  if (target._count.photos + files.length > MAX_PHOTOS_PER_ENTRY) {
    return { ok: false, error: `Mỗi ${t.kind === "meal" ? "bữa" : "buổi tập"} tối đa ${MAX_PHOTOS_PER_ENTRY} ảnh.` };
  }
  const photoIds: string[] = [];
  try {
    for (const file of files) {
      const stored = await saveImage(file, userId);
      const photo = await db.photo.create({
        data: {
          ...stored,
          userId,
          date: target.date,
          ...(t.kind === "meal" ? { kind: "food", mealId: target.id } : { kind: "workout", workoutId: target.id }),
        },
      });
      photoIds.push(photo.id);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "Không lưu được ảnh." };
  }
  return { ok: true, photoIds };
}

/** Link a photo waiting in "Gửi ảnh cho Claude" (unlinked food photo) to a saved meal / workout. */
export async function linkPendingPhoto(userId: string, photoId: string, t: PhotoTarget, date: string): Promise<boolean> {
  const data = t.kind === "meal" ? { mealId: t.id, date } : { kind: "workout", workoutId: t.id, date };
  const res = await db.photo.updateMany({
    where: { id: photoId, userId, kind: "food", mealId: null, workoutId: null, bodyLogId: null },
    data,
  });
  return res.count > 0;
}

/** Remove one attached photo (with its image) from the user's meal / workout. */
export async function removeAttachedPhoto(userId: string, photoId: string): Promise<boolean> {
  const photo = await db.photo.findFirst({
    where: { id: photoId, userId, OR: [{ mealId: { not: null } }, { workoutId: { not: null } }] },
  });
  if (!photo) return false;
  await db.photo.delete({ where: { id: photo.id } });
  await deleteImage(photo.path, userId);
  return true;
}

/** Delete the photos of a meal / workout that is about to be deleted. */
export async function deletePhotosOf(userId: string, t: PhotoTarget): Promise<void> {
  const where = t.kind === "meal" ? { userId, mealId: t.id } : { userId, workoutId: t.id };
  const photos = await db.photo.findMany({ where, select: { id: true, path: true } });
  if (!photos.length) return;
  await db.photo.deleteMany({ where: { id: { in: photos.map((p) => p.id) } } });
  await Promise.all(photos.map((p) => deleteImage(p.path, userId)));
}

// ---- Fetching an image Claude links to --------------------------------------------------------

function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPublicAddress(v6.slice(7));
  return !(v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb"));
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Link ảnh không hợp lệ.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Chỉ nhận link http(s).");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || !addrs.every((a) => isPublicAddress(a.address))) throw new Error("Không truy cập được link ảnh này.");
  return url;
}

/** Download an image from a public link (redirects re-checked, size-capped) as a File. */
export async function fetchImageFromUrl(raw: string): Promise<File> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { accept: "image/*", "user-agent": "BodyMetrics/1.0 (meal photo attach)" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`Không tải được ảnh (HTTP ${res.status}).`);
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!type.startsWith("image/")) throw new Error("Link này không phải là ảnh (cần link trực tiếp tới file ảnh).");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > MAX_UPLOAD_BYTES) throw new Error("Ảnh quá lớn (tối đa 20 MB).");
      chunks.push(chunk);
    }
    const name = url.pathname.split("/").pop() || "photo";
    return new File([new Uint8Array(Buffer.concat(chunks))], name, { type });
  }
  throw new Error("Link ảnh chuyển hướng quá nhiều lần.");
}

// ---- Signed upload links for Claude's code sandbox ---------------------------------------------

export const UPLOAD_LINK_MINUTES = 30;

// A key of its own, so an upload link can never pass as a session cookie.
function uploadKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return createHash("sha256").update(`photo-upload:${secret}`).digest();
}

export async function signUploadToken(userId: string, t: PhotoTarget): Promise<string> {
  return new SignJWT({ k: t.kind, t: t.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setExpirationTime(`${UPLOAD_LINK_MINUTES}m`)
    .sign(uploadKey());
}

export async function readUploadToken(token: string): Promise<{ userId: string; target: PhotoTarget } | null> {
  try {
    const { payload } = await jwtVerify(token, uploadKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.t !== "string" || (payload.k !== "meal" && payload.k !== "workout")) return null;
    return { userId: payload.sub, target: { kind: payload.k, id: payload.t } };
  } catch {
    return null;
  }
}
