import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

const MAX_EDGE = 1600;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface StoredImage {
  path: string; // relative, forward slashes
  width: number;
  height: number;
}

/** Resolve a stored relative path, refusing anything that escapes UPLOAD_DIR. */
export function resolveUpload(rel: string): string | null {
  const abs = path.resolve(UPLOAD_DIR, rel);
  return abs.startsWith(UPLOAD_DIR + path.sep) ? abs : null;
}

export function uploadUrl(rel: string): string {
  return `/api/uploads/${rel}`;
}

/** Auto-rotate, downscale and re-encode an uploaded image as WebP under uploads/<kind>/YYYY-MM/. */
export async function saveImage(file: File, kind: "food" | "body"): Promise<StoredImage> {
  if (!file.type.startsWith("image/")) throw new Error("Tệp không phải hình ảnh");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Ảnh quá lớn (tối đa 20 MB)");

  const input = Buffer.from(await file.arrayBuffer());
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const month = new Date().toISOString().slice(0, 7);
  const rel = `${kind}/${month}/${randomUUID()}.webp`;
  const abs = resolveUpload(rel)!;
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return { path: rel, width: info.width, height: info.height };
}

export async function readImage(rel: string): Promise<Buffer> {
  const abs = resolveUpload(rel);
  if (!abs) throw new Error("Invalid upload path");
  return readFile(abs);
}

/** JPEG copy for sending to the vision model. */
export async function imageAsJpegBase64(rel: string, maxEdge = 1280): Promise<string> {
  const buf = await sharp(await readImage(rel))
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString("base64");
}

export async function deleteImage(rel: string): Promise<void> {
  const abs = resolveUpload(rel);
  if (abs) await unlink(abs).catch(() => {});
}
