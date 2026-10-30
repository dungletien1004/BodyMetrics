// Public origin of the app as the browser / claude.ai sees it. On Vercel (and `next start`)
// the proxy sets x-forwarded-host/proto; same precedence as mcp-handler's getPublicOrigin.

export const MCP_PATH = "/api/mcp";
export const PROTECTED_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

export function originFromHeaders(h: Headers, fallbackUrl?: string): string {
  const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0].trim();
  if (!host) return fallbackUrl ? new URL(fallbackUrl).origin : "http://localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (isLocalHost(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function originOf(req: Request): string {
  return originFromHeaders(req.headers, req.url);
}

/** OAuth issuer = the app origin (no path), so its metadata lives at /.well-known/oauth-authorization-server. */
export const issuerFor = (origin: string) => origin;

/** RFC 8707 resource identifier of the MCP endpoint. */
export const mcpResourceFor = (origin: string) => `${origin}${MCP_PATH}`;

function isLocalHost(host: string) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}
