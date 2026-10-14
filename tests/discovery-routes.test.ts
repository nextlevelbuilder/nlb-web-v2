import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageMetadata, serializeJsonLd } from "@/lib/seo";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { GET as markdown } from "@/app/api/markdown/route";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as llmsFull } from "@/app/llms-full.txt/route";
import { GET as legacyProductMarkdown } from "@/app/api/v1/products/[slug]/markdown/route";
import { getAllPublishedProducts, getPublishedProductBySlug } from "@/lib/domain/catalog";
import { fetchPageMarkdown } from "@/lib/markdown/page-markdown";

vi.mock("@/lib/domain/catalog", () => ({ getAllPublishedProducts: vi.fn(), getPublishedProductBySlug: vi.fn() }));
vi.mock("@/lib/markdown/page-markdown", () => ({ fetchPageMarkdown: vi.fn() }));

const document = { schemaVersion: 1 as const, title: "Approved tool", tagline: "Public", description: "Full published description", websiteUrl: "https://tool.test", categorySlugs: ["tools"], tagSlugs: [], blocks: [{ id: "faq", type: "faq" as const, props: { items: [{ question: "Question", answer: "Full answer" }] } }] };
const published = { slug: "tool", title: "Approved tool", tagline: "Public", trustScore: 74, votesCount: 5, updatedAt: new Date("2026-01-01T00:00:00Z"), publishedDocument: document };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
  vi.mocked(getAllPublishedProducts).mockResolvedValue([published] as unknown as Awaited<ReturnType<typeof getAllPublishedProducts>>);
  vi.mocked(fetchPageMarkdown).mockResolvedValue({ status: 200, body: "# Complete page\n\nActual page content\n" });
});

describe("Discovery metadata and routes", () => {
  it("has locale-specific canonicals instead of inheriting the home canonical", () => {
    const meta = pageMetadata({ title: "Tool", description: "Description", locale: "en", path: "/products/tool" });
    expect(meta.alternates?.canonical).toBe("https://example.test/products/tool");
    expect(meta.alternates?.languages).toMatchObject({ vi: "https://example.test/vi/products/tool", en: "https://example.test/products/tool", "x-default": "https://example.test/products/tool" });
    expect(pageMetadata({ title: "Home", description: "Home", path: "/", locale: "en" }).alternates?.types).toEqual({ "text/markdown": "https://example.test/index.md" });
    expect(pageMetadata({ title: "Home", description: "Home", path: "/", locale: "vi" }).alternates?.types).toEqual({ "text/markdown": "https://example.test/vi.md" });
    expect(serializeJsonLd({ title: "</script><script>alert(1)</script>" })).not.toContain("<");
  });

  it("uses actual catalog timestamps, both locales, and correct directory URL", async () => {
    const entries = await sitemap();
    expect(entries.some((entry) => entry.url.endsWith("/build-with-us"))).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/directory"))).toBe(false);
    expect(entries.find((entry) => entry.url === "https://example.test/vi/products/tool")?.lastModified).toEqual(published.updatedAt);
    // Listing pages take the newest change of what they list; pages without a content date get no lastmod.
    expect(entries.find((entry) => entry.url === "https://example.test/")?.lastModified).toEqual(published.updatedAt);
    expect(entries.find((entry) => entry.url === "https://example.test/build-with-us")?.lastModified).toEqual(published.updatedAt);
    expect(entries.find((entry) => entry.url === "https://example.test/build-with-us/instructions")).not.toHaveProperty("lastModified");
    expect(entries.find((entry) => entry.url === "https://example.test/policies/privacy")?.lastModified).toBeInstanceOf(Date);
    expect(entries.some((entry) => entry.url.endsWith("/account"))).toBe(false);
  });

  it("excludes private locale routes in robots while referencing the sitemap", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://example.test/sitemap.xml");
    expect(JSON.stringify(result.rules)).toContain("/en/studio");
    expect(JSON.stringify(result.rules)).toContain("/vi/account");
  });

  it("handles original rewritten URLs, preserves sessions, and never publicly caches Markdown", async () => {
    const response = await markdown(new Request("https://example.test/en/account.md?tab=orders", { headers: { cookie: "session=private" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(fetchPageMarkdown).toHaveBeenCalledWith("https://example.test", "/account", "?tab=orders", expect.any(Headers));
    expect(vi.mocked(fetchPageMarkdown).mock.calls[0][3].get("cookie")).toBe("session=private");
  });

  it("serves full approved product documents without fetching an arbitrary source", async () => {
    vi.mocked(getPublishedProductBySlug).mockResolvedValue({ product: published, revision: { document } } as unknown as NonNullable<Awaited<ReturnType<typeof getPublishedProductBySlug>>>);
    const response = await markdown(new Request("https://example.test/products/tool.md"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Full answer");
    expect(body).toContain("Trust Score: 74/100");
    expect(body).toContain("Organic votes: 5");
    expect(fetchPageMarkdown).not.toHaveBeenCalled();
    const legacy = await legacyProductMarkdown(new Request("https://example.test/api/v1/products/tool/markdown"), { params: Promise.resolve({ slug: "tool" }) });
    const legacyBody = await legacy.text();
    expect(legacyBody).toContain("Full answer");
    expect(legacyBody).toContain("Trust Score: 74/100");
    expect(legacyBody).toContain("Organic votes: 5");
  });

  it("rejects unknown routes before fetching and preserves unknown product 404", async () => {
    const response = await markdown(new Request("https://example.test/api/checkout.md"));
    expect(response.status).toBe(404);
    expect(fetchPageMarkdown).not.toHaveBeenCalled();
    vi.mocked(getPublishedProductBySlug).mockResolvedValue(null);
    expect((await markdown(new Request("https://example.test/products/missing.md"))).status).toBe(404);
  });

  it("provides a real index and full pages plus complete block content", async () => {
    const index = await llms();
    const indexBody = await index.text();
    expect(indexBody).toContain("[Approved tool](https://example.test/products/tool.md)");
    expect(indexBody).toContain("Trust Score: 74/100");
    const full = await llmsFull();
    const body = await full.text();
    expect(body).toContain("Actual page content");
    expect(body).toContain("Full published description");
    expect(body).toContain("Full answer");
    expect(body).toContain("Trust Score: 74/100");
    expect(body).toContain("Organic votes: 5");
    expect(vi.mocked(fetchPageMarkdown).mock.calls.every((call) => call[3].get("cookie") === null)).toBe(true);
  });

  it("does not publish a successful empty index or truncated full document during failures", async () => {
    vi.mocked(getAllPublishedProducts).mockRejectedValueOnce(new Error("DB unavailable"));
    expect((await llms()).status).toBe(503);
    vi.mocked(fetchPageMarkdown).mockResolvedValueOnce({ status: 502, body: "Unavailable" });
    const full = await llmsFull();
    expect(full.status).toBe(503);
    expect(full.headers.get("cache-control")).toBe("no-store");
  });
});
