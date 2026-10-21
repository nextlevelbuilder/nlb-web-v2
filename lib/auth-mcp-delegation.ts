import { getCloudflareContext } from "@opennextjs/cloudflare";
import { jwtVerify } from "jose";
import { getMcpOAuthLegacyResources, getMcpOAuthResource } from "@/lib/mcp-oauth-config";
import { consumeDelegationJti } from "@/lib/auth-mcp-delegation-replay";

export const MCP_ASSERTION_HEADER = "x-nlb-mcp-assertion";

export interface McpDelegationContext {
  scope: "mcp:read" | "mcp:write" | "mcp:keys";
  method: string;
  path: string;
}

/** Verify the separate, request-bound credential signed by the MCP resource server. */
export async function verifyMcpDelegation(
  assertion: string,
  context: McpDelegationContext,
): Promise<string | null> {
  try {
    let bindings: Record<string, unknown> = {};
    let workerBindings: Record<string, unknown> | null = null;
    try {
      bindings = getCloudflareContext().env as unknown as Record<string, unknown>;
      workerBindings = bindings;
    } catch {
      // Local development has no Cloudflare request context.
    }
    const secret = bindings.MCP_DELEGATION_SECRET ?? process.env.MCP_DELEGATION_SECRET;
    const baseUrl = bindings.BETTER_AUTH_URL ?? bindings.NEXT_PUBLIC_APP_URL ??
      process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    if (typeof secret !== "string" || typeof baseUrl !== "string") return null;
    const key = new TextEncoder().encode(secret);
    if (key.byteLength < 32) return null;
    const base = new URL(baseUrl);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) return null;

    const now = Math.floor(Date.now() / 1000);
    const { payload, protectedHeader } = await jwtVerify(assertion, key, {
      algorithms: ["HS256"],
      typ: "nlb-mcp-delegation+jwt",
      // The MCP worker still serving a legacy host signs with that host's resource.
      issuer: [getMcpOAuthResource(), ...getMcpOAuthLegacyResources()],
      audience: `${base.origin}/api`,
      requiredClaims: ["sub", "jti", "iat", "exp", "scope", "method", "path"],
    });
    if (protectedHeader.typ !== "nlb-mcp-delegation+jwt" ||
        typeof payload.sub !== "string" || !payload.sub.trim() ||
        typeof payload.jti !== "string" || !payload.jti.trim() ||
        typeof payload.iat !== "number" || !Number.isInteger(payload.iat) ||
        typeof payload.exp !== "number" || !Number.isInteger(payload.exp) ||
        payload.iat > now + 5 || payload.exp <= now ||
        payload.exp <= payload.iat || payload.exp - payload.iat > 60 ||
        payload.scope !== context.scope || payload.method !== context.method ||
        payload.path !== context.path) {
      return null;
    }
    // Checked last so only fully valid assertions consume their nonce.
    if (!(await consumeDelegationJti(payload.jti, payload.exp, workerBindings, now))) return null;
    return payload.sub;
  } catch {
    // A present but invalid assertion must never fall back to another credential.
    return null;
  }
}
