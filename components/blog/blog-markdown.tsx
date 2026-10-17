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

/** Prose styling lives in app/[locale]/blog/blog-pages.css under `.blog-prose`; these hooks name the pieces. */
export const blogLinkClass = "blog-link";
export const inlineCodeClass = "blog-code-inline";

export function renderInline(nodes: InlineNode[], keyPrefix = "i"): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "text":
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
      case "code":
        return <code key={key} className={inlineCodeClass}>{node.value}</code>;
      case "strong":
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
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
          <img key={key} src={node.src} alt={node.alt} title={node.title} loading="lazy" decoding="async" className="blog-md-img" />
        );
    }
  });
}

function renderBlocks(nodes: MarkdownBlockNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "heading": {
        const Tag = `h${node.level}` as "h2" | "h3" | "h4";
        return <Tag key={key} id={node.id} className="blog-h">{renderInline(node.children, key)}</Tag>;
      }
      case "paragraph":
        return <p key={key}>{renderInline(node.children, key)}</p>;
      case "code":
        return (
          <pre key={key} className="blog-md-pre" tabIndex={0} data-language={node.lang ?? undefined}>
            <code>{node.value}</code>
          </pre>
        );
      case "blockquote":
        return <blockquote key={key} className="blog-md-quote">{renderBlocks(node.children, key)}</blockquote>;
      case "list": {
        const items = node.items.map((item, i) => <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>);
        return node.ordered ? (
          <ol key={key} start={node.start === 1 ? undefined : node.start} className="blog-list blog-list-number" style={node.start === 1 ? undefined : { counterReset: `blog-item ${node.start - 1}` }}>{items}</ol>
        ) : (
          <ul key={key} className="blog-list blog-list-bullet">{items}</ul>
        );
      }
      case "hr":
        return <hr key={key} className="blog-md-hr" />;
    }
  });
}

/** Full Markdown document. `nextId` shares heading-anchor de-duplication across the whole post. */
export function MarkdownContent({ source, nextId, className }: { source: string; nextId?: (text: string) => string; className?: string }) {
  return <div className={cn("blog-prose", className)}>{renderBlocks(parseMarkdown(source, nextId), "md")}</div>;
}

/** Inline Markdown only (paragraph, list items, table cells). */
export function InlineMarkdown({ source }: { source: string }) {
  return <>{renderInline(parseInlineMarkdown(source))}</>;
}
