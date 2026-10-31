import { beforeEach, describe, expect, it, vi } from "vitest";

const loadSharedYear = vi.fn();

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/builder-league/wrapped-access", () => ({
  getPageViewer: async () => ({ user: null, access: { flagEnabled: true, canUse: false } }),
  canSeePublicSurface: (access: { flagEnabled: boolean; canUse: boolean }) => access.flagEnabled || access.canUse,
  loadSharedYear: (...args: unknown[]) => loadSharedYear(...args),
}));
vi.mock("@/components/builder-league/year-review/year-scenes", () => ({ default: () => null, publicScenesModel: () => ({}) }));
vi.mock("@/components/builder-league/wrapped/share-visit-beacon", () => ({ default: () => null }));

import { generateMetadata } from "@/app/[locale]/wrapped/[year]/[token]/page";

const params = (locale: string, year = "2026", token = "AbC123token") => ({ params: Promise.resolve({ locale, year, token }) });

describe("shared Year in Review metadata", () => {
  beforeEach(() => loadSharedYear.mockReset());

  it("keeps a resolved share link out of search in every locale, without a canonical", async () => {
    loadSharedYear.mockResolvedValue({ shareLinkId: "link-1", ownerName: "Mai", review: { scenes: [] } });
    for (const locale of ["en", "vi"]) {
      const metadata = await generateMetadata(params(locale));
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(metadata.referrer).toBe("no-referrer");
      expect(metadata.alternates).toBeUndefined();
      expect(metadata.title).toContain("Mai");
    }
  });

  it("hides unknown tokens and malformed years", async () => {
    loadSharedYear.mockResolvedValue(null);
    expect((await generateMetadata(params("en"))).robots).toEqual({ index: false, follow: false });
    expect((await generateMetadata(params("en", "20x6"))).robots).toEqual({ index: false, follow: false });
  });
});
