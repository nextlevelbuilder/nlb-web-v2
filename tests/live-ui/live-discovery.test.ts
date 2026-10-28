import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as llmsFull } from "@/app/llms-full.txt/route";
import { GET as liveNav } from "@/app/api/v1/live/nav/route";
import { NAV, navItemsFor } from "@/components/site/site-nav-items";
import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { listPastEvents, listUpcomingEvents, type LivePublicEvent } from "@/lib/live/event-read-models";
import { fetchPageMarkdown } from "@/lib/markdown/page-markdown";
import { markdownSourcePath, pagePath } from "@/lib/markdown/page-paths";
import { liveEventJsonLd } from "@/lib/structured-data";

vi.mock("@/lib/domain/catalog", () => ({ getAllPublishedProducts: vi.fn(), getPublishedProductBySlug: vi.fn() }));
vi.mock("@/lib/markdown/page-markdown", () => ({ fetchPageMarkdown: vi.fn() }));
vi.mock("@/lib/live/event-read-models", () => ({ listUpcomingEvents: vi.fn(), listPastEvents: vi.fn() }));

const event: LivePublicEvent = {
  id: "ev1",
  slug: "agent-loops-live",
  titleEn: "Agent loops, live",
  titleVi: "Vòng lặp agent, trực tiếp",
  descriptionEn: "Build an agent loop together.",
  descriptionVi: "Cùng build một vòng lặp agent.",
  topicId: null,
  status: "sales_open",
  startsAt: new Date("2030-01-10T13:00:00Z"),
  endsAt: new Date("2030-01-10T15:00:00Z"),
  timezone: "Asia/Ho_Chi_Minh",
  hostName: "Duy",
  capacity: 50,
  priceCents: 1900,
  currency: "usd",
  refundPolicyEn: "Full refund until 24h before.",
  refundPolicyVi: "Hoàn tiền đến 24 giờ trước.",
  recordingNoticeEn: "Recorded.",
  recordingNoticeVi: "Có ghi hình.",
  hasMemberDiscount: false,
  seatsLeft: 12,
  cancelledAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
  vi.mocked(getAllPublishedProducts).mockResolvedValue([]);
  vi.mocked(fetchPageMarkdown).mockResolvedValue({ status: 200, body: "# Page\n" });
  vi.mocked(listUpcomingEvents).mockResolvedValue([event]);
  vi.mocked(listPastEvents).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Live discovery with the flag off", () => {
  beforeEach(() => vi.stubEnv("LIVE_ENABLED", "false"));

  it("keeps /live out of the sitemap, llms.txt, llms-full.txt, markdown twins and the nav", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/live"))).toBe(false);
    expect(listUpcomingEvents).not.toHaveBeenCalled();
    expect(await (await llms()).text()).not.toContain("/live");
    await llmsFull();
    expect(vi.mocked(fetchPageMarkdown).mock.calls.some((call) => String(call[1]).includes("/live"))).toBe(false);
    expect(markdownSourcePath("/live.md")).toBeNull();
    expect(pagePath("/vi/live/agent-loops-live")).toBeNull();
    expect(navItemsFor(false, false)).toBe(NAV);
    expect(navItemsFor(false).some((item) => item.key === "live")).toBe(false);
  });

  it("tells the header probe to hide the Live entry, with a 200 and no caching", async () => {
    const response = await liveNav();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ data: { showNav: false } });
  });
});

describe("Live discovery with the flag on", () => {
  beforeEach(() => vi.stubEnv("LIVE_ENABLED", "true"));

  it("lists /live and each public event in both locales in the sitemap", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual(expect.arrayContaining([
      "https://example.test/live",
      "https://example.test/vi/live",
      "https://example.test/live/agent-loops-live",
      "https://example.test/vi/live/agent-loops-live",
    ]));
  });

  it("advertises the Live index and upcoming sessions by their .md URL", async () => {
    const body = await (await llms()).text();
    expect(body).toContain("[NLB Live](https://example.test/live.md)");
    expect(body).toContain("(https://example.test/live/agent-loops-live.md)");
    await llmsFull();
    const fetched = vi.mocked(fetchPageMarkdown).mock.calls.map((call) => call[1]);
    expect(fetched).toEqual(expect.arrayContaining(["/live", "/vi/live"]));
  });

  it("serves markdown twins for the index and event pages only", () => {
    expect(markdownSourcePath("/live.md")).toEqual({ path: "/live", pathname: "/live", locale: "en" });
    expect(markdownSourcePath("/vi/live/agent-loops-live.md")).toEqual({ path: "/live/agent-loops-live", pathname: "/vi/live/agent-loops-live", locale: "vi" });
    for (const path of ["/live/Bad.md", "/live/a/b.md", "/live/a--b.md", "/lives.md"]) expect(markdownSourcePath(path), path).toBeNull();
  });

  it("tells the header probe to show the Live entry from the runtime flag", async () => {
    expect(await (await liveNav()).json()).toEqual({ data: { showNav: true } });
  });

  it("adds the Live nav entry right after Courses", () => {
    const keys = navItemsFor(false, true).map((item) => item.key);
    expect(keys.slice(0, 2)).toEqual(["courses", "live"]);
    expect(navItemsFor(true, true).map((item) => item.key).at(-1)).toBe("builderLeague");
  });
});

describe("liveEventJsonLd", () => {
  it("describes an online Event with a seat Offer and never a join URL", () => {
    const jsonLd = liveEventJsonLd({ ...event, locale: "vi", name: event.titleVi, description: event.descriptionVi });
    expect(jsonLd).toMatchObject({
      "@type": "Event",
      name: "Vòng lặp agent, trực tiếp",
      inLanguage: "vi",
      startDate: "2030-01-10T13:00:00.000Z",
      endDate: "2030-01-10T15:00:00.000Z",
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: { "@type": "VirtualLocation", url: "https://example.test/vi/live/agent-loops-live" },
      offers: { "@type": "Offer", price: 19, priceCurrency: "USD", availability: "https://schema.org/InStock" },
    });
    const serialized = JSON.stringify(jsonLd);
    expect(serialized).not.toMatch(/zoom|join/i);
    // Only the public event page is ever linked.
    const urls = serialized.match(/https?:\/\/[^"]+/g) ?? [];
    expect(urls.every((url) => url.startsWith("https://example.test") || url.startsWith("https://schema.org"))).toBe(true);
  });

  it("marks cancelled and sold-out events", () => {
    expect(liveEventJsonLd({ ...event, status: "cancelled", locale: "en", name: "x", description: "" })).toMatchObject({ eventStatus: "https://schema.org/EventCancelled", description: "x" });
    expect(liveEventJsonLd({ ...event, seatsLeft: 0, locale: "en", name: "x", description: "y" })).toMatchObject({ offers: { availability: "https://schema.org/SoldOut" } });
  });
});
