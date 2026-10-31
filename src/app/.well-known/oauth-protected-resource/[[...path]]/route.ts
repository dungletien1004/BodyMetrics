import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { db } from "@/lib/db";
import { issuerFor, MCP_PATH, originOf } from "@/lib/oauth/origin";

// RFC 9728 protected resource metadata, at the root and path-suffixed for /api/mcp
// (`/.well-known/oauth-protected-resource/api/mcp`). The resource is derived from the path.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path;
  if (path) {
    const resourcePath = `/${path.join("/")}`;
    if (resourcePath !== MCP_PATH) {
      const match = resourcePath.match(/^\/api\/mcp\/shared\/(c[a-z0-9]{24})$/);
      if (!match || !(await db.mcpConnectionGroup.findUnique({ where: { id: match[1] }, select: { id: true } }))) {
        return new Response("Not found", { status: 404 });
      }
    }
  }
  return protectedResourceHandler({ authServerUrls: [issuerFor(originOf(req))] })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
