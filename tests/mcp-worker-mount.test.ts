import { describe, expect, it, vi } from "vitest";
import { isMcpPath, resolveMcpMount, serveMcp, type McpWorkerEnv } from "@/lib/mcp-worker-mount";

const env: McpWorkerEnv = {
  MCP_OAUTH_ENABLED: "true",
  MCP_OAUTH_RESOURCE: "https://nextlevelbuilder.io/mcp",
  MCP_OAUTH_LEGACY_RESOURCES: "https://mcp.nextlevelbuilder.io/mcp",
  MCP_DELEGATION_SECRET: "mcp-worker-mount-tests-only-secret-32-chars",
  NEXT_PUBLIC_APP_URL: "https://nextlevelbuilder.io",
};

describe("MCP mount in the web worker", () => {
  it("only claims MCP paths", () => {
    for (const path of ["/mcp", "/mcp/", "/sse", "/message", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      expect(isMcpPath(path), path).toBe(true);
    }
    for (const path of ["/", "/mcpx", "/api/v1/products", "/.well-known/mcp.json", "/vi/mcp"]) {
      expect(isMcpPath(path), path).toBe(false);
    }
  });

  it("serves the canonical resource on the site and the legacy resource on its old host", () => {
    expect(resolveMcpMount(env, "nextlevelbuilder.io")).toEqual({
      apiBaseUrl: "https://nextlevelbuilder.io",
      resource: "https://nextlevelbuilder.io/mcp",
      acceptedAudiences: ["https://mcp.nextlevelbuilder.io/mcp"],
      delegationIssuer: "https://nextlevelbuilder.io/mcp",
    });
    expect(resolveMcpMount(env, "mcp.nextlevelbuilder.io")).toEqual({
      apiBaseUrl: "https://nextlevelbuilder.io",
      resource: "https://mcp.nextlevelbuilder.io/mcp",
      acceptedAudiences: ["https://nextlevelbuilder.io/mcp"],
      delegationIssuer: "https://nextlevelbuilder.io/mcp",
    });
    expect(resolveMcpMount({ ...env, BETTER_AUTH_URL: undefined, NEXT_PUBLIC_APP_URL: undefined }, "nextlevelbuilder.io")).toBeNull();
  });

  it("falls through to Next.js for other paths and publishes protected-resource metadata", async () => {
    const site = vi.fn(async () => new Response("next"));
    expect(await serveMcp(new Request("https://nextlevelbuilder.io/blog"), env, site)).toBeNull();

    const prm = await serveMcp(new Request("https://nextlevelbuilder.io/.well-known/oauth-protected-resource/mcp"), env, site);
    expect(prm?.status).toBe(200);
    const metadata = await prm!.json();
    expect(metadata.resource).toBe("https://nextlevelbuilder.io/mcp");
    expect(metadata.authorization_servers).toEqual(["https://nextlevelbuilder.io/api/auth"]);
    expect(metadata.scopes_supported).not.toContain("offline_access");

    const legacy = await serveMcp(new Request("https://mcp.nextlevelbuilder.io/.well-known/oauth-protected-resource/mcp"), env, site);
    expect((await legacy!.json()).resource).toBe("https://mcp.nextlevelbuilder.io/mcp");
  });

  it("challenges an unauthenticated private tool call with the resource metadata URL", async () => {
    const site = vi.fn(async () => new Response("next"));
    const response = await serveMcp(new Request("https://nextlevelbuilder.io/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_api_keys", arguments: {} } }),
    }), env, site);
    expect(response?.status).toBe(401);
    expect(response?.headers.get("www-authenticate")).toContain("resource_metadata=\"https://nextlevelbuilder.io/.well-known/oauth-protected-resource/mcp\"");
  });
});
