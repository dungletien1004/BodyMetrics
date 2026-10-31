import { getCurrentUser } from "@/lib/auth";
import { callbackUrl, checkAuthorizeRequest, pickAuthorizeParams } from "@/lib/oauth/authorize";
import { rememberClient } from "@/lib/oauth/clients";
import { originOf } from "@/lib/oauth/origin";
import { createAuthorizationCode, findActiveUser } from "@/lib/oauth/tokens";
import { db } from "@/lib/db";

// The consent form on /oauth/authorize posts here. Everything is validated again; the
// session cookie (SameSite=Lax) plus the Origin check keep other sites from approving.

export const dynamic = "force-dynamic";

function page(message: string, status: number) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(req: Request) {
  const origin = originOf(req);
  if (req.headers.get("origin") !== origin) return page("Yêu cầu không hợp lệ.", 403);

  const sessionUser = await getCurrentUser();
  if (!sessionUser) return page("Phiên đăng nhập đã hết hạn. Hãy kết nối lại từ Claude.", 401);
  const user = await findActiveUser(sessionUser.id);
  if (!user) return page("Tài khoản đã bị khóa.", 403);

  const form = await req.formData();
  const check = await checkAuthorizeRequest(pickAuthorizeParams((k) => form.get(k)), origin);
  if (check.kind === "fatal") return page(check.message, 400);
  if (check.kind === "redirect") return Response.redirect(check.url, 303);

  const { client, redirectUri, codeChallenge, state, resource, connectionGroupId } = check.request;
  if (connectionGroupId) {
    const group = await db.mcpConnectionGroup.findFirst({
      where: { id: connectionGroupId, ownerUserId: user.id, members: { some: { userId: user.id } } },
      select: { id: true },
    });
    if (!group) return page("Chỉ chủ nhóm mới có thể kết nối Claude cho nhóm này.", 403);
  }
  if (form.get("decision") !== "allow") {
    return Response.redirect(callbackUrl(redirectUri, origin, { error: "access_denied", error_description: "The user denied access", state }), 303);
  }

  await rememberClient(client);
  const code = await createAuthorizationCode({
    clientId: client.id,
    userId: user.id,
    connectionGroupId,
    redirectUri,
    codeChallenge,
    resource,
  });
  return Response.redirect(callbackUrl(redirectUri, origin, { code, state }), 303);
}
