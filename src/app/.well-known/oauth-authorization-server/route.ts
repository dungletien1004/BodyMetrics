import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { jsonResponse } from "@/lib/oauth/http";
import { issuerFor, originOf } from "@/lib/oauth/origin";
import { SCOPE } from "@/lib/oauth/tokens";

// RFC 8414 authorization server metadata. The issuer is the app origin.

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const origin = originOf(req);
  return jsonResponse(
    {
      issuer: issuerFor(origin),
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      revocation_endpoint: `${origin}/api/oauth/revoke`,
      scopes_supported: [SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    },
    200,
    { "Cache-Control": "public, max-age=3600" },
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
