import { describe, expect, it, vi } from "vitest";
import { markdownSourcePath, pagePath } from "@/lib/markdown/page-paths";
import { htmlToMarkdown } from "@/lib/markdown/html-to-markdown";
import { fetchPageMarkdown } from "@/lib/markdown/page-markdown";
import { productMarkdown } from "@/lib/markdown/product-markdown";
import type { ProductDocument } from "@/packages/contracts/src";

describe("Markdown page representations", () => {
  it("supports index aliases for both languages", () => {
    expect(markdownSourcePath("/index.md")).toEqual({ path: "/", pathname: "/", locale: "en" });
    expect(markdownSourcePath("/vi/index.md")).toEqual({ path: "/", pathname: "/vi", locale: "vi" });
    expect(markdownSourcePath("/en/index.md")).toEqual({ path: "/", pathname: "/", locale: "en" });
    expect(markdownSourcePath("/directory.md")).toEqual({ path: "/build-with-us", pathname: "/build-with-us", locale: "en" });
    expect(markdownSourcePath("/vi/directory.md")).toEqual({ path: "/build-with-us", pathname: "/vi/build-with-us", locale: "vi" });
  });
  it.each(["/.md", "/en.md", "/vi.md", "/build-with-us.md", "/en/build-with-us/instructions.md", "/policies/onboarding.md", "/products/tool.md", "/en/builders/id.md", "/account.md", "/profile.md", "/studio.md", "/en/studio/products/tool/preview.md", "/sign-in.md", "/sign-up.md", "/success.md", "/api-docs.md", "/docs/api.md"])("recognizes page %s", (path) => {
    expect(markdownSourcePath(path)).not.toBeNull();
  });

  it.each(["/api/checkout.md", "/api/auth/callback/github.md", "/api/markdown.md", "/go/tool.md", "/unknown.md", "/policies/unknown.md", "/en/unknown.md", "/%2f%2fevil.test.md", "//evil.test.md", "/studio/../api.md", "/products/%2e%2e.md", "/products/foo?bar.md", "/fr/account.md"])("rejects non-page or unsafe path %s", (path) => {
    expect(markdownSourcePath(path)).toBeNull();
  });

  it("retains HTML semantics and entity text while dropping scripts, styles and RSC data", async () => {
    const result = await htmlToMarkdown('<html><head><title>Site</title><script>secret-rsc</script></head><body><h1>A &amp; B</h1><p>Hello <strong>world</strong>.</p><ul><li>First</li><li>Second</li></ul><a href="/policies">Rules</a><img src="/logo.png" alt="Logo"><style>hidden-css</style><script>window.__next_f.push("private-rsc")</script></body></html>', "https://example.test/en/account");
    expect(result).toContain("# A & B");
    expect(result).toContain("**world**");
    expect(result).toContain("- First");
    expect(result).toContain("[Rules](https://example.test/policies)");
    expect(result).toContain("![Logo](https://example.test/logo.png)");
    expect(result).not.toMatch(/secret-rsc|private-rsc|hidden-css/);
  });

  it("converts HTML tables to GFM tables instead of failing the page", async () => {
    const result = await htmlToMarkdown("<table><thead><tr><th>Tool</th><th>License</th></tr></thead><tbody><tr><td>anymd</td><td>MIT</td></tr></tbody></table>", "https://example.test/blog/post");
    expect(result).toContain("| Tool  | License |");
    expect(result).toContain("| anymd | MIT     |");
  });

  it("forwards the session only to allowed same-origin pages and makes rendering read-only", async () => {
    const fetcher = vi.fn(async () => new Response("<main><h1>My account</h1><p>Private org</p></main>", { headers: { "Content-Type": "text/html" } }));
    const result = await fetchPageMarkdown("https://example.test", "/en/account", "?tab=orders", new Headers({ cookie: "better-auth.session_token=private; NEXT_LOCALE=vi", authorization: "Bearer secret" }), fetcher);
    expect(result.status).toBe(200);
    expect(result.body).toContain("Private org");
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("https://example.test/account?tab=orders");
    expect(new Headers(options.headers).get("cookie")).toContain("better-auth.session_token=private");
    expect(new Headers(options.headers).get("cookie")).toContain("NEXT_LOCALE=en");
    expect(new Headers(options.headers).get("x-nlb-markdown")).toBe("1");
    // Keeps the next-intl locale rewrite internal when rendered through a service binding.
    expect(new Headers(options.headers).get("host")).toBe("example.test");
    expect(options).toMatchObject({ redirect: "manual", cache: "no-store" });
  });

  it.each(["https://evil.test/account", "//evil.test/account", "/api/checkout", "/go/tool", "/api/markdown?path=/account.md"])("never follows unsafe redirect %s", async (location) => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location } }));
    expect((await fetchPageMarkdown("https://example.test", "/account", "", new Headers({ cookie: "private" }), fetcher)).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit and streamed not-found responses", async () => {
    for (const response of [new Response("Not found", { status: 404 }), new Response('<html><script>NEXT_HTTP_ERROR_FALLBACK;404</script></html>', { headers: { "content-type": "text/html" } })]) {
      const result = await fetchPageMarkdown("https://example.test", "/products/missing", "", new Headers(), vi.fn(async () => response));
      expect(result.status).toBe(404);
    }
  });

  it("follows a safe locale redirect and preserves authorization failures", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "/en/profile" } })).mockResolvedValueOnce(new Response("Denied", { status: 403 }));
    const result = await fetchPageMarkdown("https://example.test", "/profile", "", new Headers(), fetcher);
    expect(result.status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("includes all product blocks and nested entries, not only initially visible UI", () => {
    const document: ProductDocument = {
      schemaVersion: 1, title: "Approved tool", tagline: "Published tagline", description: "Full description", websiteUrl: "https://tool.test", categorySlugs: ["tools"], tagSlugs: [],
      blocks: [
        { id: "faq", type: "faq", props: { items: [{ question: "Hidden question", answer: "Complete hidden answer" }] } },
        { id: "carousel", type: "carousel", props: { items: [{ title: "First slide", imageUrl: "https://tool.test/1.png" }, { title: "Last slide", description: "Second full description", imageUrl: "https://tool.test/2.png" }] } },
        { id: "activity", type: "activities", props: { entries: [{ date: "2025-01-01", title: "Older entry" }, { date: "2026-01-01", title: "Newer entry" }] } },
        { id: "traffic", type: "analytics", props: { title: "Traffic", period: "7d" } },
      ],
    };
    const result = productMarkdown(document, "https://example.test/products/tool");
    expect(result).toContain("Complete hidden answer");
    expect(result).toContain("Last slide");
    expect(result).toContain("https://tool.test/2.png");
    expect(result).toContain("https://example.test/api/v1/products/tool/traffic/public?period=7d");
    expect(result.indexOf("Newer entry")).toBeLessThan(result.indexOf("Older entry"));
    expect(pagePath("/en/products/tool")?.locale).toBe("en");
  });
});
