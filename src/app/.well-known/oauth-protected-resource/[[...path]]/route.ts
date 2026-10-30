import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { issuerFor, MCP_PATH, originOf } from "@/lib/oauth/origin";

// RFC 9728 protected resource metadata, at the root and path-suffixed for /api/mcp
// (`/.well-known/oauth-protected-resource/api/mcp`). The resource is derived from the path.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path;
  if (path && `/${path.join("/")}` !== MCP_PATH) return new Response("Not found", { status: 404 });
  return protectedResourceHandler({ authServerUrls: [issuerFor(originOf(req))] })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
