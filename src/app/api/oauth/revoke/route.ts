import { corsPreflight, jsonResponse, oauthError, readParams } from "@/lib/oauth/http";
import { revokeToken } from "@/lib/oauth/tokens";

// RFC 7009 token revocation. Always 200 for unknown tokens so the endpoint reveals nothing.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const p = await readParams(req);
  if (!p.token) return oauthError("invalid_request", "token is required");
  await revokeToken(p.token, p.client_id ?? null);
  return jsonResponse({});
}

export const OPTIONS = corsPreflight;
