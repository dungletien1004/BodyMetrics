import { canonicalResource } from "@/lib/oauth/authorize";
import { corsPreflight, jsonResponse, oauthError, readParams } from "@/lib/oauth/http";
import { originOf } from "@/lib/oauth/origin";
import { exchangeAuthorizationCode, GrantError, refreshTokens } from "@/lib/oauth/tokens";

// Token endpoint: authorization_code (PKCE S256) and refresh_token (rotating). Public clients
// identify themselves with client_id only.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const p = await readParams(req);
  const clientId = p.client_id;
  if (!clientId) return oauthError("invalid_client", "client_id is required", 401);
  const resource = canonicalResource(p.resource, originOf(req));
  if (resource === false) return oauthError("invalid_target", "unknown resource");

  try {
    if (p.grant_type === "authorization_code") {
      if (!p.code || !p.redirect_uri || !p.code_verifier) {
        return oauthError("invalid_request", "code, redirect_uri and code_verifier are required");
      }
      return jsonResponse(
        await exchangeAuthorizationCode({ code: p.code, clientId, redirectUri: p.redirect_uri, codeVerifier: p.code_verifier, resource }),
      );
    }
    if (p.grant_type === "refresh_token") {
      if (!p.refresh_token) return oauthError("invalid_request", "refresh_token is required");
      return jsonResponse(await refreshTokens({ refreshToken: p.refresh_token, clientId, resource }));
    }
    return oauthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  } catch (e) {
    if (e instanceof GrantError) return oauthError(e.code, e.message);
    throw e;
  }
}

export const OPTIONS = corsPreflight;
