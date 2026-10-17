/** Text-centric blog blocks: hero, rich text, callout, quote, key takeaways, FAQ. Styles: blog-pages.css. */
import React from "react";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { InlineMarkdown, MarkdownContent, blogLinkClass } from "./blog-markdown";
import type { BlockViewProps } from "./blog-block-view-types";
import { StarGlyph } from "./blog-orbit-lens";

const GREEK = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "ο", "π", "ρ", "σ", "τ", "υ"] as const;

/** Greek catalogue letter for a 0-based index (wraps after υ). */
export const greekMarker = (index: number) => GREEK[index % GREEK.length];

/**
 * Stand-alone hero rendering (catalogue previews, tests). On the post page the hero is lifted into the
 * masthead instead: its lead becomes the lede and its image the cover (components/blog/blog-post-layout.tsx).
 */
export function HeroBlock({ props }: BlockViewProps<"hero">) {
  return (
    <header className="blog-hero">
      {props.eyebrow && <p className="mono blog-kicker">{props.eyebrow}</p>}
      <p className="blog-hero-lead">{props.lead}</p>
      {props.image && (
        <figure className="blog-figure">
          {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
          <img src={props.image.src} alt={props.image.alt} decoding="async" />
          {props.image.caption && <figcaption className="mono">{props.image.caption}</figcaption>}
        </figure>
      )}
    </header>
  );
}

export function RichTextBlock({ props, ctx }: BlockViewProps<"rich-text">) {
  return <MarkdownContent source={props.markdown} nextId={ctx.nextId} />;
}

export function CalloutBlock({ props, ctx }: BlockViewProps<"callout">) {
  const tone = props.tone ?? "note";
  const toneLabel = BLOG_COPY[ctx.locale].calloutTones[tone];
  return (
    <div className="blog-callout" data-tone={tone} role="note" aria-label={props.title ?? toneLabel}>
      <p className="mono blog-callout-kicker">
        <StarGlyph className="blog-callout-star" />
        <span>{toneLabel}</span>
      </p>
      {props.title && <p className="blog-callout-title">{props.title}</p>}
      <MarkdownContent source={props.body} className="blog-callout-body" />
    </div>
  );
}

export function QuoteBlock({ props }: BlockViewProps<"quote">) {
  return (
    <figure className="blog-quote">
      <blockquote>
        <p>{props.text}</p>
      </blockquote>
      {(props.attribution || props.role) && (
        <figcaption className="mono">
          <span className="blog-quote-rule" aria-hidden="true" />
          <span>
            {props.attribution &&
              (props.sourceUrl ? (
                <a href={props.sourceUrl} className={blogLinkClass} rel="noopener noreferrer nofollow">{props.attribution}</a>
              ) : (
                <cite>{props.attribution}</cite>
              ))}
            {props.attribution && props.role && " · "}
            {props.role}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

export function KeyTakeawaysBlock({ props, ctx }: BlockViewProps<"key-takeaways">) {
  const title = props.title ?? BLOG_COPY[ctx.locale].keyTakeaways;
  return (
    <section className="surface blog-takeaways" aria-label={title}>
      <p className="mono blog-kicker">{title}</p>
      <ul className="feats">
        {props.items.map((item, index) => (
          <li key={index} className={index === 0 ? "hi" : undefined}>
            <span><InlineMarkdown source={item} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FaqBlock({ props, ctx }: BlockViewProps<"faq">) {
  return (
    <section className="blog-faq">
      {props.title && <h2 id={ctx.nextId(props.title)} className="blog-h">{props.title}</h2>}
      <div className="blog-faq-list">
        {props.items.map((item, index) => (
          <details key={index} className="blog-faq-item">
            <summary>
              <span className="blog-greek" data-greek={greekMarker(index)} aria-hidden="true" />
              <span className="blog-faq-q">{item.question}</span>
              <span className="blog-pm" aria-hidden="true" />
            </summary>
            <MarkdownContent source={item.answer} className="blog-faq-a" />
          </details>
        ))}
      </div>
    </section>
  );
}
