import "server-only";
import { ClientError, redirectUriMatches, resolveClient, type OAuthClientInfo } from "./clients";
import { issuerFor, mcpResourceFor } from "./origin";

// Validation shared by the consent page (GET /oauth/authorize) and the decision endpoint
// (POST /api/oauth/authorize), which re-checks everything the form sends back.

export const AUTHORIZE_FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

export type AuthorizeParams = Partial<Record<(typeof AUTHORIZE_FIELDS)[number], string>>;

export interface ValidAuthorizeRequest {
  client: OAuthClientInfo;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
  resource: string | null;
}

export type AuthorizeCheck =
  // client or redirect_uri can't be trusted: show the error, never redirect.
  | { kind: "fatal"; message: string }
  // Valid client and redirect_uri but a bad request: report it to the client.
  | { kind: "redirect"; url: string }
  | { kind: "ok"; request: ValidAuthorizeRequest };

export function pickAuthorizeParams(get: (key: string) => unknown): AuthorizeParams {
  const out: AuthorizeParams = {};
  for (const key of AUTHORIZE_FIELDS) {
    const v = get(key);
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

/** Callback URL with OAuth response parameters (RFC 9207 `iss` included). */
export function callbackUrl(redirectUri: string, origin: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  url.searchParams.set("iss", issuerFor(origin));
  return url.toString();
}

/**
 * RFC 8707 resource: this server protects only the MCP endpoint. The bare origin is accepted
 * too (clients that fall back to root metadata use it). Returns the canonical value or false.
 */
export function canonicalResource(value: string | undefined | null, origin: string): string | null | false {
  if (!value) return null;
  const v = value.replace(/\/+$/, "");
  return v === origin || v === mcpResourceFor(origin) ? mcpResourceFor(origin) : false;
}

export async function checkAuthorizeRequest(p: AuthorizeParams, origin: string): Promise<AuthorizeCheck> {
  let client: OAuthClientInfo;
  try {
    client = await resolveClient(p.client_id ?? "");
  } catch (e) {
    return { kind: "fatal", message: e instanceof ClientError ? `Ứng dụng không hợp lệ (${e.message}).` : "Không kiểm tra được ứng dụng." };
  }

  // Always required (MCP authorization spec), so the token request can be matched against it.
  const redirectUri = p.redirect_uri;
  if (!redirectUri ||!redirectUriMatches(client, redirectUri)) {
    return { kind: "fatal", message: "Địa chỉ chuyển hướng (redirect_uri) không khớp với ứng dụng đã đăng ký." };
  }

  const state = p.state;
  const fail = (error: string, description: string): AuthorizeCheck => ({
    kind: "redirect",
    url: callbackUrl(redirectUri, origin, { error, error_description: description, state }),
  });

  if (state !== undefined && state.length > 1000) return fail("invalid_request", "state is too long");
  if (p.response_type !== "code") return fail("unsupported_response_type", "response_type must be code");
  if (p.code_challenge_method !== "S256") return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  if (!p.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge)) return fail("invalid_request", "invalid code_challenge");
  const resource = canonicalResource(p.resource, origin);
  if (resource === false) return fail("invalid_target", "unknown resource");

  return { kind: "ok", request: { client, redirectUri, codeChallenge: p.code_challenge, state, resource } };
}
