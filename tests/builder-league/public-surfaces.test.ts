import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { NAV, navItemsFor } from "@/components/site/site-nav-items";
import { isPublicWrappedPath, publicWrappedPaths } from "@/lib/builder-league/public-surfaces";
import { communityWrappedJsonLd } from "@/lib/structured-data";

const NOW = new Date("2027-03-01T05:00:00Z");

describe("Builder League discovery surfaces", () => {
  it("advertises Community Wrapped years only while the flag is on", () => {
    expect(publicWrappedPaths(NOW, false)).toEqual([]);
    expect(publicWrappedPaths(NOW, true)).toEqual(["/wrapped/2027", "/wrapped/2026"]);
    expect(isPublicWrappedPath("/wrapped/2026", NOW, true)).toBe(true);
    expect(isPublicWrappedPath("/wrapped/2026", NOW, false)).toBe(false);
    expect(isPublicWrappedPath("/wrapped/2025", NOW, true)).toBe(false);
    expect(isPublicWrappedPath("/wrapped/2026/token", NOW, true)).toBe(false);
  });

  it("keeps member pages and personal share links out of crawlers in every locale", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow;
    for (const prefix of ["", "/vi", "/en"]) {
      expect(disallow).toEqual(expect.arrayContaining([`${prefix}/builder-league`, `${prefix}/studio`, `${prefix}/wrapped/*/`]));
    }
    expect(disallow).not.toContain("/wrapped/");
  });

  it("describes Community Wrapped as an NLB dataset", () => {
    const jsonLd = communityWrappedJsonLd({
      year: 2026,
      locale: "vi",
      name: "Community Wrapped 2026",
      description: "Aggregate figures.",
      coverageStart: "2026-01-01",
      coverageEnd: "2026-12-31",
      status: "final",
      version: 3,
      modifiedAt: new Date("2027-01-02T00:00:00Z"),
    });
    expect(jsonLd).toMatchObject({
      "@type": "Dataset",
      inLanguage: "vi",
      temporalCoverage: "2026-01-01/2026-12-31",
      creativeWorkStatus: "Final",
      version: "3",
      isAccessibleForFree: true,
    });
    expect(String(jsonLd.url)).toMatch(/\/vi\/wrapped\/2026$/);
  });

  it("adds the Builder League menu entry only for viewers with access", () => {
    expect(navItemsFor(false)).toBe(NAV);
    expect(navItemsFor(true).map((item) => item.key)).toEqual([...NAV.map((item) => item.key), "builderLeague"]);
  });
});
