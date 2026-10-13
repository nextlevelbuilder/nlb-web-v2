import { register } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import type { MembershipProductIds } from "@/lib/home/membership-product-ids";
import { computeSeatAvailability, type SeatAvailability } from "@/lib/home/membership-seats";

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

type Sections = Record<string, (props: { launchedProducts?: null | [] }) => ReactNode>;
let sections: Sections;
let CheckoutProvider: typeof import("@/components/home/checkout-context").CheckoutProvider;

beforeAll(async () => {
  ({ CheckoutProvider } = await import("@/components/home/checkout-context"));
  const names = ["hero", "the-dark", "community", "courses", "directory", "proof", "team", "partners", "pricing", "build-with-agentkit", "cta"];
  const modules = await Promise.all(names.map((name) => import(`@/components/sections/${name}-section.tsx`)));
  sections = Object.fromEntries(names.map((name, i) => [name, modules[i].default]));
});

function renderHome(locale: "en" | "vi", seats: SeatAvailability | null = computeSeatAvailability({ premium: 30, vip: 4 })) {
  const messages = locale === "en" ? en : vi;
  const children = Object.entries(sections).map(([name, Section]) =>
    createElement(Section, { key: name, launchedProducts: name === "build-with-agentkit" ? [] : undefined }),
  );
  const tree = createElement(NextIntlClientProvider, {
    locale,
    messages,
    timeZone: "UTC",
    onError: (error: Error) => {
      throw error;
    },
    children: createElement(CheckoutProvider, { productIds: IDS, seats, children }),
  });
  return renderToStaticMarkup(tree);
}

describe("homepage narrative render", () => {
  it.each(["en", "vi"] as const)("renders every section in %s without missing messages", (locale) => {
    const html = renderHome(locale);
    expect(html).toContain('id="hero-title"');
    expect(html).toContain('id="pricing"');
    expect(html).toContain('href="/' + (locale === "vi" ? "vi/" : "") + 'policies/terms"');
  });

  it("keeps checkout disabled until Terms are accepted and marks sold-out plans", () => {
    const html = renderHome("en");
    expect(html).toMatch(/type="checkbox"/);
    const checkoutButtons = html.match(/<button[^>]*>(?:Join the membership|Join Premium|Join VIP|Sold out this round)<\/button>/g) ?? [];
    expect(checkoutButtons.length).toBe(4); // hero, two plan cards, finale
    for (const button of checkoutButtons) expect(button).toContain('disabled=""');
    expect(html).toContain("Sold out this round");
    expect(html).toContain("6 of 10 seats left");
  });

  it("shows the honest empty state when no member products are live", () => {
    expect(renderHome("en")).toContain("Be the next one — submit from your terminal");
    expect(renderHome("vi")).toContain(vi.home.toolkits.liveEmpty);
  });

  it("hides seat meters when counts are unavailable", () => {
    expect(renderHome("en", null)).not.toContain("seats left");
  });
});
