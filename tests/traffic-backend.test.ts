import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickhouseQuery } from "@/lib/traffic/clickhouse";
import { allowTrafficRequest, readTrafficBody } from "@/lib/traffic/collection";
import { deviceCategory, publicTraffic, publicTrafficRange, queryTraffic, recordTraffic, referrerHost, trafficRange, visitorHash } from "@/lib/traffic/traffic";
import { TrafficEventSchema } from "@/packages/contracts/src";

const now = new Date("2026-09-12T08:00:00.000Z");
const range = { from: "2026-09-10T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z" };
const visitorId = "bafef428-145b-4f0d-ad29-e89672734938";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("CLICKHOUSE_URL", "https://traffic.example.test");
  vi.stubEnv("CLICKHOUSE_USER", "traffic-reader");
  vi.stubEnv("CLICKHOUSE_PASSWORD", "private-storage-password");
  vi.stubEnv("CLICKHOUSE_DATABASE", "nlb_traffic");
  vi.stubEnv("TRAFFIC_HASH_SECRET", "a-test-secret-at-least-thirty-two-characters");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("traffic dates and privacy", () => {
  it("defaults to the previous 30 days and normalizes offset ISO dates", () => {
    expect(trafficRange(new URLSearchParams(), now)).toEqual({ from: "2026-08-13T08:00:00.000Z", to: now.toISOString() });
    expect(trafficRange(new URLSearchParams({ from: "2026-09-10T07:00:00+07:00", to: range.to }), now)).toEqual(range);
    expect(publicTrafficRange("90d", now)).toEqual({ from: "2026-06-14T08:00:00.000Z", to: now.toISOString() });
  });

  it.each<Record<string, string>>([
    { from: "2026-09-12", to: range.to },
    { from: "2026-09-12T08:00:00Z", to: "2026-09-12T08:00:01Z" },
    { from: range.to, to: range.from },
    { from: range.to, to: range.to },
    { from: "2026-06-14T07:59:59Z", to: now.toISOString() },
    { from: "not-a-date", to: range.to },
  ])("rejects invalid, unordered, future or overlong ranges: %j", (values) => {
    expect(() => trafficRange(new URLSearchParams(values), now)).toThrow();
  });

  it("accepts exactly 90 days and rejects unsupported public periods", () => {
    expect(trafficRange(new URLSearchParams(publicTrafficRange("90d", now)), now)).toEqual(publicTrafficRange("90d", now));
    expect(() => publicTrafficRange("365d", now)).toThrow();
  });

  it("stores only a referrer host, never credentials, paths or queries", () => {
    expect(referrerHost("https://user:password@Example.COM/private?token=secret#fragment")).toBe("example.com");
    for (const value of [undefined, "invalid", "javascript:alert(1)", "file:///private", "data:text/plain,secret"]) expect(referrerHost(value)).toBe("");
  });

  it("rotates pseudonymous visitor hashes by UTC day and product", () => {
    const hash = visitorHash(visitorId, "product-a", now);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(visitorId);
    expect(visitorHash(visitorId, "product-a", new Date("2026-09-12T23:59:59Z"))).toBe(hash);
    expect(visitorHash(visitorId, "product-b", now)).not.toBe(hash);
    expect(visitorHash(visitorId, "product-a", new Date("2026-09-13T00:00:00Z"))).not.toBe(hash);
    vi.stubEnv("TRAFFIC_HASH_SECRET", "short");
    expect(() => visitorHash(visitorId, "product-a", now)).toThrow("Traffic hashing is not configured");
  });

  it("reduces user agents to broad categories", () => {
    expect(deviceCategory("Mozilla iPad Safari")).toBe("tablet");
    expect(deviceCategory("Mozilla Android Mobile")).toBe("mobile");
    expect(deviceCategory("Mozilla Windows Chrome")).toBe("desktop");
  });
});

describe("traffic collection boundaries", () => {
  function request(headers: Record<string, string> = {}) {
    return new Request("https://directory.test/api/traffic", { headers: { origin: "https://directory.test", "user-agent": "Mozilla Chrome", ...headers } });
  }

  it.each<Record<string, string>>([
    { origin: "https://attacker.test" }, { origin: "" }, { "sec-fetch-site": "cross-site" },
    { dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Googlebot" }, { "user-agent": "HeadlessChrome" },
  ])("silently excludes forbidden origins, privacy opt-outs and bots: %j", (headers) => {
    expect(allowTrafficRequest(request(headers), crypto.randomUUID(), 1000)).toBe(false);
  });

  it("limits repeated events without suppressing a different visitor", () => {
    const identity = crypto.randomUUID();
    expect(allowTrafficRequest(request(), identity, 1000)).toBe(true);
    expect(allowTrafficRequest(request(), identity, 1999)).toBe(false);
    expect(allowTrafficRequest(request(), identity, 2000)).toBe(true);
    expect(allowTrafficRequest(request(), crypto.randomUUID(), 1001)).toBe(true);
  });

  it("caps bytes even when Content-Length understates the payload", async () => {
    const oversized = new Request("https://directory.test/api/traffic", {
      method: "POST", headers: { "content-type": "application/json", "content-length": "2" }, body: JSON.stringify({ value: "é".repeat(2100) }),
    });
    await expect(readTrafficBody(oversized)).rejects.toThrow("Traffic payload too large");
    await expect(readTrafficBody(new Request("https://directory.test", { method: "POST", body: "{}" }))).rejects.toThrow("Expected JSON");
  });

  it("rejects server-owned fields, malformed IDs and productless outbound clicks", () => {
    const valid = { event: "page_view", visitorId, productSlug: "example-product" };
    expect(TrafficEventSchema.safeParse(valid).success).toBe(true);
    for (const body of [{ ...valid, country: "US" }, { ...valid, productId: "other-product" }, { ...valid, visitorId: "raw-ip-address" }, { ...valid, event: "purchase" }, { event: "outbound_click", visitorId }]) {
      expect(TrafficEventSchema.safeParse(body).success).toBe(false);
    }
  });

  it("inserts sanitized server-derived events without raw visitor or network data", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    fetchMock.mockResolvedValue(new Response(""));
    await recordTraffic({ productId: "product-a", visitorId, event: "outbound_click", referrer: "https://search.test/private?token=secret" }, new Request("https://directory.test/api/traffic", { headers: { "cf-ipcountry": "VN", "cf-connecting-ip": "198.51.100.2", "user-agent": "iPhone Mobile" } }));
    const [url, init] = fetchMock.mock.calls[0];
    const sql = String(init?.body);
    const row = JSON.parse(sql.slice(sql.indexOf("\n") + 1));
    expect(row).toMatchObject({ product_id: "product-a", event: "outbound_click", occurred_at: now.toISOString(), country: "VN", device: "mobile", referrer_host: "search.test" });
    expect(row.visitor_hash).toBe(visitorHash(visitorId, "product-a", now));
    expect(sql).not.toContain(visitorId); expect(sql).not.toContain("198.51.100.2"); expect(sql).not.toContain("token=secret");
    expect(new URL(String(url)).searchParams.get("wait_for_async_insert")).toBe("1");
  });
});

describe("ClickHouse aggregate queries", () => {
  function results() {
    fetchMock.mockImplementation(async (_url, init) => {
      const sql = String(init?.body);
      const data = sql.includes("GROUP BY date") ? [{ date: "2026-09-10", pageViews: "8", visitors: "5", outboundClicks: "2" }]
        : sql.includes("AS activeVisitors") ? [{ activeVisitors: "3" }]
        : sql.includes("GROUP BY name") ? [{ name: "", count: "8" }]
        : [{ pageViews: "8", visitors: "5", outboundClicks: "2" }];
      return Response.json({ data });
    });
  }

  it("keeps identifiers as typed parameters, converts counts and fills missing days", async () => {
    results();
    const productId = "product' OR 1=1 --";
    const result = await queryTraffic(productId, range);
    expect(result).toMatchObject({ pageViews: 8, visitors: 5, outboundClicks: 2, activeVisitors: 3, referrers: [{ name: "Unknown", count: 8 }] });
    expect(result.series).toEqual([{ date: "2026-09-10", pageViews: 8, visitors: 5, outboundClicks: 2 }, { date: "2026-09-11", pageViews: 0, visitors: 0, outboundClicks: 0 }]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    for (const [url, init] of fetchMock.mock.calls) {
      const target = new URL(String(url));
      expect(target.searchParams.get("param_productId")).toBe(productId);
      expect(target.searchParams.get("readonly")).toBe("1");
      expect(target.searchParams.get("max_rows_to_read")).toBe("2000000");
      expect(init?.body).toContain("{productId:String}"); expect(init?.body).not.toContain(productId);
      expect(init?.redirect).toBe("manual");
      if (target.searchParams.has("param_from")) {
        expect(target.searchParams.get("param_from")).toBe(range.from);
        expect(init?.body).toContain("{from:String}"); expect(init?.body).toContain("{to:String}");
      }
    }
  });

  it("does not request or expose public breakdowns", async () => {
    results();
    const summary = await queryTraffic("product-a", range, false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => !String(init?.body).includes("GROUP BY name"))).toBe(true);
    expect(publicTraffic({ ...summary, referrers: [{ name: "private.test", count: 1 }], countries: [{ name: "VN", count: 1 }], devices: [{ name: "mobile", count: 1 }] })).not.toHaveProperty("referrers");
    expect(publicTraffic(summary)).not.toHaveProperty("countries"); expect(publicTraffic(summary)).not.toHaveProperty("devices");
  });

  it.each(["NaN", "", " ", null, true, -1, 1.5])("rejects malformed aggregate counts instead of publishing invented values: %j", async (pageViews) => {
    fetchMock.mockImplementation(async (_url, init) => Response.json({ data: String(init?.body).includes("AS activeVisitors") ? [{ activeVisitors: 0 }] : String(init?.body).includes("GROUP BY date") ? [] : [{ pageViews, visitors: 1, outboundClicks: 0 }] }));
    await expect(queryTraffic("product-a", range, false)).rejects.toThrow();
  });

  it.each(["daily series", "active visitors", "breakdowns"])("validates counts in %s", async (surface) => {
    fetchMock.mockImplementation(async (_url, init) => {
      const sql = String(init?.body);
      const data = sql.includes("GROUP BY date") ? [{ date: "2026-09-10", pageViews: surface === "daily series" ? "" : "8", visitors: "5", outboundClicks: "2" }]
        : sql.includes("AS activeVisitors") ? [{ activeVisitors: surface === "active visitors" ? "" : "3" }]
        : sql.includes("GROUP BY name") ? [{ name: "example.test", count: surface === "breakdowns" ? "" : "8" }]
        : [{ pageViews: "8", visitors: "5", outboundClicks: "2" }];
      return Response.json({ data });
    });
    await expect(queryTraffic("product-a", range)).rejects.toThrow();
  });

  it("rejects database errors and invalid JSON envelopes without returning upstream secrets", async () => {
    fetchMock.mockResolvedValueOnce(new Response("private-storage-password SQL server details", { status: 500 }));
    await expect(clickhouseQuery("SELECT 1")).rejects.toThrow("Traffic storage request failed");
    fetchMock.mockResolvedValueOnce(Response.json({ error: "private-storage-password" }));
    await expect(clickhouseQuery("SELECT 1")).rejects.toThrow("Invalid traffic storage response");
  });

  it.each([301, 302, 307, 308])("rejects storage redirects for reads and writes (%i)", async (status) => {
    fetchMock.mockImplementation(async () => new Response(null, {status, headers: {Location: "https://other.test/"}}));
    await expect(clickhouseQuery("SELECT 1")).rejects.toThrow("Traffic storage request failed");
    await expect(clickhouseQuery("INSERT INTO traffic_events FORMAT JSONEachRow\n", {}, true)).rejects.toThrow("Traffic storage request failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) expect(options?.redirect).toBe("manual");
  });

  it.each(["http://remote.test", "https://user:password@traffic.test"]) ("rejects unsafe storage transport %s", async (url) => {
    vi.stubEnv("CLICKHOUSE_URL", url);
    await expect(clickhouseQuery("SELECT 1")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
