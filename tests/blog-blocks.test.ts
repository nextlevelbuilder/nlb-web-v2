import { describe, expect, it } from "vitest";
import { getBlockSchema, listBlockDefinitions, MAX_BLOCKS, MAX_BLOCKS_BYTES, validateBlocks, BLOG_BLOCK_TYPES } from "@/lib/blog/blocks/registry";
import { resolveEmbed } from "@/lib/blog/blocks/embed-url";
import { parseInlineMarkdown } from "@/lib/blog/markdown/parse-inline-markdown";
import { parseMarkdown } from "@/lib/blog/markdown/parse-markdown-blocks";

const paragraph = (text = "Hello") => ({ type: "paragraph", props: { text } });

describe("blog block registry", () => {
  it("serves one valid example and a JSON Schema per block type", () => {
    const definitions = listBlockDefinitions();
    expect(definitions.map((d) => d.type)).toEqual([...BLOG_BLOCK_TYPES]);
    for (const definition of definitions) {
      expect(definition.title).toBeTruthy();
      expect(["section", "primitive"]).toContain(definition.category);
      expect(definition.propsSchema).toMatchObject({ type: "object" });
      expect(getBlockSchema(definition.type as (typeof BLOG_BLOCK_TYPES)[number]).safeParse(definition.example.props).success).toBe(true);
    }
    expect(validateBlocks(definitions.map((d) => d.example).filter((b) => b.type !== "hero")).ok).toBe(true);
  });

  it("rejects unknown types, bad props and unknown envelope keys with dot-joined paths", () => {
    const result = validateBlocks([
      paragraph(),
      { type: "marquee", props: {} },
      { type: "heading", props: { text: "", level: 7 } },
      { type: "paragraph", props: { text: "x" }, html: "<b>" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.issues.map((issue) => issue.path);
    expect(paths).toContain("blocks.1.type");
    expect(paths).toContain("blocks.2.props.text");
    expect(paths).toContain("blocks.2.props.level");
    expect(paths).toContain("blocks.3");
    expect(result.issues.every((issue) => typeof issue.path === "string")).toBe(true);
  });

  it("rejects unsafe links, images and non-allowlisted embeds", () => {
    const result = validateBlocks([
      { type: "button", props: { label: "x", href: "javascript:alert(1)" } },
      { type: "image", props: { src: "http://insecure.example/a.png", alt: "" } },
      { type: "embed", props: { url: "https://evil.example/embed/x", title: "x" } },
      { type: "video", props: { url: "https://www.youtube.com/watch?v=short", title: "x" } },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.path)).toEqual(["blocks.0.props.href", "blocks.1.props.src", "blocks.2.props.url", "blocks.3.props.url"]);
  });

  it("enforces the 60-block limit, the 200 KB limit (flagged as too large) and hero placement", () => {
    expect(validateBlocks(Array.from({ length: MAX_BLOCKS }, () => paragraph())).ok).toBe(true);
    const tooMany = validateBlocks(Array.from({ length: MAX_BLOCKS + 1 }, () => paragraph()));
    expect(tooMany).toMatchObject({ ok: false, tooLarge: false });

    const big = "x".repeat(4000);
    const tooLarge = validateBlocks(Array.from({ length: 52 }, () => paragraph(big)));
    expect(JSON.stringify(Array.from({ length: 52 }, () => paragraph(big))).length).toBeGreaterThan(MAX_BLOCKS_BYTES);
    expect(tooLarge).toMatchObject({ ok: false, tooLarge: true });

    const hero = { type: "hero", props: { lead: "Lead" } };
    expect(validateBlocks([hero, paragraph()]).ok).toBe(true);
    expect(validateBlocks([paragraph(), hero]).ok).toBe(false);
    expect(validateBlocks([{ ...paragraph(), id: "a" }, { ...paragraph(), id: "a" }]).ok).toBe(false);
    expect(validateBlocks({ not: "an array" }).ok).toBe(false);
  });

  it("checks table row widths", () => {
    const result = validateBlocks([{ type: "table", props: { headers: ["A", "B"], rows: [["1"]] } }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toBe("blocks.0.props.rows.0");
  });
});

describe("embed allowlist", () => {
  it("rebuilds provider player URLs from parsed ids", () => {
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ?t=10")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(resolveEmbed("https://vimeo.com/123456/abcdef12")?.src).toBe("https://player.vimeo.com/video/123456?h=abcdef12");
    expect(resolveEmbed("https://customer-abc123.cloudflarestream.com/0123456789abcdef0123456789abcdef/watch")?.src).toBe("https://customer-abc123.cloudflarestream.com/0123456789abcdef0123456789abcdef/iframe");
    expect(resolveEmbed("https://www.loom.com/share/0123456789abcdef0123456789abcdef")?.provider).toBe("loom");
  });

  it("rejects other hosts, http, credentials and look-alike domains", () => {
    for (const url of ["http://youtu.be/dQw4w9WgXcQ", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://user:pw@vimeo.com/1", "https://example.com/video.mp4", "javascript:alert(1)"]) {
      expect(resolveEmbed(url)).toBeNull();
    }
  });
});

describe("safe markdown parser", () => {
  it("keeps raw HTML as text and drops unsafe link and image URLs", () => {
    const nodes = parseInlineMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) ![i](data:image/png;base64,AA) [ok](/blog "t")');
    expect(nodes.some((n) => n.kind === "text" && n.value.includes("<script>"))).toBe(true);
    const links = nodes.filter((n) => n.kind === "link");
    expect(links).toEqual([expect.objectContaining({ href: "/blog", title: "t" })]);
    expect(nodes.some((n) => n.kind === "image")).toBe(false);
  });

  it("parses emphasis, code, headings with unique ids, lists, quotes and fences", () => {
    expect(parseInlineMarkdown("**bold** *em* `a*b*` snake_case_name")).toEqual([
      { kind: "strong", children: [{ kind: "text", value: "bold" }] },
      { kind: "text", value: " " },
      { kind: "em", children: [{ kind: "text", value: "em" }] },
      { kind: "text", value: " " },
      { kind: "code", value: "a*b*" },
      { kind: "text", value: " snake_case_name" },
    ]);
    const doc = parseMarkdown("# Intro\n\n## Intro\n\n- a\n- b\n\n3. c\n\n> quote\n\n```ts\nconst x = '<b>';\n```\n\n---");
    expect(doc.map((n) => n.kind)).toEqual(["heading", "heading", "list", "list", "blockquote", "code", "hr"]);
    expect(doc[0]).toMatchObject({ level: 2, id: "intro" });
    expect(doc[1]).toMatchObject({ id: "intro-1" });
    expect(doc[3]).toMatchObject({ ordered: true, start: 3 });
    expect(doc[5]).toEqual({ kind: "code", lang: "ts", value: "const x = '<b>';" });
  });

  it("stays fast on hostile unclosed delimiters", () => {
    const started = Date.now();
    parseMarkdown("_a ".repeat(6000) + "[".repeat(5000) + "`".repeat(3000));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
