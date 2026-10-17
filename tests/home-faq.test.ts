import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import { serializeJsonLd } from "@/lib/seo";
import { buildFaqPageJsonLd, HOME_FAQ_KEYS } from "@/lib/home/home-faq";

const catalogs = { en, vi } as const;

describe("homepage FAQ copy", () => {
  it.each(["en", "vi"] as const)("has a question and answer for every key in %s", (locale) => {
    const items = catalogs[locale].faq.items as Record<string, { question: string; answer: string }>;
    expect(Object.keys(items).sort()).toEqual([...HOME_FAQ_KEYS].sort());
    for (const key of HOME_FAQ_KEYS) {
      expect(items[key]?.question.trim()).toBeTruthy();
      expect(items[key]?.answer.trim()).toBeTruthy();
    }
  });

  it.each(["en", "vi"] as const)("states the 30-day refund and Polar as merchant of record in %s", (locale) => {
    const { refundPolicy, billing } = catalogs[locale].faq.items;
    expect(refundPolicy.answer).toContain("30");
    expect(refundPolicy.answer).toContain("Polar");
    expect(billing.answer).toContain("merchant of record");
    expect(billing.answer).toContain("Polar");
  });

  it("no longer promises pro-rated refunds on upgrade", () => {
    expect(en.faq.items.upgradePlan.answer).not.toMatch(/pro-rated/i);
  });
});

describe("buildFaqPageJsonLd", () => {
  it("emits a schema.org FAQPage with one Question per entry", () => {
    const ld = buildFaqPageJsonLd([{ question: "Q1?", answer: "A1." }, { question: "Q2?", answer: "A2." }], "https://example.test/#faq");
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      url: "https://example.test/#faq",
      mainEntity: [
        { "@type": "Question", name: "Q1?", acceptedAnswer: { "@type": "Answer", text: "A1." } },
        { "@type": "Question", name: "Q2?", acceptedAnswer: { "@type": "Answer", text: "A2." } },
      ],
    });
  });

  it("is safe to inline once serialized: no raw `<` survives", () => {
    const ld = buildFaqPageJsonLd([{ question: "</script><script>alert(1)</script>", answer: "<b>x</b>" }], "https://example.test/");
    expect(serializeJsonLd(ld)).not.toContain("<");
  });
});
