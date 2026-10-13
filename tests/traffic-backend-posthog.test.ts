import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.resetModules(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("POSTHOG_HOST", "https://posthog.test");
  vi.stubEnv("POSTHOG_API_KEY", "private-query-key");
  vi.stubEnv("POSTHOG_PROJECT_ID", "42");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://capture.test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "public-capture-key");
  vi.stubEnv("TRAFFIC_HASH_SECRET", "a-test-secret-at-least-thirty-two-characters");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Build with Us PostHog integration", () => {
  it("captures only the fixed page event with a hashed identifier and no person profile", async () => {
    const { captureSitePageview } = await import("@/lib/traffic/posthog");
    fetchMock.mockResolvedValue(new Response(""));
    const visitorId = "bafef428-145b-4f0d-ad29-e89672734938";
    await captureSitePageview({ visitorId, path: "/pricing" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://capture.test/i/v0/e/");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ api_key: "public-capture-key", event: "$pageview", properties: { $pathname: "/pricing", nlb_surface: "site", $process_person_profile: false } });
    expect(body.properties.distinct_id).toMatch(/^[a-f0-9]{64}$/);
    expect(String(init?.body)).not.toContain(visitorId); expect(String(init?.body)).not.toContain("private-query-key");
    expect(init?.redirect).toBe("manual");
  });

  it("uses a fixed bounded query, converts counts and deduplicates concurrent reads", async () => {
    const { realtimeTraffic } = await import("@/lib/traffic/posthog");
    fetchMock.mockResolvedValue(Response.json({ results: [["2", "18", "11"]] }));
    const [a, b] = await Promise.all([realtimeTraffic(), realtimeTraffic()]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ source: "posthog", activeVisitors: 2, pageViews30d: 18, visitors30d: 11, windowMinutes: 5, windowDays: 30 });
    await realtimeTraffic(); expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://posthog.test/api/projects/42/query/");
    const body = JSON.parse(String(init?.body));
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.refresh).toBe("force_blocking");
    expect(body.query.query).toContain("event = '$pageview'");
    expect(body.query.query).toContain("(properties.nlb_surface = 'site' OR properties.nlb_surface = 'build-with-us')");
    expect(body.query.query).toContain("INTERVAL 5 MINUTE");
    expect(body.query.query).toContain("INTERVAL 30 DAY");
    expect(body.query.query).toContain("timestamp <= now()");
    expect(body.query.query).not.toContain("INTERVAL 1 DAY");
    expect(body.query.query).not.toContain("toStartOfDay");
    expect(init?.redirect).toBe("manual");
  });

  it.each([301, 302, 307, 308])("rejects provider redirects without forwarding credentials (%i)", async (status) => {
    const { realtimeTraffic, captureSitePageview } = await import("@/lib/traffic/posthog");
    fetchMock.mockImplementation(async () => new Response(null, {status, headers: {Location: "https://other.test/"}}));
    await expect(realtimeTraffic()).rejects.toThrow(`PostHog query failed (HTTP ${status})`);
    await expect(captureSitePageview({ visitorId: "bafef428-145b-4f0d-ad29-e89672734938", path: "/" })).rejects.toThrow("PostHog capture failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) expect(options?.redirect).toBe("manual");
  });

  it.each([[], [[1, 2]], [[1, 2, 3, 4]], [[null, 2, 3]], [["", 2, 3]], [[" ", 2, 3]], [[true, 2, 3]], [["NaN", 2, 3]], [[-1, 2, 3]], [[1.5, 2, 3]]].map((results) => ({ results })))("rejects malformed aggregates: %j", async ({ results }) => {
    const { realtimeTraffic } = await import("@/lib/traffic/posthog");
    fetchMock.mockResolvedValue(Response.json({ results }));
    await expect(realtimeTraffic()).rejects.toThrow();
  });

  it("does not cache failed queries and hides upstream response content", async () => {
    const { realtimeTraffic, captureSitePageview } = await import("@/lib/traffic/posthog");
    fetchMock.mockResolvedValueOnce(new Response("private-query-key provider diagnostic", { status: 503 }));
    await expect(realtimeTraffic()).rejects.toThrow("PostHog query failed");
    fetchMock.mockResolvedValueOnce(Response.json({ results: [[0, 4, 3]] }));
    await expect(realtimeTraffic()).resolves.toMatchObject({ activeVisitors: 0, pageViews30d: 4, visitors30d: 3 });
    fetchMock.mockResolvedValueOnce(new Response("private-query-key", { status: 500 }));
    await expect(captureSitePageview({ visitorId: "bafef428-145b-4f0d-ad29-e89672734938", path: "/" })).rejects.toThrow("PostHog capture failed");
  });

  it("refreshes cached traffic after 30 seconds", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-12T08:00:00Z"));
    const { realtimeTraffic } = await import("@/lib/traffic/posthog");
    fetchMock.mockImplementation(async () => Response.json({ results: [[fetchMock.mock.calls.length, 20, 10]] }));
    expect((await realtimeTraffic()).activeVisitors).toBe(1);
    vi.advanceTimersByTime(29999);
    expect((await realtimeTraffic()).activeVisitors).toBe(1);
    vi.advanceTimersByTime(1);
    expect((await realtimeTraffic()).activeVisitors).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).refresh === "force_blocking")).toBe(true);
  });
});
