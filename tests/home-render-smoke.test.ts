import { register } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import type { MembershipProductIds } from "@/lib/home/membership-product-ids";
import { computeSeatAvailability, type SeatAvailability } from "@/lib/home/membership-seats";
import type { HomeLeaderboardEntry } from "@/lib/home/home-leaderboard";
import type { HomeCourseVideo } from "@/lib/home/home-course-videos";
import type { HomeBlogPost, HomeLaunchedProduct } from "@/lib/home/home-page-data";

// Same Next.js subpath mapping as the locale routing test (next-intl imports `next/navigation` bare).
const NEXT_SUBPATH_RESOLVER = `
export async function resolve(specifier, context, next) {
  if (/^next\\/(server|navigation|headers|link|image)$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(NEXT_SUBPATH_RESOLVER)}`);

const IDS: MembershipProductIds = {
  premium: { quarterly: "premium-q", annual: "premium-a" },
  vip: { quarterly: "vip-q", annual: "vip-a" },
};

interface HomeData {
  videos: HomeCourseVideo[];
  leaderboard: HomeLeaderboardEntry[];
  launched: HomeLaunchedProduct[] | null;
  posts: HomeBlogPost[];
}

const EMPTY: HomeData = { videos: [], leaderboard: [], launched: [], posts: [] };

// Chapter order matches app/[locale]/page.tsx; each entry maps the page data to the chapter's props.
const CHAPTERS: Array<[string, (data: HomeData) => Record<string, unknown>]> = [
  ["hook-chapter", () => ({})],
  ["dark-chapter", () => ({})],
  ["community-chapter", () => ({})],
  ["courses-chapter", (d) => ({ videos: d.videos })],
  ["directory-chapter", (d) => ({ leaderboard: d.leaderboard })],
  ["proof-chapter", () => ({})],
  ["founders-chapter", () => ({})],
  ["partners-chapter", () => ({})],
  ["pricing-chapter", () => ({})],
  ["toolkits-chapter", (d) => ({ launched: d.launched })],
  ["faq-chapter", (d) => ({ posts: d.posts })],
  ["finale-chapter", () => ({})],
];

let chapters: Array<ComponentType<Record<string, unknown>>>;
let CheckoutProvider: typeof import("@/components/home/checkout-context").CheckoutProvider;
let CheckoutConfirmPanel: typeof import("@/components/checkout/checkout-confirm-panel").default;

beforeAll(async () => {
  ({ CheckoutProvider } = await import("@/components/home/checkout-context"));
  ({ default: CheckoutConfirmPanel } = await import("@/components/checkout/checkout-confirm-panel"));
  const modules = await Promise.all(CHAPTERS.map(([name]) => import(`@/components/constellation/${name}.tsx`)));
  chapters = modules.map((m) => m.default);
});

// The providers' prop types declare `children` as required, so it is passed as a prop here.
/* eslint-disable react/no-children-prop */
function renderWithProviders(locale: "en" | "vi", seats: SeatAvailability | null, children: ReactNode) {
  const tree = createElement(NextIntlClientProvider, {
    locale,
    messages: locale === "en" ? en : vi,
    timeZone: "UTC",
    onError: (error: Error) => {
      throw error;
    },
    children: createElement(CheckoutProvider, { productIds: IDS, seats, children }),
  });
  return renderToStaticMarkup(tree);
}
/* eslint-enable react/no-children-prop */

function renderHome(
  locale: "en" | "vi",
  seats: SeatAvailability | null = computeSeatAvailability({ premium: 30, vip: 4 }),
  data: HomeData = EMPTY,
) {
  const children = chapters.map((Chapter, i) => createElement(Chapter, { key: CHAPTERS[i][0], ...CHAPTERS[i][1](data) }));
  return renderWithProviders(locale, seats, children);
}

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("homepage chapters render", () => {
  it.each(["en", "vi"] as const)("renders every chapter in %s without missing messages", (locale) => {
    const html = renderHome(locale);
    for (const id of ["hook-title", "dark-title", "community-title", "courses-title", "dir-title", "proof-title", "founders-title", "partners-title", "pricing-title", "tool-title", "faq-title", "finale-title"]) {
      expect(html).toContain(`id="${id}"`);
    }
    // Each top-level section carries its orbit chapter numeral for the sky and the progress arc.
    expect(html.match(/<section[^>]*data-ch="\d"/g)?.length).toBe(CHAPTERS.length);
  });

  it.each(["en", "vi"] as const)("server-renders the split headlines as readable text in %s", (locale) => {
    const html = renderHome(locale);
    const messages = locale === "en" ? en : vi;
    const plain = (rich: string) => rich.replace(/<\/?em>/g, "").replace(/\s+/g, " ");
    const hook = html.match(/<h1[^>]*id="hook-title"[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? "";
    expect(text(hook).replace(/ /g, " ").trim()).toBe(plain(messages.home.hook.title).replace(/ /g, " "));
    expect(hook).toContain("<em>");
  });

  it("opens the checkout dialog only from available plan cards and disables sold-out plans", () => {
    const html = renderHome("en");
    expect(html).not.toMatch(/type="checkbox"/); // Terms live in the pre-checkout dialog
    const joins = html.match(/<button[^>]*>Join (?:Premium|VIP)<\/button>/g) ?? [];
    expect(joins.length).toBe(1); // only VIP: Premium is full
    expect(joins[0]).toContain('aria-haspopup="dialog"');
    expect(joins[0]).not.toContain('disabled=""');
    const soldOut = html.match(/<button[^>]*>Sold out this round<\/button>/g) ?? [];
    expect(soldOut.length).toBe(1);
    expect(soldOut[0]).toContain('disabled=""');
    // Hero, finale and sticky CTAs scroll to the plans instead of skipping the choice.
    expect(html).toMatch(/href="#pricing"[^>]*>(?:<span>)?Join the membership/);
  });

  it("shows the real prices for the selected billing cycle", () => {
    const html = renderHome("en", computeSeatAvailability({ premium: 0, vip: 0 }));
    expect(html).toContain(">$147<");
    expect(html).toContain(">$297<");
    expect(html).toContain("≈ $49/mo · billed every 3 months");
    expect(html).toContain("Save 20% with annual");
  });

  it("shows the seat meter only once half of a plan's seats are taken", () => {
    const quiet = renderHome("en", computeSeatAvailability({ premium: 0, vip: 4 }));
    expect(quiet).toContain("Limited to 30 members");
    expect(quiet).toContain("Limited to 10 members");
    expect(quiet).not.toContain("seats left");
    expect(quiet).not.toContain('class="meter"');

    const busy = renderHome("en", computeSeatAvailability({ premium: 14, vip: 6 }));
    expect(busy).toContain("Limited to 30 members");
    expect(busy).toContain("4 of 10 seats left");
    expect(busy.match(/class="meter"/g)?.length).toBe(1);
    expect(busy).toContain('data-taken="0.600"');
    expect(renderHome("vi", computeSeatAvailability({ premium: 0, vip: 0 }))).toContain("Giới hạn 30 thành viên");
  });

  it("hides seat lines when counts are unavailable", () => {
    const html = renderHome("en", null);
    expect(html).not.toContain("seats left");
    expect(html).not.toContain("Limited to");
  });

  it.each(["en", "vi"] as const)("renders the FAQ as native disclosures before the finale in %s", (locale) => {
    const html = renderHome(locale);
    const messages = locale === "en" ? en : vi;
    expect(html.match(/<details/g)?.length).toBe(Object.keys(messages.faq.items).length);
    expect(html).toContain(messages.faq.items.refundPolicy.question.replace("'", "&#x27;"));
    expect(html.indexOf('id="faq"')).toBeLessThan(html.indexOf('id="finale"'));
  });

  it("shows the founders, flagship products and every partner by name", () => {
    const html = text(renderHome("en"));
    for (const name of ["Duy Nguyen", "Cuong Vo", "Viet Tran", "AgentKit", "dewee", "ReelCrew", "DIGITOP.AI", "200LAB.IO", "EGANY.COM", "UI UX Pro Max"]) {
      expect(html).toContain(name);
    }
  });

  it("shows honest empty states instead of sample data", () => {
    const html = renderHome("en");
    expect(html).toContain("Be the next one — submit from your AI agent");
    expect(html.match(/class="lb-row is-open"/g)?.length).toBe(5);
    expect(html).toContain(`aria-label="${en.home.directory.chartAltEmpty}"`);
    expect(html).not.toContain("From the logbook"); // no posts, no teaser
    expect(html).toContain("Every Monday"); // explanatory course cards without prices
    expect(html).not.toMatch(/Buy \$/);
    expect(renderHome("vi")).toContain(vi.home.toolkits.liveEmpty);
  });

  it("renders the real leaderboard, latest videos, launches and posts when present", () => {
    const html = renderHome("en", null, {
      videos: [{ slug: "week-12", title: "Shipping an MCP server", locale: "en", weekNumber: 12, durationSec: 1500, priceCents: 1900, currency: "USD", thumbnailUrl: null, publishedAt: 1 }],
      leaderboard: [
        { slug: "alpha", title: "Alpha", tagline: "First", trustScore: 92, votes: 40 },
        { slug: "beta", title: "Beta", tagline: "Second", trustScore: 80, votes: 12 },
      ],
      launched: [{ slug: "alpha", title: "Alpha", tagline: "First", logoUrl: null, trustScore: 92 }],
      posts: [{ slug: "hello", title: "Hello builders", description: "Notes", publishedAt: "2026-10-01T00:00:00Z" }],
    });
    const chartAlt = en.home.directory.chartAlt.replace("{name}", "Alpha").replace("{trust}", "92");
    expect(html).toContain(`aria-label="${chartAlt.replaceAll("'", "&#x27;")}"`);
    expect(html.match(/class="pstar"/g)?.length).toBe(2);
    expect(html.match(/class="lb-row is-open"/g)?.length).toBe(3);
    expect(html).toContain('href="/products/alpha"');
    expect(html).toContain('href="/courses/week-12"');
    expect(html).toContain("Buy $19");
    expect(html).toContain("From the logbook");
    expect(html).toContain('href="/blog/hello"');
  });
});

describe("pre-checkout dialog body", () => {
  const renderPanel = (locale: "en" | "vi") =>
    renderWithProviders(locale, computeSeatAvailability({ premium: 0, vip: 0 }), createElement(CheckoutConfirmPanel, { plan: "vip", source: "pricing-vip" }));

  it("shows the chosen plan with its real price and gates the Polar button on the Terms", () => {
    const html = renderPanel("en");
    expect(html).toContain("VIP");
    expect(html).toContain("$297");
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toContain('href="/policies/terms"');
    expect(html).toContain('href="/policies/refund"');
    const button = html.match(/<button[^>]*>Continue to Polar checkout<\/button>/)?.[0] ?? "";
    expect(button).toContain('disabled=""');
    const describedBy = button.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain("Accept the Terms to continue to checkout.");
  });

  it("localizes copy and policy paths in Vietnamese", () => {
    const html = renderPanel("vi");
    expect(html).toContain(vi.home.checkout.continue);
    expect(html).toContain('href="/vi/policies/terms"');
    expect(html).toContain('href="/vi/policies/refund"');
  });
});
