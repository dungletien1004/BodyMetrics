// JSON responses for the OAuth endpoints. They are called from browsers too (CORS) and
// must never be cached (RFC 6749 §5.1).

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...extra } });
}

export function oauthError(error: string, description: string, status = 400) {
  return jsonResponse({ error, error_description: description }, status);
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Form-encoded per spec; JSON accepted as a courtesy. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object") {
      for (const [k, v] of Object.entries(body)) if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  const form = new URLSearchParams(await req.text());
  for (const [k, v] of form) out[k] = v;
  return out;
}
