import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlogBlocks } from "@/components/blog/blog-block-renderers";
import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { listBlockDefinitions } from "@/lib/blog/blocks/registry";
import type { BlogPost } from "@/lib/blog/blog-types";

const render = (blocks: { type: string; props: Record<string, unknown>; id?: string }[]) =>
  renderToStaticMarkup(React.createElement(BlogBlocks, { blocks }));

describe("blog block renderers", () => {
  it("renders every catalogue example", () => {
    for (const definition of listBlockDefinitions()) {
      const html = render([definition.example]);
      expect(html, definition.type).toContain(`data-block="${definition.type}"`);
      expect(html.length, definition.type).toBeGreaterThan(`<div data-block="${definition.type}"></div>`.length + 20);
    }
  });

  it("escapes HTML in markdown, code and text props", () => {
    const html = render([
      { type: "rich-text", props: { markdown: "Hi <img src=x onerror=alert(1)> **there**\n\n[bad](javascript:alert(1))" } },
      { type: "code", props: { code: "</code><script>alert(1)</script>", language: "html" } },
      { type: "paragraph", props: { text: "<iframe src=//evil>" } },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<iframe src=//evil>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong");
  });

  it("embeds only rebuilt provider URLs in a sandboxed iframe", () => {
    const html = render([{ type: "video", props: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=%22onload", title: "Demo" } }]);
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain("sandbox=");
  });

  it("skips blocks whose stored props no longer validate and unknown types", () => {
    const html = render([{ type: "image", props: { src: "javascript:alert(1)", alt: "" } }, { type: "legacy", props: {} }]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });

  it("gives headings across blocks unique anchors", () => {
    const html = render([{ type: "heading", props: { text: "Setup" } }, { type: "rich-text", props: { markdown: "## Setup" } }]);
    expect(html).toContain('id="setup"');
    expect(html).toContain('id="setup-1"');
  });

  it("renders the post layout with title, translation link and tags", () => {
    const post: BlogPost = {
      id: "p1", locale: "vi", slug: "xin-chao", title: "Xin chào", description: "Mô tả", blocks: [{ type: "paragraph", props: { text: "Nội dung" } }],
      coverUrl: null, tags: ["d1"], seo: {}, authorName: "Duy", status: "published", translationKey: "hello",
      publishedAt: "2026-10-01T00:00:00.000Z", version: 3, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z",
    };
    const summary = { ...post, id: "p2", locale: "en" as const, slug: "hello", blocks: undefined };
    const html = renderToStaticMarkup(React.createElement(BlogPostLayout, { post, translation: summary }));
    expect(html).toContain("<h1");
    expect(html).toContain("Xin chào");
    expect(html).toContain('href="/blog/hello"');
    expect(html).toContain('href="/vi/blog?tag=d1"');
  });
});
