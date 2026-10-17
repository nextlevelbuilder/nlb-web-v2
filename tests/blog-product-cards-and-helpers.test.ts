import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlogBlocks } from "@/components/blog/blog-block-renderers";
import { getBlockSchema, listBlockDefinitions, validateBlocks } from "@/lib/blog/blocks/registry";
import { authorKey, resolveBlogAuthor } from "@/lib/blog/blog-authors";
import { buildShareLinks } from "@/lib/blog/blog-share-links";
import { lensVariant, seedFrom, skyCoordinate } from "@/lib/blog/blog-sky-seed";
import { htmlToMarkdown } from "@/lib/markdown/html-to-markdown";

const item = { name: "AK Render", tagline: "HTML pages for coding agents.", href: "/products/ak-render" };
const schema = getBlockSchema("product-cards");

describe("product-cards block schema", () => {
  it("accepts the catalogue example and serves it from the registry", () => {
    const definition = listBlockDefinitions().find((d) => d.type === "product-cards");
    expect(definition?.category).toBe("section");
    expect(schema.safeParse(definition?.example.props).success).toBe(true);
    expect(definition?.propsSchema).toMatchObject({ type: "object", required: ["items"] });
  });

  it("rejects unsafe hrefs and images, too many items, too many tags and unknown keys", () => {
    expect(schema.safeParse({ items: [{ ...item, href: "javascript:alert(1)" }] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ ...item, href: "//evil.example" }] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ ...item, logo: "http://insecure.example/logo.png" }] }).success).toBe(false);
    expect(schema.safeParse({ items: Array.from({ length: 7 }, () => item) }).success).toBe(false);
    expect(schema.safeParse({ items: [] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ ...item, tags: ["a", "b", "c", "d", "e", "f", "g"] }] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ ...item, price: 9 }] }).success).toBe(false);
    expect(schema.safeParse({ items: Array.from({ length: 6 }, () => ({ ...item, href: "https://example.com/x", tags: ["cli"], maker: "Duy" })) }).success).toBe(true);
  });

  it("reports dot-joined paths through the block validator", () => {
    const result = validateBlocks([{ type: "product-cards", props: { items: [{ ...item, href: "javascript:x" }] } }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toBe("blocks.0.props.items.0.href");
  });
});

describe("product-cards renderer", () => {
  const props = { title: "From the directory", items: [{ ...item, tags: ["cli", "html"], maker: "Duy Nguyen" }, { name: "Dewee", tagline: "Calm AI workspace.", href: "https://dewee.io", image: "https://cdn.example.com/dewee.webp" }] };
  const html = renderToStaticMarkup(React.createElement(BlogBlocks, { blocks: [{ type: "product-cards", props }], locale: "vi" }));

  it("renders one link per card whose text is the product name", () => {
    const links = [...html.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(links).toEqual(["AK Render", "Dewee"]);
    expect(html).toContain('href="/products/ak-render"');
    expect(html).toContain("<h3");
    expect(html).toContain("Bởi Duy Nguyen");
    expect(html).toContain('alt="Ảnh xem trước Dewee"');
  });

  it("produces readable markdown for the markdown twin", async () => {
    const markdown = await htmlToMarkdown(`<main>${html}</main>`, "https://nextlevelbuilder.io");
    expect(markdown).toContain("## From the directory");
    expect(markdown).toContain("### [AK Render](https://nextlevelbuilder.io/products/ak-render)");
    expect(markdown).toContain("HTML pages for coding agents.");
    expect(markdown).toMatch(/- cli/);
  });
});

describe("share links", () => {
  it("builds X, Facebook and LinkedIn URLs from the canonical URL only", () => {
    const links = buildShareLinks("https://nextlevelbuilder.io/vi/blog/xin-chao?utm=x#top", "Xin chào & tạm biệt");
    expect(links.url).toBe("https://nextlevelbuilder.io/vi/blog/xin-chao");
    expect(links.x).toBe("https://x.com/intent/post?url=https%3A%2F%2Fnextlevelbuilder.io%2Fvi%2Fblog%2Fxin-chao&text=Xin%20ch%C3%A0o%20%26%20t%E1%BA%A1m%20bi%E1%BB%87t");
    expect(links.facebook).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fnextlevelbuilder.io%2Fvi%2Fblog%2Fxin-chao");
    expect(links.linkedin).toBe("https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fnextlevelbuilder.io%2Fvi%2Fblog%2Fxin-chao");
  });

  it("rejects non-http URLs", () => {
    expect(() => buildShareLinks("javascript:alert(1)", "x")).toThrow();
    expect(() => buildShareLinks("/blog/x", "x")).toThrow();
  });
});

describe("authors and decoration", () => {
  it("maps founder names regardless of case, diacritics and word order", () => {
    expect(authorKey("Nguyễn Duy")).toBe(authorKey("duy nguyen"));
    const duy = resolveBlogAuthor("Nguyễn Duy", "vi");
    expect(duy).toMatchObject({ name: "Duy Nguyen", founderId: "duy", avatar: "/img/founders/duy.webp" });
    expect(duy?.role).toContain("Đồng sáng lập");
    expect(resolveBlogAuthor("Mai Lan", "en")).toEqual({ name: "Mai Lan", initial: "M", avatar: null, role: null, founderId: null });
    expect(resolveBlogAuthor("  ", "en")).toBeNull();
    expect(resolveBlogAuthor(null, "en")).toBeNull();
  });

  it("derives a stable, well-formed sky coordinate and lens variant from a slug", () => {
    const seed = seedFrom("hello-world");
    expect(seedFrom("hello-world")).toBe(seed);
    expect(skyCoordinate(seed)).toMatch(/^RA (?:[01]\d|2[0-3])h [0-5]\dm · Dec [+−][0-8]\d° [0-5]\d′$/);
    for (const slug of ["a", "b", "ra-mat", "x".repeat(96)]) expect(skyCoordinate(seedFrom(slug))).toMatch(/^RA \d{2}h \d{2}m · Dec [+−]\d{2}° \d{2}′$/);
    expect([0, 1, 2]).toContain(lensVariant(seed));
  });
});
