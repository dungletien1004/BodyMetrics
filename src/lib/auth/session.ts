// Signed session cookie (HS256 JWT). Edge-safe: used by middleware and server code.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "bm_session";
export const SESSION_DAYS = 30;

export interface SessionClaims {
  sub: string; // user id
  ver: number; // User.sessionVer at sign-in
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ver: claims.ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") return null;
    return { sub: payload.sub, ver: payload.ver };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.AUTH_INSECURE_COOKIE !== "1",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  };
}
