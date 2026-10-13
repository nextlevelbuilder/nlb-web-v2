/**
 * Renders the safe Markdown AST (lib/blog/markdown) as React elements. No HTML string is ever
 * produced from user input, so there is no dangerouslySetInnerHTML anywhere in blog rendering:
 * React escapes every text node, and URLs were already checked against the allowlists by the parser.
 */
import React, { type ReactNode } from "react";
import type { InlineNode, MarkdownBlockNode } from "@/lib/blog/markdown/markdown-types";
import { parseInlineMarkdown } from "@/lib/blog/markdown/parse-inline-markdown";
import { parseMarkdown } from "@/lib/blog/markdown/parse-markdown-blocks";
import { cn } from "@/lib/utils";

const isExternal = (href: string) => /^https?:\/\//i.test(href);

export const blogLinkClass = "text-star underline decoration-star/40 underline-offset-4 transition-colors hover:decoration-star";
export const inlineCodeClass = "rounded-sm bg-canvas-deep px-1.5 py-0.5 font-mono text-[0.9em] text-ink";

export function renderInline(nodes: InlineNode[], keyPrefix = "i"): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "text":
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
      case "code":
        return <code key={key} className={inlineCodeClass}>{node.value}</code>;
      case "strong":
        return <strong key={key} className="font-semibold text-ink">{renderInline(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "del":
        return <del key={key}>{renderInline(node.children, key)}</del>;
      case "br":
        return <br key={key} />;
      case "link":
        return (
          <a key={key} href={node.href} title={node.title} className={blogLinkClass} {...(isExternal(node.href) ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
            {renderInline(node.children, key)}
          </a>
        );
      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size; next/image needs dimensions
          <img key={key} src={node.src} alt={node.alt} title={node.title} loading="lazy" decoding="async" className="my-4 inline-block max-w-full rounded-sm border border-line" />
        );
    }
  });
}

const HEADING_CLASS = {
  2: "mt-12 mb-4 font-display text-step-xl text-ink",
  3: "mt-10 mb-3 font-display text-step-lg text-ink",
  4: "mt-8 mb-2 text-step-md font-semibold text-ink",
} as const;

function renderBlocks(nodes: MarkdownBlockNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "heading": {
        const Tag = `h${node.level}` as "h2" | "h3" | "h4";
        return <Tag key={key} id={node.id} className={cn("scroll-mt-28", HEADING_CLASS[node.level])}>{renderInline(node.children, key)}</Tag>;
      }
      case "paragraph":
        return <p key={key} className="my-5 leading-relaxed">{renderInline(node.children, key)}</p>;
      case "code":
        return (
          <pre key={key} className="my-6 overflow-x-auto rounded-lg border border-line bg-canvas-deep p-4 font-mono text-step-sm leading-relaxed text-ink" data-language={node.lang ?? undefined}>
            <code>{node.value}</code>
          </pre>
        );
      case "blockquote":
        return <blockquote key={key} className="my-6 border-l-2 border-star pl-5 italic text-ink-2">{renderBlocks(node.children, key)}</blockquote>;
      case "list": {
        const items = node.items.map((item, i) => <li key={`${key}-${i}`} className="pl-1">{renderInline(item, `${key}-${i}`)}</li>);
        return node.ordered ? (
          <ol key={key} start={node.start === 1 ? undefined : node.start} className="my-5 list-decimal space-y-2 pl-6 marker:text-ink-3">{items}</ol>
        ) : (
          <ul key={key} className="my-5 list-disc space-y-2 pl-6 marker:text-star">{items}</ul>
        );
      }
      case "hr":
        return <hr key={key} className="my-10 border-line" />;
    }
  });
}

/** Full Markdown document. `nextId` shares heading-anchor de-duplication across the whole post. */
export function MarkdownContent({ source, nextId, className }: { source: string; nextId?: (text: string) => string; className?: string }) {
  return <div className={cn("text-step-md text-ink-2", className)}>{renderBlocks(parseMarkdown(source, nextId), "md")}</div>;
}

/** Inline Markdown only (paragraph, list items, table cells). */
export function InlineMarkdown({ source }: { source: string }) {
  return <>{renderInline(parseInlineMarkdown(source))}</>;
}
