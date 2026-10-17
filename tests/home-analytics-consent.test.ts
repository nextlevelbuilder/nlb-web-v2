import { describe, expect, it } from "vitest";
import { isAnalyticsAllowed } from "@/lib/constants/analytics-consent";

describe("analytics consent gate", () => {
  it("allows analytics when no privacy signal is sent", () => {
    expect(isAnalyticsAllowed({})).toBe(true);
    expect(isAnalyticsAllowed({ doNotTrack: null, globalPrivacyControl: false })).toBe(true);
    expect(isAnalyticsAllowed({ doNotTrack: "0" })).toBe(true);
    expect(isAnalyticsAllowed({ doNotTrack: "unspecified" })).toBe(true);
  });

  it("blocks analytics for Do Not Track", () => {
    expect(isAnalyticsAllowed({ doNotTrack: "1" })).toBe(false);
    expect(isAnalyticsAllowed({ doNotTrack: "yes" })).toBe(false);
  });

  it("blocks analytics for Global Privacy Control", () => {
    expect(isAnalyticsAllowed({ globalPrivacyControl: true })).toBe(false);
    expect(isAnalyticsAllowed({ doNotTrack: "0", globalPrivacyControl: true })).toBe(false);
  });

  it("fails closed without a navigator", () => {
    expect(isAnalyticsAllowed(undefined)).toBe(false);
    expect(isAnalyticsAllowed(null)).toBe(false);
  });
});
