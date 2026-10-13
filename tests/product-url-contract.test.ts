import { describe, expect, it, vi } from "vitest";
import { ProductDocumentSchema } from "@/packages/contracts/src/product-document";
import { BlockSchema } from "@/packages/contracts/src/blocks";
import { POST } from "@/app/api/v1/products/route";

vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: vi.fn(async () => ({ user: { id: "builder" } })) }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => { throw new Error("Database must not be reached for an invalid URL"); }) }));

const document = { title: "Product", tagline: "Product tagline", description: "An actual product description.", websiteUrl: "https://product.example", categorySlugs: ["developer-tools"], blocks: [] };

describe("public product URL contract", () => {
  it.each(["javascript:alert(1)", "data:text/html,bad", "ftp://example.com", "mailto:test@example.com"])("rejects %s in document and direct REST draft creation", async (url) => {
    expect(ProductDocumentSchema.safeParse({ ...document, websiteUrl: url }).success).toBe(false);
    expect(ProductDocumentSchema.safeParse({ ...document, logoUrl: url }).success).toBe(false);
    const response = await POST(new Request("https://nextlevelbuilder.io/api/v1/products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "org", slug: "product", title: document.title, tagline: document.tagline, websiteUrl: url }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");
  });

  it.each([
    { type: "hero", props: { headline: "Product", primaryCtaUrl: "javascript:alert(1)" } },
    { type: "cta", props: { title: "Product", buttonText: "Open", buttonUrl: "javascript:alert(1)" } },
    { type: "liveDemo", props: { embedUrl: "data:text/html,bad" } },
    { type: "pricing", props: { tiers: [{ name: "Free", price: "$0", features: [], ctaText: "Open", ctaUrl: "javascript:alert(1)" }] } },
    { type: "mediaGallery", props: { images: [{ url: "ftp://example.com/image.png" }] } },
    { type: "founder", props: { name: "Founder", bio: "Builder", linkedinUrl: "javascript:alert(1)" } },
    { type: "activities", props: { entries: [{ date: "2026-09-12", title: "Update", url: "javascript:alert(1)" }] } },
  ])("rejects unsafe rendered URLs in $type blocks", block => {
    expect(BlockSchema.safeParse({ id: "test", ...block }).success).toBe(false);
  });

  it("keeps HTTP and HTTPS product links valid", () => {
    expect(ProductDocumentSchema.safeParse(document).success).toBe(true);
    expect(ProductDocumentSchema.safeParse({ ...document, websiteUrl: "http://product.example" }).success).toBe(true);
  });
});
