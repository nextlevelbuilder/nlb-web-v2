import { describe, expect, it } from "vitest";
import {
  isInPeriod,
  localDateKey,
  localYear,
  nextPeriodKey,
  periodKey,
  periodRange,
  previousPeriodKey,
} from "@/lib/builder-league/time-windows";

/** A wall-clock time in Asia/Ho_Chi_Minh (fixed UTC+7). */
const local = (iso: string) => new Date(`${iso}+07:00`);

describe("builder time windows (UTC+7)", () => {
  it("closes the week on Sunday 23:59 local and opens the next on Monday 00:00 local", () => {
    const sunday = local("2026-10-25T23:59:59.999");
    const monday = local("2026-10-26T00:00:00");
    expect(periodKey("week", sunday)).toBe("2026-W43");
    expect(periodKey("week", monday)).toBe("2026-W44");
    // Monday 00:00 local is still Sunday in UTC.
    expect(monday.toISOString()).toBe("2026-10-25T17:00:00.000Z");
    const range = periodRange("week", "2026-W44");
    expect(range.start.getTime()).toBe(monday.getTime());
    expect(range.end.getTime()).toBe(local("2026-11-01T23:59:59.999").getTime());
  });

  it("keeps Dec 31 23:59 local (16:59 UTC) in the old year", () => {
    const lastMinute = local("2026-12-31T23:59:00");
    expect(lastMinute.toISOString()).toBe("2026-12-31T16:59:00.000Z");
    expect(localYear(lastMinute)).toBe(2026);
    expect(localDateKey(lastMinute)).toBe("2026-12-31");
    expect(periodKey("year", lastMinute)).toBe("2026");
    expect(periodKey("month", lastMinute)).toBe("2026-12");
    const newYear = new Date("2026-12-31T17:00:00Z");
    expect(periodKey("year", newYear)).toBe("2027");
    expect(periodKey("month", newYear)).toBe("2027-01");
    expect(periodRange("year", "2027").start.getTime()).toBe(newYear.getTime());
  });

  it("uses ISO week-years at the year boundary", () => {
    expect(periodKey("week", local("2027-01-01T12:00:00"))).toBe("2026-W53");
    expect(periodKey("week", local("2027-01-04T00:00:00"))).toBe("2027-W01");
    expect(nextPeriodKey("week", "2026-W53")).toBe("2027-W01");
    expect(previousPeriodKey("week", "2027-W01")).toBe("2026-W53");
  });

  it("counts 8-week seasons from Monday 2026-10-19 local", () => {
    expect(periodKey("season", local("2026-10-18T23:59:59"))).toBe("S0");
    expect(periodKey("season", local("2026-10-19T00:00:00"))).toBe("S2026-1");
    expect(periodKey("season", local("2026-12-13T23:59:59"))).toBe("S2026-1");
    expect(periodKey("season", local("2026-12-14T00:00:00"))).toBe("S2026-2");
    const season = periodRange("season", "S2026-1");
    expect(season.start.getTime()).toBe(local("2026-10-19T00:00:00").getTime());
    expect(season.end.getTime()).toBe(local("2026-12-13T23:59:59.999").getTime());
    expect(() => previousPeriodKey("season", "S0")).toThrow();
  });

  it("round-trips keys, ranges and membership", () => {
    const at = local("2027-03-15T08:30:00");
    for (const type of ["week", "month", "year", "season"] as const) {
      const key = periodKey(type, at);
      const range = periodRange(type, key);
      expect(isInPeriod(type, key, at)).toBe(true);
      expect(periodKey(type, range.start)).toBe(key);
      expect(periodKey(type, range.end)).toBe(key);
      expect(periodKey(type, new Date(range.end.getTime() + 1))).toBe(nextPeriodKey(type, key));
      expect(previousPeriodKey(type, nextPeriodKey(type, key))).toBe(key);
    }
    expect(() => periodRange("week", "2026-W99")).toThrow(RangeError);
    expect(() => periodRange("month", "2026-13")).toThrow(RangeError);
  });
});
