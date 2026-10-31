"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { db } from "@/lib/db";

export type SharedGroupActionState = { error?: string; message?: string; joinCode?: string } | null;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const newJoinCode = () => `BM-${randomBytes(18).toString("base64url").toUpperCase()}`;

export async function createSharedGroup(_previous: SharedGroupActionState, form: FormData): Promise<SharedGroupActionState> {
  const userId = await requireWriter();
  const requestedName = String(form.get("name") ?? "").trim();
  const name = requestedName.slice(0, 60) || "BodyMetrics chung";
  const joinCode = newJoinCode();

  await db.mcpConnectionGroup.create({
    data: {
      name,
      ownerUserId: userId,
      joinCodeHash: hash(joinCode),
      members: { create: { userId } },
    },
  });
  revalidatePath("/profile");
  return { joinCode, message: "Đã tạo nhóm. Hãy gửi mã này cho từng người cần tham gia." };
}

export async function rotateSharedGroupJoinCode(_previous: SharedGroupActionState, form: FormData): Promise<SharedGroupActionState> {
  const userId = await requireWriter();
  const groupId = String(form.get("groupId") ?? "");
  const group = await db.mcpConnectionGroup.findFirst({ where: { id: groupId, ownerUserId: userId }, select: { id: true } });
  if (!group) return { error: "Không tìm thấy nhóm hoặc bạn không phải chủ nhóm." };

  const joinCode = newJoinCode();
  await db.mcpConnectionGroup.update({ where: { id: group.id, ownerUserId: userId }, data: { joinCodeHash: hash(joinCode) } });
  revalidatePath("/profile");
  return { joinCode, message: "Mã mới đã tạo; mã cũ không còn dùng được." };
}

export async function joinSharedGroup(_previous: SharedGroupActionState, form: FormData): Promise<SharedGroupActionState> {
  const userId = await requireWriter();
  const joinCode = String(form.get("joinCode") ?? "").trim().toUpperCase();
  if (!/^BM-[A-Z0-9_-]{20,40}$/.test(joinCode)) return { error: "Mã mời chưa đúng định dạng." };

  const group = await db.mcpConnectionGroup.findUnique({
    where: { joinCodeHash: hash(joinCode) },
    select: { id: true, name: true, members: { where: { userId }, select: { userId: true } } },
  });
  if (!group) return { error: "Mã mời không hợp lệ hoặc đã được đổi." };
  if (group.members.length > 0) return { message: `Bạn đã tham gia nhóm ${group.name}.` };

  await db.mcpConnectionGroupMember.create({ data: { groupId: group.id, userId } });
  revalidatePath("/profile");
  return { message: `Đã tham gia ${group.name}. Claude có thể dùng hồ sơ của bạn qua nhóm này.` };
}

export async function removeSharedGroupMember(form: FormData) {
  const ownerUserId = await requireWriter();
  const groupId = String(form.get("groupId") ?? "");
  const memberUserId = String(form.get("memberUserId") ?? "");
  if (!memberUserId || memberUserId === ownerUserId) return;

  const group = await db.mcpConnectionGroup.findFirst({ where: { id: groupId, ownerUserId }, select: { id: true } });
  if (!group) return;
  await db.mcpConnectionGroupMember.deleteMany({ where: { groupId: group.id, userId: memberUserId } });
  revalidatePath("/profile");
}

export async function leaveSharedGroup(form: FormData) {
  const userId = await requireWriter();
  const groupId = String(form.get("groupId") ?? "");
  const group = await db.mcpConnectionGroup.findFirst({
    where: { id: groupId, members: { some: { userId } } },
    select: { ownerUserId: true },
  });
  if (!group || group.ownerUserId === userId) return;
  await db.mcpConnectionGroupMember.deleteMany({ where: { groupId, userId } });
  revalidatePath("/profile");
}

export async function deleteSharedGroup(form: FormData) {
  const ownerUserId = await requireWriter();
  const groupId = String(form.get("groupId") ?? "");
  await db.mcpConnectionGroup.deleteMany({ where: { id: groupId, ownerUserId } });
  revalidatePath("/profile");
}
