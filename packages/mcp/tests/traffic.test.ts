import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { TOOLS } from "../src/tools/index.js";
import { callTool, modernRequest, rpc } from "./helpers.js";

const response = { data: {
  source: "clickhouse", from: "2026-08-01T00:00:00Z", to: "2026-08-31T00:00:00Z",
  updatedAt: "2026-08-31T00:00:00Z", pageViews: 12, visitors: 8, outboundClicks: 3, activeVisitors: 1,
  series: [{ date: "2026-08-01", pageViews: 12, visitors: 8, outboundClicks: 3 }],
  referrers: [{ name: "example.com", count: 4 }], countries: [{ name: "VN", count: 8 }], devices: [{ name: "desktop", count: 8 }]
} };
const tool = TOOLS.find((t) => t.name === "get_product_traffic")!;
const WORKER = { WORKER_AUTH_TOKEN: "worker-test", NLB_API_KEY: "nlb_live_server" };
const AUTH = { Authorization: "Bearer worker-test" };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("MCP product traffic", () => {
  it("advertises traffic with explicit product and range inputs", async () => {
    const { body } = await rpc(modernRequest("tools/list"));
    const listed = (body.result!.tools as Array<{ name: string; description: string; inputSchema: { required: string[]; properties: object } }>)
      .find((t) => t.name === "get_product_traffic")!;
    expect(listed.inputSchema.required).toEqual(["slug"]);
    expect(listed.inputSchema.properties).toHaveProperty("from");
    expect(listed.description).toContain("reset each UTC day");
  });

  it("reuses configured key and URL, encodes inputs, and returns validated traffic", async () => {
    const fetchFn = vi.fn(async () => Response.json(response));
    vi.stubGlobal("fetch", fetchFn);
    expect(await tool.handler({ slug: "a/b", from: response.data.from, to: response.data.to }, { workerAuth: true, env: { NLB_API_KEY: "nlb_live_test", NLB_API_URL: "https://staging.nextlevelbuilder.io" } })).toEqual(response);
    const [rawUrl, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.origin).toBe("https://staging.nextlevelbuilder.io");
    expect(url.pathname).toBe("/api/v1/products/a%2Fb/traffic");
    expect(url.searchParams.get("to")).toBe(response.data.to);
    expect(init.headers).toMatchObject({ Authorization: "Bearer nlb_live_test" });
  });

  it("blocks anonymous Worker callers before using the configured server key", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const { isError, payload } = await callTool("get_product_traffic", { slug: "product" }, { NLB_API_KEY: "nlb_live_server" });
    expect(isError).toBe(true);
    expect(payload.error).toContain("Unauthorized");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("allows authenticated Worker callers with configured credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response)));
    const { isError, payload, body } = await callTool("get_product_traffic", { slug: "product" }, WORKER, AUTH);
    expect(isError).toBe(false);
    expect(payload).toEqual(response);
    expect(body.result!.structuredContent).toEqual(response);
  });

  it("enforces the existing endpoint allowlist and rejects invalid ranges before fetching", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    await expect(tool.handler({ slug: "product", api_url: "https://untrusted.example" })).rejects.toThrow("disallowed");
    await expect(tool.handler({ slug: "product", from: "2026-01-01T00:00:00Z", to: "2026-08-31T00:00:00Z" })).rejects.toThrow("90 days");
    await expect(tool.handler({ slug: "product", from: 123 })).rejects.toThrow();
    await expect(tool.handler({ slug: "product", to: "2026-09-01T00:00:00.001Z" })).rejects.toThrow("future");
    expect((await callTool("get_product_traffic", { slug: "product", from: 123 }, WORKER, AUTH)).isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns explicit errors for unavailable data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Unavailable" }, { status: 503 })));
    const { isError, body } = await callTool("get_product_traffic", { slug: "product" }, WORKER, AUTH);
    expect(isError).toBe(true);
    expect(JSON.stringify(body)).toContain("503");
  });
});
