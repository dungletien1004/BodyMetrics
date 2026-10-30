// End-to-end check of the claude.ai connector OAuth flow against a running app.
// Plays the client: discovery → registration → authorize (consent) → token → MCP → refresh
// rotation → reuse detection → revocation.
//
//   npm run dev                       # in another terminal
//   node scripts/oauth-e2e.mjs        # BASE_URL=http://localhost:3000 by default
//
// Needs .env (AUTH_SECRET, DATABASE_URL) and an existing user: E2E_USER, else AUTH_USERNAME,
// else the first user. A session cookie is signed directly with AUTH_SECRET (same as signSession).
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

if (existsSync(".env")) process.loadEnvFile(".env");
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const RESOURCE = `${BASE}/api/mcp`;

let passed = 0;
function check(cond, label, extra) {
  if (!cond) {
    console.error(`FAIL  ${label}`, extra ?? "");
    process.exit(1);
  }
  passed++;
  console.log(`ok    ${label}`);
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

async function sessionCookie() {
  const db = new PrismaClient();
  const username = process.env.E2E_USER || process.env.AUTH_USERNAME;
  const user = (username && (await db.user.findUnique({ where: { username } }))) || (await db.user.findFirst());
  await db.$disconnect();
  if (!user) throw new Error("No user in the database: log in once or run `npm run user:set -- <u> <p>`");
  const jwt = await new SignJWT({ ver: user.sessionVer })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return `bm_session=${jwt}`;
}

const get = (path, headers = {}) => fetch(`${BASE}${path}`, { headers, redirect: "manual" });
const postForm = (path, body, headers = {}) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body),
    redirect: "manual",
  });

async function mcp(token, method, params = {}, id = 1) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  let body = null;
  if (res.ok) {
    const data = text.trim().startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
    body = data ? JSON.parse(data) : null;
  }
  return { status: res.status, headers: res.headers, body };
}

const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "oauth-e2e", version: "1" } };

async function main() {
  const cookie = await sessionCookie();

  // ---- Discovery ----
  const unauth = await mcp(null, "initialize", INIT);
  const www = unauth.headers.get("www-authenticate") ?? "";
  check(unauth.status === 401, "MCP without token → 401");
  check(www.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`), "WWW-Authenticate points at path-suffixed PRM", www);

  const prm = await (await get("/.well-known/oauth-protected-resource/api/mcp")).json();
  check(prm.resource === RESOURCE && prm.authorization_servers?.[0] === BASE, "PRM (path-suffixed) names resource and issuer", prm);
  const rootPrm = await (await get("/.well-known/oauth-protected-resource")).json();
  check(rootPrm.resource === BASE, "PRM (root) answers too", rootPrm);
  check((await get("/.well-known/oauth-protected-resource/other")).status === 404, "PRM for unknown path → 404");

  const as = await (await get("/.well-known/oauth-authorization-server")).json();
  check(as.issuer === BASE && as.code_challenge_methods_supported?.includes("S256"), "AS metadata issuer + S256", as);
  check(as.client_id_metadata_document_supported === true && as.token_endpoint_auth_methods_supported?.[0] === "none", "AS metadata CIMD + public clients");

  // ---- Dynamic client registration ----
  const reg = (body) =>
    fetch(as.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  check((await reg({ redirect_uris: ["http://evil.example/cb"] })).status === 400, "DCR rejects plain-http redirect");
  const regRes = await reg({ client_name: "Claude (e2e)", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
  const client = await regRes.json();
  check(regRes.status === 201 && client.client_id && client.token_endpoint_auth_method === "none", "DCR registers public client", client);

  // ---- Authorize ----
  const authQuery = (p, extra = {}) =>
    new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: p.challenge,
      code_challenge_method: "S256",
      state: "st-123",
      scope: "bodymetrics",
      resource: RESOURCE,
      ...extra,
    });

  const p1 = pkce();
  const q1 = authQuery(p1);
  const toLogin = await get(`/oauth/authorize?${q1}`);
  const loginUrl = new URL(toLogin.headers.get("location") ?? "", BASE);
  check(toLogin.status === 307 && loginUrl.pathname === "/login", "authorize without session → /login");
  check(loginUrl.searchParams.get("next") === `/oauth/authorize?${q1}`, "login next keeps the full authorize query", loginUrl.searchParams.get("next"));

  const consent = await get(`/oauth/authorize?${q1}`, { cookie });
  const html = await consent.text();
  check(consent.status === 200 && html.includes("Cho phép") && html.includes("Claude (e2e)"), "consent page renders");
  check(consent.headers.get("x-frame-options") === "DENY", "consent page cannot be framed");

  const badRedirect = await get(`/oauth/authorize?${authQuery(p1, { redirect_uri: "https://evil.example/cb" })}`, { cookie });
  check(badRedirect.status === 200 && (await badRedirect.text()).includes("Không thể kết nối"), "unregistered redirect_uri → error page, no redirect");

  const noPkce = await get(`/oauth/authorize?${authQuery(p1, { code_challenge_method: "plain" })}`, { cookie });
  const noPkceLoc = new URL(noPkce.headers.get("location") ?? "about:blank");
  check(noPkceLoc.origin === "https://claude.ai" && noPkceLoc.searchParams.get("error") === "invalid_request", "non-S256 PKCE → error redirect");

  for (const cid of ["https://localhost/client.json", "https://127.0.0.1/client.json", "http://example.com/client.json"]) {
    const r = await get(`/oauth/authorize?${authQuery(p1, { client_id: cid })}`, { cookie });
    check(r.status === 200 && (await r.text()).includes("Không thể kết nối"), `CIMD client_id refused: ${cid}`);
  }

  const decide = (q, decision, headers = { cookie, origin: BASE }) =>
    postForm("/api/oauth/authorize", { ...Object.fromEntries(q), decision }, headers);
  check((await decide(q1, "allow", { cookie })).status === 403, "consent POST without Origin → 403");
  check((await decide(q1, "allow", { origin: BASE })).status === 401, "consent POST without session → 401");

  const denied = new URL((await decide(q1, "deny")).headers.get("location"));
  check(denied.searchParams.get("error") === "access_denied" && denied.searchParams.get("state") === "st-123", "Từ chối → access_denied + state");

  async function authorize() {
    const p = pkce();
    const res = await decide(authQuery(p), "allow");
    const loc = new URL(res.headers.get("location"));
    return { res, loc, code: loc.searchParams.get("code"), verifier: p.verifier };
  }

  // ---- Token: code exchange ----
  const token = (body) => postForm("/api/oauth/token", { client_id: client.client_id, ...body });
  const exchange = (a, extra = {}) =>
    token({ grant_type: "authorization_code", code: a.code, redirect_uri: REDIRECT, code_verifier: a.verifier, resource: RESOURCE, ...extra });

  const a1 = await authorize();
  check(a1.res.status === 303 && a1.code && a1.loc.searchParams.get("state") === "st-123" && a1.loc.searchParams.get("iss") === BASE, "Cho phép → code + state + iss");
  const wrongVerifier = await (await exchange(a1, { code_verifier: pkce().verifier })).json();
  check(wrongVerifier.error === "invalid_grant", "wrong PKCE verifier → invalid_grant");
  check((await (await exchange(a1)).json()).error === "invalid_grant", "code is single-use even after a failed attempt");

  const a2 = await authorize();
  check((await (await exchange(a2, { redirect_uri: "https://claude.ai/other" })).json()).error === "invalid_grant", "redirect_uri mismatch → invalid_grant");
  const a3 = await authorize();
  check((await (await exchange(a3, { resource: "https://evil.example/mcp" })).json()).error === "invalid_target", "foreign resource → invalid_target");

  const a4 = await authorize();
  const t1Res = await exchange(a4);
  const t1 = await t1Res.json();
  check(t1Res.status === 200 && t1.access_token && t1.refresh_token && t1.expires_in === 3600, "code → access + refresh tokens", t1);
  check(t1Res.headers.get("cache-control") === "no-store", "token response not cacheable");

  // ---- MCP with bearer ----
  const init = await mcp(t1.access_token, "initialize", INIT);
  check(init.status === 200 && init.body?.result?.serverInfo?.name === "BodyMetrics", "MCP initialize with bearer", init.body);
  const tools = await mcp(t1.access_token, "tools/list", {}, 2);
  const names = tools.body?.result?.tools?.map((t) => t.name) ?? [];
  check(tools.status === 200 && names.length > 0, `MCP tools/list (${names.join(", ")})`);
  check((await mcp("bm_at_bogus", "tools/list")).status === 401, "bogus bearer → 401");

  // Replaying a used code revokes what it produced.
  check((await (await exchange(a4)).json()).error === "invalid_grant", "replayed code → invalid_grant");
  check((await mcp(t1.access_token, "tools/list")).status === 401, "…and the tokens from that code are revoked");

  // ---- Refresh rotation and reuse detection ----
  const a5 = await authorize();
  const g1 = await (await exchange(a5)).json();
  const refresh = (rt) => token({ grant_type: "refresh_token", refresh_token: rt, resource: RESOURCE });
  const g2 = await (await refresh(g1.refresh_token)).json();
  check(g2.access_token && g2.refresh_token && g2.refresh_token !== g1.refresh_token, "refresh → new pair (rotated)", g2);
  check((await mcp(g2.access_token, "tools/list")).status === 200, "refreshed access token works");
  const g3 = await (await refresh(g2.refresh_token)).json();
  check(g3.refresh_token, "second rotation works");
  const reuse = await (await refresh(g1.refresh_token)).json();
  check(reuse.error === "invalid_grant", "reusing a rotated refresh token → invalid_grant");
  check((await (await refresh(g3.refresh_token)).json()).error === "invalid_grant", "…which revokes the newest refresh token");
  check((await mcp(g3.access_token, "tools/list")).status === 401, "…and the family's access tokens");
  const otherClient = await (await token({ grant_type: "refresh_token", refresh_token: g3.refresh_token, client_id: "someone-else" })).json();
  check(otherClient.error === "invalid_grant", "refresh token bound to its client");

  // ---- Revocation (RFC 7009) ----
  const a6 = await authorize();
  const r1 = await (await exchange(a6)).json();
  const rev = (t) => postForm("/api/oauth/revoke", { token: t, client_id: client.client_id });
  check((await rev(r1.access_token)).status === 200, "revoke access token → 200");
  check((await mcp(r1.access_token, "tools/list")).status === 401, "revoked access token → 401");
  const r2 = await (await refresh(r1.refresh_token)).json();
  check(r2.access_token, "refresh token survives access-token revocation");
  check((await rev(r2.refresh_token)).status === 200, "revoke refresh token → 200");
  check((await mcp(r2.access_token, "tools/list")).status === 401, "revoking the refresh token ends the whole grant");
  check((await rev("bm_rt_unknown")).status === 200, "unknown token revocation → 200");

  // Leave one live grant so /profile shows a connection.
  const keep = await authorize();
  const live = await (await exchange(keep)).json();
  check((await mcp(live.access_token, "tools/list")).status === 200, "a live grant is left for the /profile list");

  console.log(`\n${passed} checks passed against ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
