import { beforeEach, describe, expect, it, vi } from "vitest";
import { breadcrumbJsonLd, courseJsonLd, founderByName, parseTierPrice, productJsonLd, siteGraphJsonLd } from "@/lib/structured-data";
import { aiCatalog, apiCatalogLinkset, mcpServerCard, mcpEndpoint } from "@/lib/discovery/agent-discovery-documents";
import { discoveryLinkHeader } from "@/lib/discovery/discovery-link-header";
import { clampText, starField, titleFontSize } from "@/lib/og/constellation-og-card";
import { fontUrlFromCss, googleFontCssUrl, uniqueGlyphs } from "@/lib/og/og-google-fonts";
import { markdownPath } from "@/lib/seo";
import { blogIndexJsonLd, blogPostJsonLd, blogPostMetadata } from "@/lib/blog/blog-seo";
import type { BlogPost } from "@/lib/blog/blog-types";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
});

type GraphNode = Record<string, unknown> & { "@type": string };
const graphOf = (value: Record<string, unknown>) => value["@graph"] as GraphNode[];

describe("site graph", () => {
  it("links the organization, website search and founders by @id", () => {
    const graph = graphOf(siteGraphJsonLd("vi"));
    const org = graph.find((node) => node["@type"] === "Organization")!;
    const site = graph.find((node) => node["@type"] === "WebSite")!;
    const people = graph.filter((node) => node["@type"] === "Person");
    expect(org["@id"]).toBe("https://example.test/#organization");
    expect(people.map((person) => person.name)).toEqual(["Duy Nguyen", "Cuong Vo", "Viet Tran"]);
    expect(org.founder).toEqual(people.map((person) => ({ "@id": person["@id"] })));
    expect(JSON.stringify(site.potentialAction)).toContain("https://example.test/vi/build-with-us?q={search_term_string}");
    const duy = people[0];
    expect(duy.sameAs).toEqual(["https://zuey.me", "https://digitop.ai", "https://wearetopgroup.com", "https://facebook.com/mrgoonie", "https://x.com/goon_nguyen"]);
    expect(duy.alternateName).toBe("Duy Nguyen /zuey/");
    expect(duy.jobTitle).toContain("Đồng sáng lập");
  });

  it("builds localized breadcrumbs", () => {
    const crumbs = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }], "vi");
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://example.test/vi" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://example.test/vi/blog" },
    ]);
  });
});

describe("product and course structured data", () => {
  it("parses only plainly stated prices", () => {
    expect(parseTierPrice("Free")).toEqual({ amount: 0, currency: "USD" });
    expect(parseTierPrice("$19")).toEqual({ amount: 19, currency: "USD" });
    expect(parseTierPrice("490000 VND")).toEqual({ amount: 490000, currency: "VND" });
    expect(parseTierPrice("Contact us")).toBeNull();
    expect(parseTierPrice("$19 / seat, billed yearly")).toBeNull();
  });

  it("emits offers only when every tier has a price, and links founder makers", () => {
    const base = { title: "Tool", tagline: "Does things", websiteUrl: "https://tool.test", slug: "tool", locale: "en" };
    const priced = productJsonLd({ ...base, pricingTiers: [{ name: "OSS", price: "Free" }, { name: "Pro", price: "$9" }], makers: [{ name: "Duy Nguyen" }, { name: "Ana", xHandle: "@ana" }] });
    expect(priced.offers).toHaveLength(2);
    expect(priced.author).toEqual([
      { "@id": "https://example.test/#person-duy", "@type": "Person", name: "Duy Nguyen" },
      { "@type": "Person", name: "Ana", sameAs: ["https://x.com/ana"] },
    ]);
    expect(productJsonLd({ ...base, pricingTiers: [{ name: "OSS", price: "Free" }, { name: "Team", price: "Talk to us" }] })).not.toHaveProperty("offers");
    expect(productJsonLd(base)).not.toHaveProperty("offers");
  });

  it("describes a course with its real price", () => {
    const course = courseJsonLd({ slug: "agent-loop", title: "Agent loop", description: "", locale: "vi", priceCents: 1900, currency: "usd", durationSec: 1500 });
    expect(course.url).toBe("https://example.test/vi/courses/agent-loop");
    expect(course.offers).toMatchObject({ price: 19, priceCurrency: "USD", category: "Paid" });
    expect(course.isAccessibleForFree).toBe(false);
    expect(course.hasCourseInstance).toMatchObject({ courseMode: "Online", courseWorkload: "PT25M" });
  });

  it("matches founders by name case-insensitively", () => {
    expect(founderByName("  duy nguyen ")?.id).toBe("duy");
    expect(founderByName("Someone Else")).toBeNull();
    expect(founderByName(null)).toBeNull();
  });
});

describe("blog post SEO", () => {
  const post: BlogPost = {
    id: "p1", locale: "en", slug: "hello-world", title: "Hello world", description: "First post", coverUrl: null,
    blocks: [{ id: "b1", type: "rich-text", props: { markdown: "word ".repeat(450) } }] as unknown as BlogPost["blocks"],
    tags: ["launch"], seo: {}, authorName: "Duy Nguyen", status: "published", translationKey: "hello", publishedAt: "2026-10-14T00:00:00.000Z",
    version: 1, createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z",
  };

  it("links the founder author, falls back to the generated card and adds breadcrumbs", () => {
    const graph = graphOf(blogPostJsonLd(post));
    const article = graph.find((node) => node["@type"] === "BlogPosting")!;
    expect(article.author).toMatchObject({ "@id": "https://example.test/#person-duy", name: "Duy Nguyen" });
    expect(article.image).toBe("https://example.test/blog/hello-world/opengraph-image");
    expect(article.timeRequired).toBe("PT2M");
    expect(graph.find((node) => node["@type"] === "BreadcrumbList")).toBeTruthy();
  });

  it("lists index posts in a Blog node with breadcrumbs", () => {
    const graph = graphOf(blogIndexJsonLd("vi", [{ ...post, locale: "vi", slug: "xin-chao" }]));
    const blog = graph.find((node) => node["@type"] === "Blog")!;
    expect(blog.url).toBe("https://example.test/vi/blog");
    expect(blog.publisher).toEqual({ "@id": "https://example.test/#organization" });
    expect(blog.blogPost).toEqual([expect.objectContaining({ "@id": "https://example.test/vi/blog/xin-chao#article", headline: "Hello world" })]);
    expect(graph.find((node) => node["@type"] === "BreadcrumbList")).toBeTruthy();
  });

  it("uses English as x-default and only pins an image the author chose", () => {
    const translation = { ...post, locale: "vi" as const, slug: "xin-chao" };
    const meta = blogPostMetadata(post, translation);
    expect(meta.alternates?.languages).toMatchObject({ "x-default": "https://example.test/blog/hello-world", vi: "https://example.test/vi/blog/xin-chao" });
    expect(meta.openGraph).not.toHaveProperty("images");
    const custom = blogPostMetadata({ ...post, seo: { ogImage: "/images/card.png" } }, null);
    expect(custom.openGraph?.images).toEqual([{ url: "https://example.test/images/card.png", alt: "Hello world" }]);
  });
});

describe("agent discovery documents", () => {
  it("publishes an MCP server card for the live endpoint", () => {
    const card = mcpServerCard();
    expect(card.$schema).toBe("https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
    expect(card.remotes).toEqual([{ type: "streamable-http", url: mcpEndpoint(), supportedProtocolVersions: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] }]);
    expect(JSON.stringify(card._meta)).toContain("https://example.test/api/openapi.json");
  });

  it("lists the card and OpenAPI in the AI catalog and the RFC 9727 linkset", () => {
    const catalog = aiCatalog();
    expect(catalog.entries.map((entry) => entry.type)).toEqual(["application/mcp-server-card+json", "application/vnd.oai.openapi+json", "text/plain", "text/plain"]);
    expect(catalog.entries[0].identifier).toBe("urn:air:example.test:mcp:directory");
    expect(apiCatalogLinkset().linkset[0]["service-desc"][0].href).toBe("https://example.test/api/openapi.json");
  });

  it("advertises discovery links in one header value", () => {
    const header = discoveryLinkHeader();
    for (const fragment of ['</llms.txt>; rel="alternate"', '</api/openapi.json>; rel="service-desc"', '</.well-known/api-catalog>; rel="api-catalog"', '</.well-known/mcp.json>; rel="describedby"']) {
      expect(header).toContain(fragment);
    }
  });

  it("points the home markdown twin at /index.md", () => {
    expect(markdownPath("/", "en")).toBe("/index.md");
    expect(markdownPath("/", "vi")).toBe("/vi.md");
    expect(markdownPath("/blog", "vi")).toBe("/vi/blog.md");
  });
});

describe("social card helpers", () => {
  it("clamps on word boundaries and scales long titles down", () => {
    expect(clampText("short", 10)).toBe("short");
    expect(clampText("Launch your product from the terminal with the CLI", 30)).toBe("Launch your product from the…");
    expect(titleFontSize("x".repeat(20))).toBeGreaterThan(titleFontSize("x".repeat(100)));
  });

  it("draws a deterministic star field inside the card", () => {
    const stars = starField("seed");
    expect(stars).toEqual(starField("seed"));
    expect(stars).not.toEqual(starField("other"));
    expect(stars.every((star) => star.x >= 0 && star.x <= 1200 && star.y >= 0 && star.y <= 630)).toBe(true);
  });

  it("subsets Google Fonts to the card glyphs and reads the TTF source", () => {
    const url = googleFontCssUrl({ family: "Cormorant Garamond", weight: 400, style: "italic" }, "Xin chào");
    expect(url).toContain("family=Cormorant+Garamond:ital,wght@1,400");
    expect(decodeURIComponent(url)).toContain("à");
    expect(uniqueGlyphs("aaa").split("a")).toHaveLength(2);
    expect(fontUrlFromCss("@font-face { src: url(https://fonts.gstatic.com/x.ttf) format('truetype'); }")).toBe("https://fonts.gstatic.com/x.ttf");
    expect(fontUrlFromCss("@font-face { src: url(https://fonts.gstatic.com/x.woff2) format('woff2'); }")).toBeNull();
  });
});
