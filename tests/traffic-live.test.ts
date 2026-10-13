import { describe, expect, it } from "vitest";
import { queryTraffic } from "@/lib/traffic/traffic";
import { realtimeTraffic } from "@/lib/traffic/posthog";

// Operator-invoked, read-only checks. CI never needs provider credentials.
describe.skipIf(process.env.RUN_TRAFFIC_LIVE !== "1")("configured traffic providers", () => {
  it("executes bounded parameterized queries against ClickHouse", async () => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 86400000).toISOString();
    const result = await queryTraffic("integration-connectivity-check", {from, to});
    expect(result.source).toBe("clickhouse");
    expect(result.series.length).toBeGreaterThan(0);
    expect(Number.isSafeInteger(result.pageViews)).toBe(true);
  }, 30000);

  it("executes the fixed aggregate against the configured PostHog project", async () => {
    const result = await realtimeTraffic();
    expect(result.source).toBe("posthog");
    expect(result.windowMinutes).toBe(5);
    expect(result.windowDays).toBe(30);
    expect(Number.isSafeInteger(result.pageViews30d)).toBe(true);
    expect(Number.isSafeInteger(result.visitors30d)).toBe(true);
  }, 30000);
});
