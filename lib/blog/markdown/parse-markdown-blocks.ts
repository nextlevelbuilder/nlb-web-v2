/**
 * Block-level Markdown → MarkdownBlockNode[]: ATX headings, fenced code, blockquotes, bullet and
 * ordered lists, thematic breaks and paragraphs. `#` is demoted to h2 and depth is clamped to h4
 * because the post title owns the page h1. Heading ids are unique per document.
 * Unsupported constructs (HTML, tables, setext headings) simply stay paragraph text.
 */
import { createHeadingIdAllocator } from "./heading-id";
import type { InlineNode, MarkdownBlockNode } from "./markdown-types";
import { inlineText, parseInlineMarkdown } from "./parse-inline-markdown";

const MAX_QUOTE_DEPTH = 4;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9+#.-]{0,24})[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const HR = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const QUOTE = /^ {0,3}>\s?/;
const BULLET = /^ {0,3}[-*+]\s+(.*)$/;
const ORDERED = /^ {0,3}(\d{1,9})[.)]\s+(.*)$/;

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line);
}

function parseLines(lines: string[], nextId: (text: string) => string, quoteDepth: number): MarkdownBlockNode[] {
  const out: MarkdownBlockNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ kind: "code", lang: fence[2] ? fence[2].toLowerCase() : null, value: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const children = parseInlineMarkdown(heading[2] ?? "");
      const level = Math.min(Math.max(heading[1].length, 2), 4) as 2 | 3 | 4;
      out.push({ kind: "heading", level, id: nextId(inlineText(children)), children });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ kind: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ""));
      out.push(
        quoteDepth < MAX_QUOTE_DEPTH
          ? { kind: "blockquote", children: parseLines(body, nextId, quoteDepth + 1) }
          : { kind: "blockquote", children: [{ kind: "paragraph", children: parseInlineMarkdown(body.join("\n")) }] }
      );
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const marker = isOrdered ? ORDERED : BULLET;
      const items: string[][] = [];
      while (i < lines.length) {
        const current = lines[i];
        const item = marker.exec(current);
        if (item) {
          items.push([isOrdered ? item[2] : item[1]]);
          i++;
        } else if (current.trim() && /^\s+/.test(current) && !startsBlock(current.trimStart())) {
          items[items.length - 1].push(current.trim());
          i++;
        } else if (!current.trim() && i + 1 < lines.length && marker.test(lines[i + 1])) {
          i++;
        } else break;
      }
      const start = ordered ? Number(ordered[1]) : 1;
      out.push({ kind: "list", ordered: isOrdered, start, items: items.map((parts) => parseInlineMarkdown(parts.join("\n"))) });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !startsBlock(lines[i]))) paragraph.push(lines[i++]);
    out.push({ kind: "paragraph", children: parseInlineMarkdown(paragraph.join("\n").trim()) });
  }
  return out;
}

/** Parses untrusted Markdown into a safe AST. A fresh id allocator per call keeps anchors unique per document. */
export function parseMarkdown(source: string, nextId = createHeadingIdAllocator()): MarkdownBlockNode[] {
  return parseLines((source ?? "").replace(/\r\n?/g, "\n").split("\n"), nextId, 0);
}

/** Plain text of a parsed document (reading-time estimates, search snippets). */
export function markdownText(nodes: MarkdownBlockNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "heading":
        case "paragraph":
          return inlineText(node.children);
        case "code":
          return node.value;
        case "blockquote":
          return markdownText(node.children);
        case "list":
          return node.items.map((item: InlineNode[]) => inlineText(item)).join("\n");
        case "hr":
          return "";
      }
    })
    .join("\n");
}
