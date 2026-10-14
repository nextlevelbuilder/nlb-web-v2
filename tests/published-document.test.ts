import { describe, expect, it } from "vitest";
import { publishedCoverUrl, publishedDocument } from "@/lib/domain/published-document";
import { productMarkdown } from "@/lib/markdown/product-markdown";
import type { productRevisions } from "@/lib/db/schema";

describe("Legacy published document reading", () => {
  it("exports nested seed metadata and persisted revision fields without modifying source content", () => {
    const raw = { schemaVersion: 1, metadata: { title: "Tool", tagline: "Existing tagline", websiteUrl: "https://tool.test", logoUrl: "https://tool.test/logo.png" }, blocks: [{ id: "hero", type: "hero", props: { headline: "Existing headline" } }] };
    const revision = { title: "Tool", tagline: "Existing tagline", description: "Stored description", categoriesSnapshot: JSON.stringify(["tools"]), tagsSnapshot: JSON.stringify(["ai"]), document: JSON.stringify(raw), contentHash: "original-hash" } as unknown as typeof productRevisions.$inferSelect;
    const result = publishedDocument(revision);
    expect(result).toMatchObject({ title: "Tool", websiteUrl: "https://tool.test", description: "Stored description", categorySlugs: ["tools"], tagSlugs: ["ai"], blocks: raw.blocks });
    const markdown = productMarkdown(result, "https://example.test/products/tool");
    expect(markdown).toContain("# Tool");
    expect(markdown).toContain("Stored description");
    expect(markdown).toContain("Existing headline");
    expect(revision.document).toBe(JSON.stringify(raw));
    expect(revision.contentHash).toBe("original-hash");
  });

  it("leaves current top-level documents unchanged", () => {
    const document = { schemaVersion: 1, title: "Current", tagline: "Tagline", description: "Description", websiteUrl: "https://current.test", categorySlugs: [], tagSlugs: [], blocks: [] };
    expect(publishedDocument({ document } as typeof productRevisions.$inferSelect)).toBe(document);
  });
});

describe("Published cover image", () => {
  const gallery = (images: unknown) => ({ id: "g", type: "mediaGallery", props: { images } });

  it("returns the first image of the first mediaGallery block", () => {
    const blocks = [
      { id: "hero", type: "hero", props: { headline: "Tool" } },
      gallery([{ url: "https://cdn.test/one.webp", aspectRatio: "16:9" }, { url: "https://cdn.test/two.webp" }]),
      gallery([{ url: "https://cdn.test/later.webp" }]),
    ];
    expect(publishedCoverUrl({ blocks } as never)).toBe("https://cdn.test/one.webp");
  });

  it("returns null without a gallery, with an empty gallery or with a malformed document", () => {
    expect(publishedCoverUrl({ blocks: [{ id: "hero", type: "hero", props: { headline: "Tool" } }] } as never)).toBeNull();
    expect(publishedCoverUrl({ blocks: [gallery([])] } as never)).toBeNull();
    expect(publishedCoverUrl({ blocks: [{ id: "g", type: "mediaGallery" }] } as never)).toBeNull();
    expect(publishedCoverUrl({} as never)).toBeNull();
    expect(publishedCoverUrl(null)).toBeNull();
  });

  it("does not use the next gallery when the first one starts with an unusable URL", () => {
    expect(publishedCoverUrl({ blocks: [gallery([{ url: "javascript:alert(1)" }]), gallery([{ url: "https://cdn.test/x.webp" }])] } as never)).toBeNull();
    expect(publishedCoverUrl({ blocks: [gallery([{ url: 42 }])] } as never)).toBeNull();
  });
});
