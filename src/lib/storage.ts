import "server-only";
import sharp from "sharp";
import { db } from "./db";

// Photos are re-encoded as WebP and stored in the ImageBlob table; `Photo.path` holds the blob id.
// Blobs carry their owner so the upload route only serves a user's own photos.

const MAX_EDGE = 1600;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface StoredImage {
  path: string; // ImageBlob id
  width: number;
  height: number;
}

export function uploadUrl(id: string): string {
  return `/api/uploads/${id}`;
}

/** Auto-rotate, downscale and re-encode an uploaded image as WebP, then store it for `userId`. */
export async function saveImage(file: File, userId: string): Promise<StoredImage> {
  if (!file.type.startsWith("image/")) throw new Error("Tệp không phải hình ảnh");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Ảnh quá lớn (tối đa 20 MB)");

  const input = Buffer.from(await file.arrayBuffer());
  let result;
  try {
    result = await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
    throw new Error(
      heic
        ? "Chưa đọc được ảnh HEIC. Trên iPhone, vào Cài đặt > Camera > Định dạng, chọn \"Tương thích nhất\", hoặc chụp màn hình ảnh rồi tải lên."
        : "Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG khác.",
    );
  }
  const { data, info } = result;
  const blob = await db.imageBlob.create({ data: { userId, data: new Uint8Array(data) }, select: { id: true } });
  return { path: blob.id, width: info.width, height: info.height };
}

/** The image, only if it belongs to `userId`. */
export async function readImage(id: string, userId: string): Promise<{ data: Uint8Array; mime: string } | null> {
  return db.imageBlob.findFirst({ where: { id, userId }, select: { data: true, mime: true } });
}

/** JPEG copy for sending to the vision model. */
export async function imageAsJpegBase64(id: string, userId: string, maxEdge = 1280): Promise<string> {
  const img = await readImage(id, userId);
  if (!img) throw new Error("Image not found");
  const buf = await sharp(img.data)
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString("base64");
}

export async function deleteImage(id: string, userId: string): Promise<void> {
  await db.imageBlob.deleteMany({ where: { id, userId } });
}
