import { ClientError, registerClient } from "@/lib/oauth/clients";
import { corsPreflight, jsonResponse, oauthError } from "@/lib/oauth/http";
import { cleanup } from "@/lib/oauth/tokens";

// RFC 7591 Dynamic Client Registration. Public clients only; the registered client still
// needs a signed-in user to approve it on /oauth/authorize before it gets any token.

export const dynamic = "force-dynamic";

// Per-IP cap so the open endpoint can't be used to fill the table.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const recent = new Map<string, { count: number; first: number }>();

function allow(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const r = recent.get(ip);
  if (!r || Date.now() - r.first > WINDOW_MS) {
    recent.set(ip, { count: 1, first: Date.now() });
    return true;
  }
  return ++r.count <= MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  if (!allow(req)) return oauthError("too_many_requests", "Too many registrations, try again later", 429);
  const meta = await req.json().catch(() => null);
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return oauthError("invalid_client_metadata", "Body must be a JSON object");
  }
  try {
    const client = await registerClient(meta);
    await cleanup();
    return jsonResponse(
      {
        client_id: client.id,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        // Every client is public, whatever it asked for (RFC 7591 §3.2.1 lets us say so).
        token_endpoint_auth_method: "none",
      },
      201,
    );
  } catch (e) {
    if (e instanceof ClientError) {
      return oauthError(e.message.startsWith("redirect_uris") ? "invalid_redirect_uri" : "invalid_client_metadata", e.message);
    }
    throw e;
  }
}

export const OPTIONS = corsPreflight;
