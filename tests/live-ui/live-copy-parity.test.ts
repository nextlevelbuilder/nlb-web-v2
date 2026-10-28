import { describe, expect, it } from "vitest";
import { LIVE_COPY, getLiveCopy, toLiveLocale } from "@/lib/live/live-copy";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";

/** Every key path with the type of its value (nested records included, functions as "function"). */
function shape(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => shape(child, prefix ? `${prefix}.${key}` : key));
  }
  return [`${prefix}:${typeof value}`];
}

describe("Live copy", () => {
  it("ships every EN key in VI with the same shape", () => {
    expect(shape(LIVE_COPY.vi).sort()).toEqual(shape(LIVE_COPY.en).sort());
  });

  it("has no empty strings and gives function copy real output in both locales", () => {
    for (const locale of ["en", "vi"] as const) {
      const copy = LIVE_COPY[locale] as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(copy)) {
        if (typeof value === "string") expect(value.trim(), `${locale}.${key}`).not.toBe("");
        if (typeof value === "function") expect(String((value as (...args: unknown[]) => unknown)("X", 2)).trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("writes Vietnamese with diacritics, not an English copy", () => {
    const viCopy = getLiveCopy("vi");
    expect(viCopy.voteHeading).not.toBe(getLiveCopy("en").voteHeading);
    expect(viCopy.voteHeading).toMatch(/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i);
    expect(viCopy.timeLeft({ days: 2, hours: 3, minutes: 0 })).toBe("còn 2 ngày 3 giờ");
    expect(getLiveCopy("en").timeLeft({ days: 0, hours: 0, minutes: 5 })).toBe("5m left");
  });

  it("falls back to English for unknown locales", () => {
    expect(toLiveLocale("vi")).toBe("vi");
    expect(toLiveLocale("fr")).toBe("en");
  });

  it("adds the Live nav label to both message catalogues", () => {
    expect(en.shell.nav.live).toBeTruthy();
    expect(vi.shell.nav.live).toBeTruthy();
  });
});
