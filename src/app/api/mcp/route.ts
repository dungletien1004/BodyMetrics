import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { MCP_INSTRUCTIONS, registerTools } from "@/lib/mcp/server";
import { mcpResourceFor, originOf, PROTECTED_RESOURCE_METADATA_PATH } from "@/lib/oauth/origin";
import { verifyAccessToken } from "@/lib/oauth/tokens";

// Remote MCP endpoint for the claude.ai connector. OAuth 2.1 bearer tokens (see /api/oauth/*);
// tools read the acting user from ctx.http.authInfo.extra.userId.

export const dynamic = "force-dynamic";
// MCP requests can read or write a profile's daily and historical records.
export const maxDuration = 60;

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "BodyMetrics", version: "1.0.0" },
  instructions: MCP_INSTRUCTIONS,
});

const authed = withMcpAuth(
  handler,
  async (req, bearer) => {
    if (!bearer) return undefined;
    const grant = await verifyAccessToken(bearer);
    if (!grant) return undefined;
    // Tokens are bound to this endpoint (RFC 8707); ones issued without `resource` are accepted.
    const resource = mcpResourceFor(originOf(req));
    if (grant.resource && grant.resource !== resource) return undefined;
    return {
      token: bearer,
      clientId: grant.clientId,
      scopes: grant.scope.split(" ").filter(Boolean),
      expiresAt: Math.floor(grant.expiresAt.getTime() / 1000),
      resource: new URL(resource),
      extra: { userId: grant.userId },
    };
  },
  { required: true, resourceMetadataPath: PROTECTED_RESOURCE_METADATA_PATH },
);

export { authed as GET, authed as POST, authed as DELETE };
