import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildWithUsCopy } from "@/content/pages/build-with-us-copy";
import { directoryCopy } from "@/content/pages/directory-copy";
import { toPageLocale } from "@/content/pages/page-locale";
import { successPageCopy } from "@/content/pages/success-page-copy";

const LOCALES = ["en", "vi"] as const;

/** Every string leaf of a copy object, so empty translations fail loudly. */
function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}

describe("page copy modules", () => {
  it("falls back to English for unknown locales", () => {
    expect(toPageLocale("vi")).toBe("vi");
    expect(toPageLocale("en")).toBe("en");
    expect(toPageLocale("fr")).toBe("en");
  });

  it.each([
    ["success", successPageCopy],
    ["build with us", buildWithUsCopy],
    ["directory", directoryCopy],
  ] as const)("%s copy has the same non-empty keys in EN and VI", (_name, copy) => {
    const en = copy.en as Record<string, unknown>;
    const vi = copy.vi as Record<string, unknown>;
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
    for (const locale of LOCALES) {
      for (const text of stringLeaves(copy[locale])) expect(text.trim()).not.toBe("");
    }
  });

  it("formats counts per locale", () => {
    expect(directoryCopy.en.votes(1)).toBe("1 vote");
    expect(directoryCopy.en.votes(1200)).toBe("1,200 votes");
    expect(directoryCopy.vi.votes(3)).toBe("3 lượt bình chọn");
    expect(buildWithUsCopy.en.publishedCount(1)).toBe("1 published product");
    expect(buildWithUsCopy.en.voteFor("Tool", 2)).toBe("Upvote Tool (2 votes)");
  });

  it("keeps the same category filters in both locales", () => {
    expect(Object.keys(buildWithUsCopy.vi.categories)).toEqual(Object.keys(buildWithUsCopy.en.categories));
  });
});

describe("Build with Us honesty", () => {
  const client = fs.readFileSync(path.join(process.cwd(), "app/[locale]/build-with-us/build-with-us-client.tsx"), "utf-8");
  const studio = fs.readFileSync(path.join(process.cwd(), "app/[locale]/studio/studio-builder-client.tsx"), "utf-8");

  it("does not advertise hard-coded prices or slot counters", () => {
    for (const source of [client, studio]) {
      expect(source).not.toMatch(/\$24\.50|\$49|50% OFF|Slots Left/i);
    }
  });

  it("labels the search, sort and filter controls", () => {
    expect(client).toContain('htmlFor="bwu-search"');
    expect(client).toContain('htmlFor="bwu-sort"');
    expect(client).toMatch(/aria-pressed=\{selectedCategory === cat\}/);
    expect(client).toMatch(/aria-pressed=\{rankingWindow === key\}/);
  });
});
