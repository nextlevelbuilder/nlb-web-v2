/** Text-centric blog blocks: hero, rich text, callout, quote, key takeaways, FAQ. */
import React from "react";
import { cn } from "@/lib/utils";
import { InlineMarkdown, MarkdownContent, blogLinkClass } from "./blog-markdown";
import type { BlockViewProps } from "./blog-block-view-types";

export function HeroBlock({ props }: BlockViewProps<"hero">) {
  return (
    <header className="mx-auto max-w-4xl">
      {props.eyebrow && <p className="mb-3 font-mono text-step-xs uppercase text-star">{props.eyebrow}</p>}
      <p className="font-display text-step-lg leading-snug text-ink-2 md:text-step-xl">{props.lead}</p>
      {props.image && (
        <figure className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
          <img src={props.image.src} alt={props.image.alt} className="w-full rounded-lg border border-line object-cover" decoding="async" />
          {props.image.caption && <figcaption className="mt-2 text-step-sm text-ink-3">{props.image.caption}</figcaption>}
        </figure>
      )}
    </header>
  );
}

export function RichTextBlock({ props, ctx }: BlockViewProps<"rich-text">) {
  return <MarkdownContent source={props.markdown} nextId={ctx.nextId} className="mx-auto max-w-prose" />;
}

const CALLOUT_TONE = {
  note: { border: "border-line-strong", label: "text-ink-2" },
  tip: { border: "border-star", label: "text-star" },
  warning: { border: "border-warning", label: "text-warning" },
  success: { border: "border-success", label: "text-success" },
  danger: { border: "border-destructive", label: "text-destructive" },
} as const;

export function CalloutBlock({ props }: BlockViewProps<"callout">) {
  const tone = CALLOUT_TONE[props.tone ?? "note"];
  return (
    <aside className={cn("mx-auto max-w-prose rounded-lg border-l-4 bg-surface p-5", tone.border)} role="note">
      {props.title && <p className={cn("mb-1 font-semibold", tone.label)}>{props.title}</p>}
      <MarkdownContent source={props.body} className="text-step-base [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
    </aside>
  );
}

export function QuoteBlock({ props }: BlockViewProps<"quote">) {
  return (
    <figure className="mx-auto max-w-3xl border-l-2 border-star py-2 pl-6">
      <blockquote className="font-display text-step-xl leading-snug text-ink">&ldquo;{props.text}&rdquo;</blockquote>
      {(props.attribution || props.role) && (
        <figcaption className="mt-4 text-step-sm text-ink-3">
          {props.attribution && (props.sourceUrl ? <a href={props.sourceUrl} className={blogLinkClass} rel="noopener noreferrer nofollow">{props.attribution}</a> : <span className="font-semibold text-ink-2">{props.attribution}</span>)}
          {props.attribution && props.role && ", "}
          {props.role}
        </figcaption>
      )}
    </figure>
  );
}

export function KeyTakeawaysBlock({ props }: BlockViewProps<"key-takeaways">) {
  return (
    <section className="mx-auto max-w-prose rounded-lg border border-line bg-surface p-6" aria-label={props.title ?? "Key takeaways"}>
      {props.title && <p className="mb-3 font-mono text-step-xs uppercase text-star">{props.title}</p>}
      <ul className="space-y-2">
        {props.items.map((item, index) => (
          <li key={index} className="flex gap-3 text-ink-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-star" />
            <span><InlineMarkdown source={item} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FaqBlock({ props, ctx }: BlockViewProps<"faq">) {
  return (
    <section className="mx-auto max-w-prose">
      {props.title && <h2 id={ctx.nextId(props.title)} className="mb-4 scroll-mt-28 font-display text-step-xl text-ink">{props.title}</h2>}
      <div className="divide-y divide-line border-y border-line">
        {props.items.map((item, index) => (
          <details key={index} className="group py-4">
            <summary className="cursor-pointer list-none font-semibold text-ink marker:hidden">
              <span className="mr-2 inline-block text-star transition-transform group-open:rotate-45" aria-hidden>+</span>
              {item.question}
            </summary>
            <MarkdownContent source={item.answer} className="mt-2 text-step-base [&>*:last-child]:mb-0" />
          </details>
        ))}
      </div>
    </section>
  );
}
