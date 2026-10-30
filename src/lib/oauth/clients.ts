import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { randomBytes } from "node:crypto";
import { db } from "../db";

// OAuth clients: Dynamic Client Registration (RFC 7591) rows in OAuthClient, or Client ID
// Metadata Documents (client_id is an https URL serving the client's metadata as JSON).
// All clients are public (PKCE, no secret).

export interface OAuthClientInfo {
  id: string;
  name: string;
  redirectUris: string[];
}

export class ClientError extends Error {}

const MAX_REDIRECT_URIS = 10;
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** https anywhere, or plain http only to a loopback host (native/dev clients). No fragments. */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.test(u.hostname));
}

/** Exact match, except loopback redirects may use any port (RFC 8252 §7.3). */
export function redirectUriMatches(client: OAuthClientInfo, redirectUri: string): boolean {
  if (client.redirectUris.includes(redirectUri)) return true;
  let u: URL;
  try {
    u = new URL(redirectUri);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" || !LOOPBACK.test(u.hostname)) return false;
  return client.redirectUris.some((r) => {
    const reg = new URL(r);
    return reg.protocol === "http:" && reg.hostname === u.hostname && reg.pathname === u.pathname && reg.search === u.search;
  });
}

function cleanName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  return name || fallback;
}

// ---- Dynamic Client Registration ----

export async function registerClient(meta: Record<string, unknown>) {
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    throw new ClientError("redirect_uris must list 1-10 URIs");
  }
  if (!uris.every(isAllowedRedirectUri)) throw new ClientError("redirect_uris must be https or http://localhost");
  const grantTypes = meta.grant_types;
  if (Array.isArray(grantTypes) && grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new ClientError("Only authorization_code and refresh_token grants are supported");
  }
  const responseTypes = meta.response_types;
  if (Array.isArray(responseTypes) && responseTypes.some((t) => t !== "code")) {
    throw new ClientError("Only the code response type is supported");
  }
  const client = await db.oAuthClient.create({
    data: {
      id: `bmc_${randomBytes(16).toString("base64url")}`,
      name: cleanName(meta.client_name, "Ứng dụng MCP"),
      redirectUris: uris as string[],
    },
  });
  return client;
}

// ---- Client ID Metadata Documents ----

const CIMD_TIMEOUT_MS = 5000;
const CIMD_MAX_BYTES = 10 * 1024;
const CIMD_CACHE_MS = 5 * 60 * 1000;
const cimdCache = new Map<string, { client: OAuthClientInfo; expires: number }>();

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96]] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

function isPrivateAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

export function isMetadataDocumentClientId(clientId: string): boolean {
  return clientId.startsWith("https://");
}

/** Rejects anything but a public https URL with a path (checked again after DNS resolution). */
async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ClientError("client_id is not a valid URL");
  }
  if (u.protocol !== "https:" || u.hash || u.username || u.password || u.pathname === "/") {
    throw new ClientError("client_id must be an https URL with a path");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (LOOPBACK.test(u.hostname) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new ClientError("client_id host is not public");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new ClientError("client_id host is not public");
  }
  return u;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CIMD_MAX_BYTES) {
      await reader.cancel();
      throw new ClientError("client metadata document is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchMetadataDocument(clientId: string): Promise<OAuthClientInfo> {
  const cached = cimdCache.get(clientId);
  if (cached && cached.expires > Date.now()) return cached.client;

  const url = await assertPublicHttpsUrl(clientId);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ClientError("could not fetch client metadata document");
  }
  if (!res.ok) throw new ClientError(`client metadata document returned HTTP ${res.status}`);

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(await readCapped(res));
  } catch (e) {
    throw e instanceof ClientError ? e : new ClientError("client metadata document is not JSON");
  }
  if (!doc || typeof doc !== "object" || doc.client_id !== clientId) {
    throw new ClientError("client metadata document client_id does not match its URL");
  }
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every(isAllowedRedirectUri)) {
    throw new ClientError("client metadata document has no valid redirect_uris");
  }
  const authMethod = doc.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") {
    throw new ClientError("only public clients (token_endpoint_auth_method none) are supported");
  }

  const client = { id: clientId, name: cleanName(doc.client_name, url.hostname), redirectUris: uris as string[] };
  cimdCache.set(clientId, { client, expires: Date.now() + CIMD_CACHE_MS });
  return client;
}

/** Looks up a registered client or fetches a metadata document. Throws ClientError when unusable. */
export async function resolveClient(clientId: string): Promise<OAuthClientInfo> {
  if (!clientId || clientId.length > 2000) throw new ClientError("missing client_id");
  if (isMetadataDocumentClientId(clientId)) return fetchMetadataDocument(clientId);
  const client = await db.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client) throw new ClientError("unknown client_id");
  return client;
}

/** Keeps a row for metadata-document clients so /profile can show their name. */
export async function rememberClient(client: OAuthClientInfo) {
  if (!isMetadataDocumentClientId(client.id)) return;
  await db.oAuthClient.upsert({
    where: { id: client.id },
    create: client,
    update: { name: client.name, redirectUris: client.redirectUris },
  });
}
