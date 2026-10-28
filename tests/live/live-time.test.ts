import { describe, expect, it } from "vitest";
import { addLocalDays, buildWeeklyWindow, zonedLocalToUtc } from "@/lib/live/live-time";
import { LiveError } from "@/lib/live/live-errors";

describe("Asia/Ho_Chi_Minh wall-clock conversion", () => {
  it("converts local time at a fixed +07:00 offset", () => {
    expect(zonedLocalToUtc("2026-11-02", "09:00").toISOString()).toBe("2026-11-02T02:00:00.000Z");
    // Local midnight is the previous UTC day.
    expect(zonedLocalToUtc("2026-11-02", "00:30").toISOString()).toBe("2026-11-01T17:30:00.000Z");
    // Across month and year ends.
    expect(zonedLocalToUtc("2027-01-01", "06:59").toISOString()).toBe("2026-12-31T23:59:00.000Z");
  });

  it("builds a 7-local-day window regardless of the host clock", () => {
    const w = buildWeeklyWindow({ opensOn: "2026-12-28", opensAt: "09:00", closesAt: "21:00" });
    expect(w.opensAt.toISOString()).toBe("2026-12-28T02:00:00.000Z");
    expect(w.closesAt.toISOString()).toBe("2027-01-04T14:00:00.000Z");
    expect(w.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(addLocalDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("stays correct for a DST zone (local days, not 24h blocks)", () => {
    // US DST starts 2026-03-08: the week is 167 hours long.
    const w = buildWeeklyWindow({ opensOn: "2026-03-05", opensAt: "10:00", timeZone: "America/New_York" });
    expect(w.opensAt.toISOString()).toBe("2026-03-05T15:00:00.000Z");
    expect(w.closesAt.toISOString()).toBe("2026-03-12T14:00:00.000Z");
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => zonedLocalToUtc("2026-02-30", "09:00")).toThrowError(LiveError);
    expect(() => zonedLocalToUtc("2026-11-02", "24:00")).toThrowError(LiveError);
    expect(() => buildWeeklyWindow({ opensOn: "2026-11-02", opensAt: "09:00", days: 0 })).toThrowError(LiveError);
  });
});
