import { describe, expect, it } from "vitest";
import { catalogueSearch, isDefaultCatalogueView, parseCatalogueQuery, queryCatalogue, speakerOf } from "@/lib/courses/course-catalogue";
import type { PublicCourseVideo } from "@/lib/courses/course-video-service";

function video(week: number, overrides: Partial<PublicCourseVideo> = {}): PublicCourseVideo {
  return {
    id: `v${week}`,
    slug: `nlb-weekly-${week}`,
    title: `NLB Weekly #${week}: Chủ đề ${week}`,
    description: `Tóm tắt.\n\nDiễn giả: ${week % 2 ? "Cường Võ" : "Duy Nguyễn"} · 2026-01-01`,
    locale: "vi",
    weekNumber: week,
    durationSec: week * 100,
    priceCents: 900,
    currency: "usd",
    thumbnailUrl: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    hasTranscript: week > 20,
    ...overrides,
  };
}

const all = Array.from({ length: 30 }, (_, i) => video(i + 1));

describe("course catalogue", () => {
  it("parses the query with safe defaults and round-trips it into a URL", () => {
    const q = parseCatalogueQuery({ q: "  grok ", sort: "longest", speaker: "Duy Nguyễn", transcript: "1", page: "3" });
    expect(q).toEqual({ q: "grok", sort: "longest", speaker: "Duy Nguyễn", transcript: true, page: 3 });
    expect(parseCatalogueQuery({ sort: "drop table", page: "-2" })).toMatchObject({ sort: "newest", page: 1 });
    expect(isDefaultCatalogueView(parseCatalogueQuery({}))).toBe(true);
    expect(catalogueSearch(q, 1)).toBe("?q=grok&sort=longest&speaker=Duy+Nguy%E1%BB%85n&transcript=1");
    expect(catalogueSearch(parseCatalogueQuery({}))).toBe("");
  });

  it("reads the speaker line of the description", () => {
    expect(speakerOf("Nội dung.\n\nDiễn giả: Việt Trần · 2026-10-17")).toBe("Việt Trần");
    expect(speakerOf("No speaker here")).toBeNull();
  });

  it("sorts newest first and pages by twelve", () => {
    const page1 = queryCatalogue(all, parseCatalogueQuery({}));
    expect(page1.items.map((v) => v.weekNumber).slice(0, 3)).toEqual([30, 29, 28]);
    expect(page1).toMatchObject({ matched: 30, page: 1, pageCount: 3 });
    expect(page1.items).toHaveLength(12);
    const last = queryCatalogue(all, parseCatalogueQuery({ page: "9" }));
    expect(last.page).toBe(3);
    expect(last.items.map((v) => v.weekNumber)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(queryCatalogue(all, parseCatalogueQuery({ sort: "shortest" })).items[0].weekNumber).toBe(1);
  });

  it("searches without diacritics and filters by speaker and transcript", () => {
    expect(queryCatalogue(all, parseCatalogueQuery({ q: "chu de 17" })).items.map((v) => v.weekNumber)).toEqual([17]);
    const filtered = queryCatalogue(all, parseCatalogueQuery({ speaker: "duy nguyen", transcript: "1" }));
    expect(filtered.items.every((v) => v.hasTranscript && v.weekNumber! % 2 === 0)).toBe(true);
    expect(filtered.matched).toBe(5);
    expect(filtered.speakers).toEqual(["Cường Võ", "Duy Nguyễn"]);
  });
});
