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
let CheckoutConfirmPanel: typeof import("@/components/checkout/checkout-confirm-panel").default;

beforeAll(async () => {
  ({ CheckoutProvider } = await import("@/components/home/checkout-context"));
  ({ default: CheckoutConfirmPanel } = await import("@/components/checkout/checkout-confirm-panel"));
  const names = ["hero", "the-dark", "community", "courses", "directory", "proof", "team", "partners", "pricing", "build-with-agentkit", "faq", "cta"];
  const modules = await Promise.all(names.map((name) => import(`@/components/sections/${name}-section.tsx`)));
  sections = Object.fromEntries(names.map((name, i) => [name, modules[i].default]));
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

function renderHome(locale: "en" | "vi", seats: SeatAvailability | null = computeSeatAvailability({ premium: 30, vip: 4 })) {
  const children = Object.entries(sections).map(([name, Section]) =>
    createElement(Section, { key: name, launchedProducts: name === "build-with-agentkit" ? [] : undefined }),
  );
  return renderWithProviders(locale, seats, children);
}

describe("homepage narrative render", () => {
  it.each(["en", "vi"] as const)("renders every section in %s without missing messages", (locale) => {
    const html = renderHome(locale);
    expect(html).toContain('id="hero-title"');
    expect(html).toContain('id="pricing"');
    expect(html).toContain('id="faq-title"');
    expect(html).toContain('id="finale-title"');
  });

  it("keeps every available CTA enabled as a dialog trigger and disables only sold-out plans", () => {
    const html = renderHome("en");
    expect(html).not.toContain("Tick the box");
    expect(html).not.toMatch(/type="checkbox"/); // Terms live in the pre-checkout dialog
    const ctas = html.match(/<button[^>]*>(?:Join the membership|Join VIP)<\/button>/g) ?? [];
    expect(ctas.length).toBe(3); // hero, VIP card, finale
    for (const button of ctas) {
      expect(button).not.toContain('disabled=""');
      expect(button).toContain('aria-haspopup="dialog"');
    }
    const soldOut = html.match(/<button[^>]*>Sold out this round<\/button>/g) ?? [];
    expect(soldOut.length).toBe(1); // Premium is full
    expect(soldOut[0]).toContain('disabled=""');
  });

  it("shows the seat meter only once half of a plan's seats are taken", () => {
    const quiet = renderHome("en", computeSeatAvailability({ premium: 0, vip: 4 }));
    expect(quiet).toContain("Limited to 30 members");
    expect(quiet).toContain("Limited to 10 members");
    expect(quiet).not.toContain("seats left");

    const busy = renderHome("en", computeSeatAvailability({ premium: 14, vip: 6 }));
    expect(busy).toContain("Limited to 30 members");
    expect(busy).toContain("4 of 10 seats left");
    expect(busy).toContain("6 of 10 seats taken");
    expect(renderHome("vi", computeSeatAvailability({ premium: 0, vip: 0 }))).toContain("Giới hạn 30 thành viên");
  });

  it.each(["en", "vi"] as const)("renders the FAQ as native disclosures in %s", (locale) => {
    const html = renderHome(locale);
    const messages = locale === "en" ? en : vi;
    expect(html).toContain('id="faq-title"');
    expect(html.match(/<details/g)?.length).toBe(Object.keys(messages.faq.items).length);
    expect(html).toContain(messages.faq.items.refundPolicy.question.replace("'", "&#x27;"));
    expect(html.indexOf('id="faq"')).toBeLessThan(html.indexOf('id="finale"'));
  });

  it("shows a visible name on every partner card, including EGANY.COM", () => {
    const html = renderHome("en");
    for (const name of ["DIGITOP", "200LAB.IO", "EGANY.COM"]) expect(html).toMatch(new RegExp(`>${name.replace(".", "\\.")}<`));
  });

  it("shows the honest empty state when no member products are live", () => {
    expect(renderHome("en")).toContain("Be the next one — submit from your terminal");
    expect(renderHome("vi")).toContain(vi.home.toolkits.liveEmpty);
  });

  it("hides seat meters when counts are unavailable", () => {
    expect(renderHome("en", null)).not.toContain("seats left");
  });
});

describe("pre-checkout dialog body", () => {
  const renderPanel = (locale: "en" | "vi") =>
    renderWithProviders(locale, computeSeatAvailability({ premium: 0, vip: 0 }), createElement(CheckoutConfirmPanel, { plan: "vip", source: "hero" }));

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
