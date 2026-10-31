import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));
// The locale-aware Link pulls in the Next.js runtime; the route logic under test does not need it.
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import { parsePolicyContent } from "@/app/[locale]/policies/policy-content";
import PolicySlugPage, { generateMetadata, generateStaticParams } from "@/app/[locale]/policies/[slug]/page";
import { LAUNCH_GATED_POLICY_SLUGS, POLICY_PAGE_SLUGS, policySlugsByGroup } from "@/content/policies";
import { publishedPolicySlugs } from "@/lib/policies/published-policies";

const params = (locale: string, slug: string) => ({ params: Promise.resolve({ locale, slug }) });

describe("policy slug route", () => {
  beforeEach(() => {
    notFound.mockClear();
    vi.unstubAllEnvs();
  });

  it("pre-renders every policy slug except launch-gated ones, which render on demand", () => {
    expect(generateStaticParams()).toEqual(
      POLICY_PAGE_SLUGS.filter((slug) => !LAUNCH_GATED_POLICY_SLUGS.includes(slug)).map((slug) => ({ slug }))
    );
  });

  it("hides the affiliate agreement everywhere while AFFILIATES_ENABLED is off", async () => {
    vi.stubEnv("AFFILIATES_ENABLED", "false");
    expect(publishedPolicySlugs()).not.toContain("affiliate-agreement");
    expect(policySlugsByGroup("legal", publishedPolicySlugs())).not.toContain("affiliate-agreement");
    await expect(PolicySlugPage(params("en", "affiliate-agreement"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await generateMetadata(params("en", "affiliate-agreement"))).robots).toEqual({ index: false });
  });

  it("publishes the affiliate agreement once AFFILIATES_ENABLED is on", async () => {
    vi.stubEnv("AFFILIATES_ENABLED", "true");
    expect(publishedPolicySlugs()).toContain("affiliate-agreement");
    const element = await PolicySlugPage(params("en", "affiliate-agreement"));
    expect(notFound).not.toHaveBeenCalled();
    expect(element.props.doc.title).toMatch(/Affiliate/);
  });

  it("calls notFound() for an unknown slug", async () => {
    await expect(PolicySlugPage(params("en", "not-a-policy"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("renders a known slug without calling notFound()", async () => {
    const element = await PolicySlugPage(params("vi", "refund"));
    expect(notFound).not.toHaveBeenCalled();
    expect(element.props.doc.title).toBe("Chính sách hoàn tiền");
    expect(element.props.lastUpdated).toBe("2026-10-31");
    expect(element.props.showToc).toBe(true);
  });

  it("builds metadata per slug and noindex for unknown slugs", async () => {
    const known = await generateMetadata(params("en", "terms"));
    expect(known.title).toBe("Terms of Service");
    const unknown = await generateMetadata(params("en", "nope"));
    expect(unknown.robots).toEqual({ index: false });
  });
});

describe("policy content parser", () => {
  it("groups bullets and numbered steps into lists and keeps paragraphs", () => {
    const blocks = parsePolicyContent("Intro line\n\nAccepted:\n• one\n• two\n\n1. first\n2. second\nOutro");
    expect(blocks).toEqual([
      { kind: "p", text: "Intro line" },
      { kind: "p", text: "Accepted:" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "ol", items: ["first", "second"] },
      { kind: "p", text: "Outro" },
    ]);
  });

  it("starts a new list after a blank line", () => {
    const blocks = parsePolicyContent("• a\n\n• b");
    expect(blocks).toEqual([
      { kind: "ul", items: ["a"] },
      { kind: "ul", items: ["b"] },
    ]);
  });
});
