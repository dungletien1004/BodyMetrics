import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { MCP_INSTRUCTIONS, registerTools } from "@/lib/mcp/server";
import { db } from "@/lib/db";
import { mcpResourceFor, originOf } from "@/lib/oauth/origin";
import { verifyAccessToken } from "@/lib/oauth/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "BodyMetrics shared", version: "1.0.0" },
  instructions: MCP_INSTRUCTIONS,
});

async function handle(req: Request) {
  const groupId = new URL(req.url).pathname.match(/^\/api\/mcp\/shared\/(c[a-z0-9]{24})$/)?.[1];
  if (!groupId) return new Response("Not found", { status: 404 });

  const authed = withMcpAuth(
    handler,
    async (request, bearer) => {
      if (!bearer) return undefined;
      if (!(await db.mcpConnectionGroup.findUnique({ where: { id: groupId }, select: { id: true } }))) return undefined;

      const grant = await verifyAccessToken(bearer);
      if (!grant || grant.connectionGroupId !== groupId) return undefined;
      const resource = mcpResourceFor(originOf(request), groupId);
      if (grant.resource !== resource) return undefined;

      return {
        token: bearer,
        clientId: grant.clientId,
        scopes: grant.scope.split(" ").filter(Boolean),
        expiresAt: Math.floor(grant.expiresAt.getTime() / 1000),
        resource: new URL(resource),
        extra: { userId: grant.userId, connectionGroupId: groupId },
      };
    },
    { required: true, resourceMetadataPath: `/.well-known/oauth-protected-resource/api/mcp/shared/${groupId}` },
  );
  return authed(req);
}

export { handle as GET, handle as POST, handle as DELETE };
