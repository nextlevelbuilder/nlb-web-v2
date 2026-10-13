import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => vi.fn());
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context }));

const workerConfig = {
  CLICKHOUSE_URL: "https://worker-storage.test",
  CLICKHOUSE_DATABASE: "worker_traffic",
  CLICKHOUSE_USER: "worker-reader",
  CLICKHOUSE_PASSWORD: "worker-storage-secret",
  TRAFFIC_HASH_SECRET: "worker-hash-secret-at-least-thirty-two-characters",
  POSTHOG_HOST: "https://worker-posthog.test",
  POSTHOG_API_KEY: "worker-query-secret",
  POSTHOG_PROJECT_ID: "42",
  NEXT_PUBLIC_POSTHOG_HOST: "https://worker-capture.test",
  NEXT_PUBLIC_POSTHOG_KEY: "worker-public-token",
};
const nodeConfig = {
  CLICKHOUSE_URL: "https://node-storage.test",
  CLICKHOUSE_DATABASE: "node_traffic",
  CLICKHOUSE_USER: "node-reader",
  CLICKHOUSE_PASSWORD: "node-storage-secret",
  TRAFFIC_HASH_SECRET: "node-hash-secret-at-least-thirty-two-characters",
  POSTHOG_HOST: "https://node-posthog.test",
  POSTHOG_API_KEY: "node-query-secret",
  POSTHOG_PROJECT_ID: "99",
  NEXT_PUBLIC_POSTHOG_HOST: "https://node-capture.test",
  NEXT_PUBLIC_POSTHOG_KEY: "node-public-token",
};
const visitorId = "bafef428-145b-4f0d-ad29-e89672734938";
const now = new Date("2026-09-12T08:00:00.000Z");
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules(); context.mockReset(); fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  for (const [key, value] of Object.entries(nodeConfig)) vi.stubEnv(key, value);
  context.mockReturnValue({ env: { ...workerConfig } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("traffic configuration in Workers and local Node", () => {
  it("prefers Worker bindings and resolves fresh context on each call", async () => {
    const { trafficConfig } = await import("@/lib/traffic/config");
    expect(trafficConfig()).toEqual(workerConfig);
    context.mockReturnValue({ env: { CLICKHOUSE_DATABASE: "another_request" } });
    expect(trafficConfig()).toEqual({ CLICKHOUSE_DATABASE: "another_request" });
    expect(trafficConfig()).not.toHaveProperty("CLICKHOUSE_PASSWORD");
  });

  it("does not merge Node settings into an existing empty Worker env", async () => {
    const { trafficConfig } = await import("@/lib/traffic/config");
    context.mockReturnValue({ env: {} });
    expect(trafficConfig()).toEqual({});
  });

  it.each(["absent", "throws"])("uses Node environment only when Worker context is %s", async (mode) => {
    if (mode === "throws") context.mockImplementation(() => { throw new Error("No Worker request context"); });
    else context.mockReturnValue(undefined);
    const { trafficConfig } = await import("@/lib/traffic/config");
    expect(trafficConfig()).toMatchObject(nodeConfig);
  });

  it.each(["worker", "node"])("uses %s configuration through the actual storage, hash and PostHog helpers", async (runtime) => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const config = runtime === "worker" ? workerConfig : nodeConfig;
    if (runtime === "node") context.mockImplementation(() => { throw new Error("No Worker request context"); });
    const { clickhouseQuery } = await import("@/lib/traffic/clickhouse");
    const { visitorHash } = await import("@/lib/traffic/traffic");
    const { captureSitePageview, realtimeTraffic } = await import("@/lib/traffic/posthog");

    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ count: "7" }] }));
    expect(await clickhouseQuery("SELECT count() AS count FROM traffic_events FORMAT JSON")).toEqual([{ count: "7" }]);
    const [storageUrl, storageInit] = fetchMock.mock.calls[0];
    expect(new URL(String(storageUrl)).origin).toBe(config.CLICKHOUSE_URL);
    expect(new URL(String(storageUrl)).searchParams.get("database")).toBe(config.CLICKHOUSE_DATABASE);
    expect(storageInit?.headers).toEqual({ "X-ClickHouse-User": config.CLICKHOUSE_USER, "X-ClickHouse-Key": config.CLICKHOUSE_PASSWORD });

    const expectedHash = (productId: string) => createHmac("sha256", config.TRAFFIC_HASH_SECRET).update(`2026-09-12:${productId}:${visitorId}`).digest("hex");
    expect(visitorHash(visitorId, "product-a", now)).toBe(expectedHash("product-a"));

    fetchMock.mockResolvedValueOnce(new Response(""));
    await captureSitePageview({ visitorId, path: "/products/product-a" });
    const [captureUrl, captureInit] = fetchMock.mock.calls[1];
    expect(String(captureUrl)).toBe(`${config.NEXT_PUBLIC_POSTHOG_HOST}/i/v0/e/`);
    expect(JSON.parse(String(captureInit?.body))).toMatchObject({ api_key: config.NEXT_PUBLIC_POSTHOG_KEY, properties: { distinct_id: expectedHash("site"), $pathname: "/products/product-a" } });

    fetchMock.mockResolvedValueOnce(Response.json({ results: [[2, 20, 10]] }));
    expect(await realtimeTraffic()).toMatchObject({ activeVisitors: 2, pageViews30d: 20, visitors30d: 10 });
    const [queryUrl, queryInit] = fetchMock.mock.calls[2];
    expect(String(queryUrl)).toBe(`${config.POSTHOG_HOST}/api/projects/${config.POSTHOG_PROJECT_ID}/query/`);
    expect(new Headers(queryInit?.headers).get("authorization")).toBe(`Bearer ${config.POSTHOG_API_KEY}`);
  });

  it("fails closed in actual helpers when Worker bindings are missing despite complete Node settings", async () => {
    context.mockReturnValue({ env: {} });
    const { clickhouseQuery } = await import("@/lib/traffic/clickhouse");
    const { visitorHash } = await import("@/lib/traffic/traffic");
    const { captureSitePageview, realtimeTraffic } = await import("@/lib/traffic/posthog");
    await expect(clickhouseQuery("SELECT 1")).rejects.toThrow("Traffic storage is not configured");
    expect(() => visitorHash(visitorId, "product-a", now)).toThrow("Traffic hashing is not configured");
    await expect(captureSitePageview({ visitorId, path: "/" })).rejects.toThrow("PostHog capture is not configured");
    await expect(realtimeTraffic()).rejects.toThrow("PostHog query is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not substitute Node secrets for individually missing Worker secrets", async () => {
    const partial: Partial<typeof workerConfig> = { ...workerConfig };
    delete partial.CLICKHOUSE_PASSWORD; delete partial.TRAFFIC_HASH_SECRET; delete partial.POSTHOG_API_KEY;
    context.mockReturnValue({ env: partial });
    const { clickhouseQuery } = await import("@/lib/traffic/clickhouse");
    const { visitorHash } = await import("@/lib/traffic/traffic");
    const { captureSitePageview, realtimeTraffic } = await import("@/lib/traffic/posthog");
    await expect(clickhouseQuery("SELECT 1")).rejects.toThrow("Traffic storage is not configured");
    expect(() => visitorHash(visitorId, "product-a", now)).toThrow("Traffic hashing is not configured");
    await expect(captureSitePageview({ visitorId, path: "/" })).rejects.toThrow("Traffic hashing is not configured");
    await expect(realtimeTraffic()).rejects.toThrow("PostHog query is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
