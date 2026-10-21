import { describe, it, expect } from "vitest";
import { handleWorkerFetch } from "../src/transports/worker.js";
import { BASE, callTool, legacyRequest, modernRequest, rpc } from "./helpers.js";

describe("MCP standalone Worker transport", () => {
  it("responds to /health and GET /", async () => {
    for (const path of ["/health", "/"]) {
      const res = await handleWorkerFetch(new Request(`${BASE}${path}`));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toMatchObject({ status: "ok", service: "nlb-directory-mcp" });
      expect(data.toolsCount).toBeGreaterThanOrEqual(6);
    }
  });

  it("handles CORS preflight with the MCP headers", async () => {
    const res = await handleWorkerFetch(new Request(`${BASE}/mcp`, { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    for (const header of ["MCP-Protocol-Version", "Mcp-Method", "Mcp-Name", "Authorization"]) {
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(header);
    }
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("WWW-Authenticate");
  });

  it("keeps JSON-only clients working: plain JSON answer, no session id", async () => {
    const res = await handleWorkerFetch(new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "worker-1", method: "initialize", params: {
        protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "json-only", version: "1" }
      } })
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = await res.json();
    expect(data.id).toBe("worker-1");
    expect(data.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "nlb-directory-mcp" } });
    expect(res.headers.has("Mcp-Session-Id")).toBe(false);
  });

  it("serves POST / as an alias of POST /mcp", async () => {
    const { status, body } = await rpc(modernRequest("tools/list", {}, {}, `${BASE}/`));
    expect(status).toBe(200);
    expect(Array.isArray(body.result!.tools)).toBe(true);
  });

  it.each(["GET", "DELETE", "PUT"])("returns 405 for %s on the stateless endpoint", async (method) => {
    const res = await handleWorkerFetch(new Request(`${BASE}/mcp`, { method }));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it.each([
    [{ "Content-Type": "text/plain" }, "{}", 415],
    [{ "Content-Type": "application/json", "MCP-Protocol-Version": "invalid" }, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), 400],
    [{ "Content-Type": "application/json" }, "not json", 400]
  ])("rejects invalid HTTP requests (%o)", async (headers, body, status) => {
    const res = await handleWorkerFetch(new Request(`${BASE}/mcp`, {
      method: "POST", headers: { Accept: "application/json, text/event-stream", ...headers } as Record<string, string>, body
    }));
    expect(res.status).toBe(status);
  });

  it("rejects untrusted browser origins and allows configured, resource and loopback origins", async () => {
    const request = (origin: string) => new Request(`${BASE}/mcp`, { method: "OPTIONS", headers: { Origin: origin } });
    expect((await handleWorkerFetch(request("https://client.example"))).status).toBe(403);
    expect((await handleWorkerFetch(request("null"))).status).toBe(403);
    const res = await handleWorkerFetch(request("https://client.example"), { NLB_ALLOWED_ORIGINS: "https://client.example" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://client.example");
    expect(res.headers.get("Vary")).toBe("Origin");
    expect((await handleWorkerFetch(request("http://localhost:6274"))).status).toBe(204);
  });

  it("rejects foreign Host headers (DNS rebinding) but serves resource, workers.dev and loopback hosts", async () => {
    const at = (url: string) => modernRequest("tools/list", {}, {}, url);
    expect((await handleWorkerFetch(at("https://attacker.example/mcp"))).status).toBe(403);
    expect((await handleWorkerFetch(at("https://nlb-directory-mcp.example.workers.dev/mcp"))).status).toBe(200);
    expect((await handleWorkerFetch(at("http://localhost:8787/mcp"))).status).toBe(200);
    expect((await handleWorkerFetch(at("https://mcp-staging.nextlevelbuilder.io/mcp"),
      { NLB_OAUTH_RESOURCE: "https://mcp-staging.nextlevelbuilder.io/mcp" })).status).toBe(200);
  });

  it("keeps mutation authorization isolated between HTTP requests", async () => {
    const env = { WORKER_AUTH_TOKEN: "test-worker-token" };
    const authorized = await callTool("submit_product", {}, env, { Authorization: `Bearer ${env.WORKER_AUTH_TOKEN}` });
    expect(authorized.body.error).toBeUndefined();
    // Missing document fails validation, without making a remote mutation.
    expect(authorized.isError).toBe(true);
    expect(String(authorized.payload)).not.toContain("Unauthorized");
    for (const headers of [{}, { Authorization: "Bearer wrong-token" }] as Array<Record<string, string>>) {
      const denied = await callTool("submit_product", {}, env, headers);
      expect(denied.isError).toBe(true);
      expect(denied.payload.error).toContain("Unauthorized");
    }
  });

  it("returns 404 for unknown paths", async () => {
    expect((await handleWorkerFetch(new Request(`${BASE}/nope`))).status).toBe(404);
  });

  describe("deprecated HTTP+SSE bridge", () => {
    async function openSession() {
      const res = await handleWorkerFetch(new Request(`${BASE}/sse`));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      const reader = res.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toContain("event: endpoint");
      const endpoint = /data: (\/message\?sessionId=[a-f0-9-]+)/.exec(first)![1];
      return { reader, endpoint };
    }

    async function post(endpoint: string, message: unknown, headers: Record<string, string> = {}) {
      return handleWorkerFetch(new Request(`${BASE}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(message)
      }));
    }

    it("bridges a 2024-11-05 session: initialize, ping and tools/call answered on the stream", async () => {
      const { reader, endpoint } = await openSession();
      const next = async () => new TextDecoder().decode((await reader.read()).value);

      const init = await post(endpoint, { jsonrpc: "2.0", id: "init", method: "initialize", params: {
        protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "sse", version: "1" }
      } });
      expect(init.status).toBe(202);
      const initEvent = await next();
      expect(initEvent).toContain("event: message");
      expect(JSON.parse(initEvent.split("data: ")[1]).result.protocolVersion).toBe("2024-11-05");

      expect((await post(endpoint, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);

      expect((await post(endpoint, { jsonrpc: "2.0", id: "sse-msg-1", method: "ping" })).status).toBe(202);
      expect(await next()).toContain("sse-msg-1");

      await post(endpoint, { jsonrpc: "2.0", id: "call", method: "tools/call", params: { name: "list_templates", arguments: {} } });
      const callEvent = JSON.parse((await next()).split("data: ")[1]);
      expect(JSON.parse(callEvent.result.content[0].text).templates).toHaveLength(5);
      await reader.cancel();
    });

    it("rejects unknown sessions and malformed posts on the POST itself", async () => {
      expect((await post("/message?sessionId=missing", { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(400);
      const { reader, endpoint } = await openSession();
      const bad = await handleWorkerFetch(new Request(`${BASE}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "not json"
      }));
      expect(bad.status).toBe(400);
      await reader.cancel();
    });
  });

  it("serves a legacy 2025-11-25 tools/call without Accept negotiation issues", async () => {
    const { body } = await rpc(legacyRequest("tools/call", { name: "list_templates", arguments: {} }));
    expect(body.result!.isError).toBe(false);
  });
});
