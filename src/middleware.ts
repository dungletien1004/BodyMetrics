import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";

// Paths reachable without a session. /api/mcp authenticates with its own token.
const PUBLIC = [/^\/login(\/|$)/, /^\/api\/mcp(\/|$)/, /^\/api\/health$/];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  if (await readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  // Server actions and API calls get a plain 401; page loads go to the login form.
  if (req.method !== "GET" || pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except build assets and the public PWA files.
  matcher: ["/((?!_next/static|_next/image|icons/|icon.svg|apple-icon.png|manifest.webmanifest|favicon.ico).*)"],
};
