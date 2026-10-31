import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { markdownSourcePath } from "@/lib/markdown/page-paths";
import { renderApiReference } from "@/lib/api-reference";
import { blogIndexMetadata } from "@/lib/blog/blog-seo";
import { defaultOgImage, pageMetadata, siteUrl } from "@/lib/seo";

describe("markdown twins for blog and courses", () => {
  it("serves the blog and course index twins in both locales", () => {
    expect(markdownSourcePath("/blog.md")).toEqual({ path: "/blog", pathname: "/blog", locale: "en" });
    expect(markdownSourcePath("/vi/blog.md")).toEqual({ path: "/blog", pathname: "/vi/blog", locale: "vi" });
    expect(markdownSourcePath("/courses.md")).toEqual({ path: "/courses", pathname: "/courses", locale: "en" });
    expect(markdownSourcePath("/vi/courses/agent-loop-101.md")).toEqual({ path: "/courses/agent-loop-101", pathname: "/vi/courses/agent-loop-101", locale: "vi" });
    expect(markdownSourcePath("/blog/shipping-week-1.md")?.pathname).toBe("/blog/shipping-week-1");
  });

  it("rejects slugs outside the kebab-case rule and nested paths", () => {
    for (const path of ["/blog/Upper.md", "/blog/a_b.md", "/blog/a/b.md", "/courses/-x.md", "/blog/..md", "/courses/a--b.md"]) {
      expect(markdownSourcePath(path), path).toBeNull();
    }
  });
});

describe("social metadata", () => {
  it("leaves page images to the generated opengraph-image routes", () => {
    // Config images beat file-based ones in Next metadata, so pinning a static card would hide the generated card.
    const page = pageMetadata({ title: "T", description: "D", path: "/courses", locale: "en" });
    expect(page.openGraph?.images).toBeUndefined();
    expect(page.twitter).toMatchObject({ card: "summary_large_image" });
    expect(defaultOgImage().alt.length).toBeGreaterThan(10);
    const blog = blogIndexMetadata("vi");
    expect(blog.openGraph?.images).toBeUndefined();
    expect(blog.twitter).toMatchObject({ card: "summary_large_image" });
    expect(blog.alternates?.types).toEqual({ "text/markdown": `${siteUrl()}/vi/blog.md` });
  });

  it("ships an opengraph-image route next to every public page that sets its own metadata", () => {
    const publicPages = ["", "courses", "courses/[slug]", "blog", "blog/[slug]", "products/[slug]", "policies", "policies/[slug]", "leaderboards", "build-with-us", "builders/[id]", "affiliates"];
    for (const dir of publicPages) {
      expect(existsSync(join(process.cwd(), "app/[locale]", dir, "opengraph-image.tsx")), dir || "home").toBe(true);
    }
  });

  it("renders the API reference with an environment canonical, social card and JSON-LD", () => {
    const html = renderApiReference();
    expect(html).toContain(`<link rel="canonical" href="${siteUrl()}/api-docs">`);
    expect(html).toContain('<meta property="og:image" content="');
    expect(html).toContain('<meta property="og:image:alt" content="');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain("Builder League (<code>/api/v1/builder-*</code>)");
    expect(html).toContain("<code>builder:render</code>");
    expect(html).toContain("Pilot only: while BUILDER_LEAGUE_ENABLED is off");
    const jsonLd = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1];
    expect(JSON.parse(jsonLd ?? "null")).toMatchObject({ "@type": "TechArticle", url: `${siteUrl()}/api-docs` });
  });
});
