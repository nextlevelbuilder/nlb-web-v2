import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { DEFAULT_BLOCK_LABELS, numberedLabel } from "@/components/blocks/block-labels";
import { blockDomId } from "@/components/blocks/block-section";
import { bareXHandle } from "@/components/blocks/founder-block";
import { groupTechnologies } from "@/components/blocks/tech-stack-block";
import type { Block } from "@/packages/contracts/src";

const blocks = [
  { id: "hero-1", type: "hero", props: { headline: "Ship faster", subheadline: "Sub", primaryCtaText: "Try", primaryCtaUrl: "https://tool.test" } },
  { id: "gallery-1", type: "mediaGallery", props: { images: [
    { url: "https://tool.test/1.webp", caption: "Lead shot", aspectRatio: "16:9" },
    { url: "https://tool.test/2.webp", aspectRatio: "16:9" },
  ] } },
  { id: "faq-1", type: "faq", props: { items: [{ question: "Is it free?", answer: "Yes." }] } },
  { id: "pricing-1", type: "pricing", props: { tiers: [{ name: "Open source", price: "Free", features: ["MIT license"], ctaText: "Self-host", isPopular: false }] } },
  { id: "founder-1", type: "founder", props: { name: "Ana", bio: "Builder", xHandle: "@ana" } },
] as Block[];

describe("Constellation product blocks", () => {
  const html = renderToStaticMarkup(createElement(BlockRenderer, { blocks, labels: { faq: "Câu hỏi thường gặp" } }));

  it("renders the gallery as a lead figure plus linked thumbnails with intrinsic sizes and lazy loading", () => {
    expect(html).toContain('<figure class="blk-gallery-lead surface">');
    expect(html).toMatch(/<img src="https:\/\/tool.test\/1.webp" alt="Lead shot" width="1600" height="900" loading="lazy"/);
    expect(html).toContain('href="https://tool.test/2.webp"');
    expect(html).toContain('alt="Screenshot 2"');
  });

  it("uses native details for the FAQ and localised kickers as section headings", () => {
    expect(html).toContain("<details");
    expect(html).toContain("<summary>");
    expect(html).toContain('id="blk-faq-1-title"');
    expect(html).toContain("Câu hỏi thường gặp");
    expect(html).not.toContain("<h1");
  });

  it("renders a CTA without a destination as a note, not a dead button", () => {
    expect(html).toContain('<p class="blk-tier-note mono">Self-host</p>');
    expect(html).not.toContain("<button");
  });

  it("links the maker's X profile from a normalised handle", () => {
    expect(html).toContain('href="https://x.com/ana"');
  });
});

describe("Block helpers", () => {
  it("normalises X handles and rejects anything that is not a handle", () => {
    expect(bareXHandle("@ana_b")).toBe("ana_b");
    expect(bareXHandle("https://x.com/ana")).toBe("ana");
    expect(bareXHandle("https://twitter.com/@ana/")).toBe("ana");
    expect(bareXHandle("javascript:alert(1)")).toBeNull();
    expect(bareXHandle(undefined)).toBeNull();
  });

  it("groups technologies by category in first-seen order", () => {
    expect(groupTechnologies([
      { name: "TypeScript", category: "Language" },
      { name: "D1", category: "Data" },
      { name: "Rust", category: "Language" },
    ])).toEqual([{ category: "Language", names: ["TypeScript", "Rust"] }, { category: "Data", names: ["D1"] }]);
  });

  it("builds safe DOM ids and fills numbered labels", () => {
    expect(blockDomId("hero 1/x", "title")).toBe("blk-hero-1-x-title");
    expect(numberedLabel(DEFAULT_BLOCK_LABELS.imageAlt, 3)).toBe("Screenshot 3");
  });
});
