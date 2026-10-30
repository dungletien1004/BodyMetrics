import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../db";

// Authorization codes, access and refresh tokens. Only SHA-256 hashes are stored.

export const SCOPE = "bodymetrics";
const CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
// Expired/revoked rows are kept a while so reuse is still detected and "last used" survives.
const RETAIN_MS = 31 * 24 * 3600 * 1000;
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

export class GrantError extends Error {
  constructor(
    public code: "invalid_grant" | "invalid_request" | "invalid_target",
    message: string,
  ) {
    super(message);
  }
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** The User row if it may use the connector (locked accounts may not). */
export async function findActiveUser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;
  return user;
}

export function displayName(user: { username: string; name: string }): string {
  return user.name.trim() || user.username;
}

// ---- Authorization codes ----

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
}): Promise<string> {
  const code = randomToken("bm_ac_");
  await db.oAuthCode.create({
    data: { ...input, id: sha256(code), scope: SCOPE, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return code;
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(g: { userId: string; clientId: string; familyId: string; scope: string; resource: string | null }) {
  const access = randomToken("bm_at_");
  const refresh = randomToken("bm_rt_");
  const now = Date.now();
  await db.oAuthToken.createMany({
    data: [
      { ...g, id: sha256(access), kind: "access", expiresAt: new Date(now + ACCESS_TTL_S * 1000) },
      { ...g, id: sha256(refresh), kind: "refresh", expiresAt: new Date(now + REFRESH_TTL_MS) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: g.scope } satisfies TokenResponse;
}

export async function revokeFamily(familyId: string) {
  await db.oAuthToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function exchangeAuthorizationCode(p: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string | null;
}): Promise<TokenResponse> {
  const id = sha256(p.code);
  const row = await db.oAuthCode.findUnique({ where: { id } });
  if (!row) throw new GrantError("invalid_grant", "unknown authorization code");

  // Single use. A replayed code means it leaked: revoke whatever it already produced (RFC 9700 §4.2.4).
  const claimed = await db.oAuthCode.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) {
    await revokeFamily(id);
    throw new GrantError("invalid_grant", "authorization code already used");
  }
  if (row.expiresAt < new Date()) throw new GrantError("invalid_grant", "authorization code expired");
  if (row.clientId !== p.clientId) throw new GrantError("invalid_grant", "client_id mismatch");
  if (row.redirectUri !== p.redirectUri) throw new GrantError("invalid_grant", "redirect_uri mismatch");
  if (!pkceMatches(p.codeVerifier, row.codeChallenge)) throw new GrantError("invalid_grant", "PKCE verification failed");
  if (p.resource && p.resource !== row.resource) throw new GrantError("invalid_target", "resource does not match the authorization");
  if (!(await findActiveUser(row.userId))) throw new GrantError("invalid_grant", "account is not active");

  await cleanup();
  return issueTokens({ userId: row.userId, clientId: row.clientId, familyId: id, scope: row.scope, resource: row.resource });
}

export async function refreshTokens(p: { refreshToken: string; clientId: string; resource: string | null }): Promise<TokenResponse> {
  const id = sha256(p.refreshToken);
  const row = await db.oAuthToken.findUnique({ where: { id } });
  if (!row || row.kind !== "refresh" || row.clientId !== p.clientId) throw new GrantError("invalid_grant", "unknown refresh token");
  if (row.revokedAt) throw new GrantError("invalid_grant", "refresh token revoked");

  // Rotation: each refresh token works once. Presenting a rotated one again means two parties
  // hold it, so the whole grant is revoked.
  const claimed = await db.oAuthToken.updateMany({ where: { id, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) {
    await revokeFamily(row.familyId);
    throw new GrantError("invalid_grant", "refresh token reuse detected; grant revoked");
  }
  if (row.expiresAt < new Date()) throw new GrantError("invalid_grant", "refresh token expired");
  if (p.resource && p.resource !== row.resource) throw new GrantError("invalid_target", "resource does not match the grant");
  if (!(await findActiveUser(row.userId))) throw new GrantError("invalid_grant", "account is not active");

  return issueTokens({ userId: row.userId, clientId: row.clientId, familyId: row.familyId, scope: row.scope, resource: row.resource });
}

/** RFC 7009. Revoking a refresh token ends the whole grant; an access token only itself. */
export async function revokeToken(token: string, clientId: string | null) {
  const row = await db.oAuthToken.findUnique({ where: { id: sha256(token) } });
  if (!row || (clientId && row.clientId !== clientId)) return;
  if (row.kind === "refresh") await revokeFamily(row.familyId);
  else await db.oAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** A live access token's grant, or null. Also refuses tokens of deactivated users. */
export async function verifyAccessToken(token: string) {
  const row = await db.oAuthToken.findUnique({ where: { id: sha256(token) } });
  const now = new Date();
  if (!row || row.kind !== "access" || row.revokedAt || row.expiresAt <= now) return null;
  if (!(await findActiveUser(row.userId))) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await db.oAuthToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  return row;
}

// ---- Grants shown on /profile ----

export interface ConnectorGrant {
  clientId: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** One entry per client that still holds a live token for this user. */
export async function listGrants(userId: string): Promise<ConnectorGrant[]> {
  const now = new Date();
  const live = await db.oAuthToken.findMany({
    where: { userId, revokedAt: null, usedAt: null, expiresAt: { gt: now } },
    select: { familyId: true },
    distinct: ["familyId"],
  });
  if (live.length === 0) return [];
  const tokens = await db.oAuthToken.findMany({
    where: { familyId: { in: live.map((t) => t.familyId) }, revokedAt: null },
    select: { clientId: true, createdAt: true, lastUsedAt: true },
  });
  const byClient = new Map<string, { createdAt: Date; lastUsedAt: Date | null }>();
  for (const t of tokens) {
    const g = byClient.get(t.clientId);
    if (!g) byClient.set(t.clientId, { createdAt: t.createdAt, lastUsedAt: t.lastUsedAt });
    else {
      if (t.createdAt < g.createdAt) g.createdAt = t.createdAt;
      if (t.lastUsedAt && (!g.lastUsedAt || t.lastUsedAt > g.lastUsedAt)) g.lastUsedAt = t.lastUsedAt;
    }
  }
  const clients = await db.oAuthClient.findMany({ where: { id: { in: [...byClient.keys()] } }, select: { id: true, name: true } });
  const names = new Map(clients.map((c) => [c.id, c.name]));
  return [...byClient]
    .map(([clientId, g]) => ({ clientId, name: names.get(clientId) || clientId, ...g }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Ends every connector grant of a user: password change, admin reset, lock. */
export async function revokeAllForUser(userId: string) {
  await db.oAuthToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeGrant(userId: string, clientId: string) {
  await db.oAuthToken.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Drops stale codes, long-dead tokens and registered clients that never got a token. */
export async function cleanup() {
  const now = Date.now();
  const retain = new Date(now - RETAIN_MS);
  const day = new Date(now - 24 * 3600 * 1000);
  await db.oAuthCode.deleteMany({ where: { expiresAt: { lt: day } } });
  await db.oAuthToken.deleteMany({ where: { OR: [{ expiresAt: { lt: retain } }, { revokedAt: { lt: retain } }] } });
  const used = await db.oAuthToken.findMany({ select: { clientId: true }, distinct: ["clientId"] });
  const pending = await db.oAuthCode.findMany({ select: { clientId: true }, distinct: ["clientId"] });
  await db.oAuthClient.deleteMany({
    where: { createdAt: { lt: day }, id: { notIn: [...used, ...pending].map((r) => r.clientId) } },
  });
}
