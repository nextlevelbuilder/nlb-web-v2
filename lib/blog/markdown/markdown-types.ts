/**
 * AST produced by the blog's safe Markdown parser. It is plain data rendered as React elements,
 * so no HTML string is ever built from user input: raw HTML in the source stays literal text,
 * and links/images are only emitted after the URL passed the shared allowlists.
 */

export type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; children: InlineNode[] }
  | { kind: "em"; children: InlineNode[] }
  | { kind: "del"; children: InlineNode[] }
  | { kind: "link"; href: string; title?: string; children: InlineNode[] }
  | { kind: "image"; src: string; alt: string; title?: string }
  | { kind: "br" };

export type MarkdownBlockNode =
  | { kind: "heading"; level: 2 | 3 | 4; id: string; children: InlineNode[] }
  | { kind: "paragraph"; children: InlineNode[] }
  | { kind: "code"; lang: string | null; value: string }
  | { kind: "blockquote"; children: MarkdownBlockNode[] }
  | { kind: "list"; ordered: boolean; start: number; items: InlineNode[][] }
  | { kind: "hr" };
