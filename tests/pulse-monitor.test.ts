import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PulseMonitor } from "@/components/blocks/pulse-block";

describe("Pulse monitor visualization", () => {
  it("shows unknown without manufacturing samples or an active heartbeat", () => {
    const html = renderToStaticMarkup(React.createElement(PulseMonitor, { status: "unknown", history: [] }));
    expect(html).toContain("No recorded measurements yet.");
    expect(html).not.toContain("Recorded response time");
    expect(html).not.toContain("animate-pulse");
  });

  it("plots real latencies and breaks the line at unknown measurements", () => {
    const html = renderToStaticMarkup(React.createElement(PulseMonitor, { status: "up", history: [
      { checkedAt: "2026-09-12T10:10:00Z", outcome: "up", latencyMs: 250, httpStatus: 200, reason: null },
      { checkedAt: "2026-09-12T10:05:00Z", outcome: "unknown", latencyMs: null, httpStatus: null, reason: "dns_unavailable" },
      { checkedAt: "2026-09-12T10:00:00Z", outcome: "down", latencyMs: 500, httpStatus: 503, reason: null },
    ] }));
    expect(html).toContain("0–500 ms");
    expect(html).toContain("250 ms");
    expect(html.match(/<circle /g)).toHaveLength(2);
    // Only three ECG grid lines; no latency line across the missing sample.
    expect(html.match(/<line /g)).toHaveLength(3);
    expect(html).toContain("motion-safe:animate-pulse");
  });

  it("respects hidden history without falsely claiming no measurements", () => {
    const html = renderToStaticMarkup(React.createElement(PulseMonitor, { status: "stale", history: [], showHistory: false }));
    expect(html).toContain("Stale");
    expect(html).not.toContain("No recorded measurements");
    expect(html).not.toContain("animate-pulse");
  });
});
