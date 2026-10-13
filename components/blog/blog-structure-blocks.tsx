/** Structural blog blocks: CTA, table and the primitives (heading, paragraph, list, divider, button). */
import React from "react";
import type { BlockButton } from "@/lib/blog/blocks/block-fields";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "./blog-markdown";
import type { BlockViewProps } from "./blog-block-view-types";

const BUTTON_VARIANT = {
  primary: "bg-cta text-cta-foreground hover:bg-cta-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-raised",
  ghost: "text-star hover:bg-canvas-deep",
} as const;

export function BlogButton({ button }: { button: BlockButton }) {
  const external = /^https?:\/\//i.test(button.href);
  return (
    <a
      href={button.href}
      className={cn("inline-flex items-center justify-center rounded-pill px-5 py-2.5 text-step-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", BUTTON_VARIANT[button.variant ?? "primary"])}
      {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
    >
      {button.label}
    </a>
  );
}

export function CtaBlock({ props }: BlockViewProps<"cta">) {
  return (
    <section className="mx-auto max-w-4xl rounded-lg border border-line bg-surface p-8 text-center shadow-constellation">
      <p className="font-display text-step-xl text-ink">{props.title}</p>
      {props.body && <p className="mx-auto mt-3 max-w-prose text-ink-2">{props.body}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <BlogButton button={{ ...props.primary, variant: props.primary.variant ?? "primary" }} />
        {props.secondary && <BlogButton button={{ ...props.secondary, variant: props.secondary.variant ?? "secondary" }} />}
      </div>
    </section>
  );
}

export function TableBlock({ props }: BlockViewProps<"table">) {
  return (
    <figure className="mx-auto max-w-4xl overflow-x-auto">
      <table className="w-full border-collapse text-left text-step-sm">
        {props.caption && <caption className="mb-2 caption-top text-left text-ink-3">{props.caption}</caption>}
        <thead>
          <tr className="border-b border-line-strong">
            {props.headers.map((header, index) => (
              <th key={index} scope="col" className="px-3 py-2 font-semibold text-ink">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, r) => (
            <tr key={r} className="border-b border-line">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 align-top text-ink-2"><InlineMarkdown source={cell} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const HEADING_CLASS = {
  2: "font-display text-step-xl",
  3: "font-display text-step-lg",
  4: "text-step-md font-semibold",
} as const;

export function HeadingBlock({ props, ctx }: BlockViewProps<"heading">) {
  const level = props.level ?? 2;
  const Tag = `h${level}` as "h2" | "h3" | "h4";
  return <Tag id={props.anchor ?? ctx.nextId(props.text)} className={cn("mx-auto max-w-prose scroll-mt-28 text-ink", HEADING_CLASS[level])}>{props.text}</Tag>;
}

export function ParagraphBlock({ props }: BlockViewProps<"paragraph">) {
  return <p className="mx-auto max-w-prose text-step-md leading-relaxed text-ink-2"><InlineMarkdown source={props.text} /></p>;
}

export function ListBlock({ props }: BlockViewProps<"list">) {
  const style = props.style ?? "bullet";
  const items = props.items.map((item, index) => (
    <li key={index} className={cn(style === "check" && "flex gap-3")}>
      {style === "check" && <span aria-hidden className="text-star">&#10003;</span>}
      <span><InlineMarkdown source={item} /></span>
    </li>
  ));
  const base = "mx-auto max-w-prose space-y-2 text-step-md text-ink-2";
  if (style === "number") return <ol className={cn(base, "list-decimal pl-6 marker:text-ink-3")}>{items}</ol>;
  return <ul className={cn(base, style === "bullet" && "list-disc pl-6 marker:text-star")}>{items}</ul>;
}

export function DividerBlock({ props }: BlockViewProps<"divider">) {
  if (!props.label) return <hr className="mx-auto max-w-prose border-line" />;
  return (
    <div className="mx-auto flex max-w-prose items-center gap-4" role="separator" aria-label={props.label}>
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-step-xs uppercase text-ink-3">{props.label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function ButtonBlock({ props }: BlockViewProps<"button">) {
  return (
    <div className={cn("mx-auto flex max-w-prose", props.align === "center" ? "justify-center" : "justify-start")}>
      <BlogButton button={{ label: props.label, href: props.href, variant: props.variant }} />
    </div>
  );
}
