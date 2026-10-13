import { describe, expect, it } from "vitest";
import {
  POLICIES,
  POLICY_LOCALES,
  POLICY_PAGE_SLUGS,
  getPolicy,
  isPolicySlug,
  policyHref,
  policySlugsByGroup,
  toPolicyLocale,
} from "@/content/policies";
import { policyUiCopy } from "@/content/policies/policy-ui-copy";
import { THEME_STORAGE_KEY } from "@/components/theme-provider";

const LEGAL_SLUGS = ["terms", "privacy", "refund", "cookies"] as const;
const COMMUNITY_SLUGS = [
  "overview",
  "ship-policy",
  "contributor-policy",
  "membership-tiers",
  "onboarding",
  "violations",
] as const;

function fullText(slug: string, locale: "en" | "vi") {
  const doc = getPolicy(slug, locale);
  if (!doc) throw new Error(`missing ${slug}`);
  return [doc.title, doc.summary, ...doc.sections.flatMap((s) => [s.heading, s.content])].join("\n");
}

describe("policy registry", () => {
  it("lists every community and legal page exactly once", () => {
    expect([...POLICY_PAGE_SLUGS].sort()).toEqual([...COMMUNITY_SLUGS, ...LEGAL_SLUGS].sort());
    expect(new Set(POLICY_PAGE_SLUGS).size).toBe(POLICY_PAGE_SLUGS.length);
    expect(policySlugsByGroup("community")).toEqual([...COMMUNITY_SLUGS]);
    expect(policySlugsByGroup("legal")).toEqual([...LEGAL_SLUGS]);
  });

  it.each(POLICY_PAGE_SLUGS)("%s has complete EN and VI content dated 2026-10-13", (slug) => {
    const entry = POLICIES[slug];
    expect(entry.lastUpdated).toBe("2026-10-13");
    for (const locale of POLICY_LOCALES) {
      const doc = entry.content[locale];
      expect(doc.title.trim()).not.toBe("");
      expect(doc.navLabel.trim()).not.toBe("");
      expect(doc.summary.trim()).not.toBe("");
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const section of doc.sections) {
        expect(section.heading.trim()).not.toBe("");
        expect(section.content.trim()).not.toBe("");
      }
    }
    // Both translations cover the same outline.
    expect(entry.content.vi.sections.length).toBe(entry.content.en.sections.length);
  });

  it("flags only the new legal documents for legal review", () => {
    for (const slug of LEGAL_SLUGS) expect(POLICIES[slug].legalReviewPending).toBe(true);
    for (const slug of COMMUNITY_SLUGS) expect(POLICIES[slug].legalReviewPending).toBe(false);
  });

  it("never renders a draft banner phrase to visitors", () => {
    for (const slug of LEGAL_SLUGS) {
      for (const locale of POLICY_LOCALES) {
        expect(fullText(slug, locale)).not.toMatch(/\bdraft\b|legal review|bản nháp/i);
      }
    }
  });
});

describe("legal facts", () => {
  it("refund policy states the 30-day guarantee and Polar as merchant of record", () => {
    const en = fullText("refund", "en");
    expect(en).toMatch(/30-day money-back guarantee/);
    expect(en).toMatch(/within 30 days/);
    expect(en).toMatch(/Polar \(polar\.sh\)[^.]*merchant of record/);

    const vi = fullText("refund", "vi");
    expect(vi).toMatch(/30 ngày/);
    expect(vi).toMatch(/Polar[^.]*merchant of record/);
  });

  it("names the operator and contact address on every legal page", () => {
    for (const slug of LEGAL_SLUGS) {
      for (const locale of POLICY_LOCALES) {
        const text = fullText(slug, locale);
        expect(text).toContain("Next Level Builders");
        expect(text).toContain("hello@nextlevelbuilder.io");
      }
    }
  });

  it("privacy policy lists the processors the code actually uses", () => {
    const text = fullText("privacy", "en");
    for (const name of [
      "Cloudflare",
      "D1",
      "R2",
      "Stream",
      "Polar",
      "Resend",
      "Google",
      "GitHub",
      "PostHog",
      "ClickHouse",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("cookie policy lists the essential cookies and discloses GA4 accurately", () => {
    const text = fullText("cookies", "en");
    expect(text).toContain("better-auth.session_token");
    expect(text).toContain("NEXT_LOCALE");
    expect(text).toContain(`${THEME_STORAGE_KEY} (local storage)`);
    expect(text).toContain("nlb_traffic_visitor");
    expect(text).toContain("_ga_<container-id>");
    expect(text).toMatch(/up to 2 years/);
    expect(text).toMatch(/do not load Google Analytics when your browser sends Do Not Track or Global Privacy Control/);
    expect(text).toMatch(/product traffic counts set no cookies/);
  });
});

describe("policy lookup", () => {
  it("returns null for unknown slugs so the route can call notFound()", () => {
    expect(getPolicy("does-not-exist", "en")).toBeNull();
    expect(getPolicy("", "vi")).toBeNull();
    expect(getPolicy("../terms", "en")).toBeNull();
    expect(isPolicySlug("TERMS")).toBe(false);
    expect(isPolicySlug("terms")).toBe(true);
  });

  it("resolves locales and falls back to English", () => {
    expect(toPolicyLocale("vi")).toBe("vi");
    expect(toPolicyLocale("en")).toBe("en");
    expect(toPolicyLocale("fr")).toBe("en");
    expect(getPolicy("terms", "vi")?.title).toBe("Điều khoản dịch vụ");
    expect(getPolicy("terms", "de")?.title).toBe("Terms of Service");
  });

  it("builds locale-less hrefs", () => {
    expect(policyHref("overview")).toBe("/policies");
    expect(policyHref("refund")).toBe("/policies/refund");
  });

  it("has interface copy for both locales", () => {
    for (const locale of POLICY_LOCALES) {
      for (const value of Object.values(policyUiCopy[locale])) expect(value.trim()).not.toBe("");
    }
  });
});
