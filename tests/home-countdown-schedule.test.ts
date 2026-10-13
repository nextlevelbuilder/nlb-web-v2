import { describe, expect, it } from "vitest";
import { countdownParts, daysUntilWeekday, nextUtcMidnight } from "@/lib/home/countdown-schedule";

describe("countdownParts", () => {
  it("splits the remaining time into units", () => {
    const now = Date.UTC(2026, 9, 13, 0, 0, 0);
    const target = now + ((2 * 24 + 3) * 60 + 4) * 60_000 + 5_000;
    expect(countdownParts(target, now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
  });

  it("clamps to zero after the deadline", () => {
    expect(countdownParts(1_000, 5_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });
});

describe("nextUtcMidnight", () => {
  it("returns the following UTC midnight, even exactly at midnight", () => {
    expect(nextUtcMidnight(Date.UTC(2026, 9, 13, 18, 30))).toBe(Date.UTC(2026, 9, 14));
    expect(nextUtcMidnight(Date.UTC(2026, 9, 13))).toBe(Date.UTC(2026, 9, 14));
    expect(nextUtcMidnight(Date.UTC(2026, 11, 31, 23, 59))).toBe(Date.UTC(2027, 0, 1));
  });
});

describe("daysUntilWeekday", () => {
  it("counts days to the next Monday in Vietnam time", () => {
    // Tuesday 2026-10-13 10:00 UTC+7
    expect(daysUntilWeekday(Date.UTC(2026, 9, 13, 3))).toBe(6);
    // Monday 2026-10-19 00:30 UTC+7 is still Sunday in UTC
    expect(daysUntilWeekday(Date.UTC(2026, 9, 18, 17, 30))).toBe(0);
    // Sunday 2026-10-18 12:00 UTC+7
    expect(daysUntilWeekday(Date.UTC(2026, 9, 18, 5))).toBe(1);
  });
});
