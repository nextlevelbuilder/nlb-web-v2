import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { SERVER_VERSION } from "../src/server.js";
import { TOOLS } from "../src/tools/index.js";
import { BASE, LEGACY, MODERN, legacyRequest, modernRequest, rpc } from "./helpers.js";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

describe("MCP server over SDK v2", () => {
  it("reports the package version", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
  });

  describe(`${MODERN} (stateless) clients`, () => {
    it("answers server/discover with server info and tool capability", async () => {
      const { status, body } = await rpc(modernRequest("server/discover"));
      expect(status).toBe(200);
      expect(body.error).toBeUndefined();
      expect(JSON.stringify(body.result)).toContain("nlb-directory-mcp");
      expect(JSON.stringify(body.result)).toContain(MODERN);
    });

    it("lists every registered tool in registry order with annotations", async () => {
      const { body } = await rpc(modernRequest("tools/list"));
      const tools = body.result!.tools as Array<{ name: string; inputSchema: { type: string }; annotations?: Record<string, boolean> }>;
      expect(tools.map((tool) => tool.name)).toEqual(TOOLS.map((tool) => tool.name));
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      expect(byName.list_products.annotations).toMatchObject({ readOnlyHint: true });
      expect(byName.submit_product.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
      expect(byName.revoke_api_key.annotations).toMatchObject({ destructiveHint: true });
      expect(byName.blog_archive_post.annotations).toMatchObject({ destructiveHint: true });
      expect(byName.get_product_traffic.inputSchema).toMatchObject({ type: "object", required: ["slug"] });
    });

    it("calls a tool and returns JSON text plus structuredContent", async () => {
      const { status, body } = await rpc(modernRequest("tools/call", { name: "list_templates", arguments: {} }));
      expect(status).toBe(200);
      expect(body.result!.isError).toBe(false);
      const parsed = JSON.parse(body.result!.content![0].text);
      expect(parsed.templates).toHaveLength(5);
      expect(body.result!.structuredContent).toEqual(parsed);
    });

    it("returns an error for an unknown tool", async () => {
      const { body } = await rpc(modernRequest("tools/call", { name: "no_such_tool", arguments: {} }));
      expect(body.error?.code ?? (body.result?.isError ? 0 : undefined)).toBeDefined();
    });
  });

  describe(`${LEGACY} clients`, () => {
    it("completes initialize, tools/list and tools/call", async () => {
      const init = await rpc(legacyRequest("initialize", {
        protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "legacy", version: "1.0.0" }
      }, {}, undefined));
      expect(init.status).toBe(200);
      expect(init.body.result).toMatchObject({ protocolVersion: LEGACY, serverInfo: { name: "nlb-directory-mcp", version: SERVER_VERSION } });

      const list = await rpc(legacyRequest("tools/list"));
      expect((list.body.result!.tools as unknown[]).length).toBe(TOOLS.length);

      const call = await rpc(legacyRequest("tools/call", { name: "list_templates", arguments: { template_name: "developer-cli" } }));
      const parsed = JSON.parse(call.body.result!.content![0].text);
      expect(parsed.template.slug).toBe("dev-tool");
    });

    it.each(["2025-06-18", "2025-03-26", "2024-11-05"])("negotiates %s", async (protocolVersion) => {
      const { body } = await rpc(legacyRequest("initialize", {
        protocolVersion, capabilities: {}, clientInfo: { name: "legacy", version: "1.0.0" }
      }, {}, undefined));
      expect(body.result).toMatchObject({ protocolVersion });
    });

    it("answers ping and acknowledges notifications without a body", async () => {
      expect((await rpc(legacyRequest("ping"))).body.result).toEqual({});
      const notification = await fetchWorker(new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": LEGACY },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
      }));
      expect(notification.status).toBe(202);
      expect(await notification.text()).toBe("");
    });
  });
});

async function fetchWorker(request: Request) {
  const { handleWorkerFetch } = await import("../src/transports/worker.js");
  return handleWorkerFetch(request);
}
