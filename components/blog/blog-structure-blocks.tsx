/** Structural blog blocks: CTA, table and the primitives (heading, paragraph, list, divider, button). */
import React from "react";
import type { BlockButton } from "@/lib/blog/blocks/block-fields";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "./blog-markdown";
import type { BlockViewProps } from "./blog-block-view-types";
import { StarGlyph } from "./blog-orbit-lens";

/** Block variants map onto the shell buttons: primary is the ink/gold CTA, the others are hairline. */
const BUTTON_VARIANT = {
  primary: "btn btn-primary",
  secondary: "btn btn-ghost",
  ghost: "btn btn-ghost blog-btn-quiet",
} as const;

export function BlogButton({ button, small = false }: { button: BlockButton; small?: boolean }) {
  const external = /^https?:\/\//i.test(button.href);
  return (
    <a
      href={button.href}
      className={cn(BUTTON_VARIANT[button.variant ?? "primary"], small && "btn-sm")}
      {...(external ? { rel: "noopener noreferrer" } : {})}
    >
      {button.label}
      <span aria-hidden="true">→</span>
    </a>
  );
}

export function CtaBlock({ props }: BlockViewProps<"cta">) {
  return (
    <section className="surface blog-cta">
      <svg className="blog-cta-orbit" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <ellipse cx="330" cy="80" rx="150" ry="46" />
        <ellipse className="dash" cx="330" cy="80" rx="96" ry="28" transform="rotate(-8 330 80)" />
        <circle className="core" cx="180" cy="80" r="3" />
      </svg>
      <div className="blog-cta-copy">
        <p className="blog-cta-title">{props.title}</p>
        {props.body && <p className="blog-cta-body">{props.body}</p>}
      </div>
      <div className="blog-cta-actions">
        <BlogButton button={{ ...props.primary, variant: props.primary.variant ?? "primary" }} />
        {props.secondary && <BlogButton button={{ ...props.secondary, variant: props.secondary.variant ?? "secondary" }} />}
      </div>
    </section>
  );
}

export function TableBlock({ props }: BlockViewProps<"table">) {
  return (
    <figure className="blog-table">
      <div className="blog-table-scroll" tabIndex={0} role="region" aria-label={props.caption ?? props.headers.join(", ")}>
        <table>
          {props.caption && <caption className="mono">{props.caption}</caption>}
          <thead>
            <tr>
              {props.headers.map((header, index) => (
                <th key={index} scope="col" className="mono">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}><InlineMarkdown source={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function HeadingBlock({ props, ctx }: BlockViewProps<"heading">) {
  const level = props.level ?? 2;
  const Tag = `h${level}` as "h2" | "h3" | "h4";
  return <Tag id={props.anchor ?? ctx.nextId(props.text)} className="blog-h">{props.text}</Tag>;
}

export function ParagraphBlock({ props }: BlockViewProps<"paragraph">) {
  return <p className="blog-prose blog-p"><InlineMarkdown source={props.text} /></p>;
}

export function ListBlock({ props }: BlockViewProps<"list">) {
  const style = props.style ?? "bullet";
  const items = props.items.map((item, index) => (
    <li key={index}><InlineMarkdown source={item} /></li>
  ));
  if (style === "number") return <ol className="blog-prose blog-list blog-list-number">{items}</ol>;
  return <ul className={cn("blog-prose blog-list", style === "check" ? "blog-list-check" : "blog-list-bullet")}>{items}</ul>;
}

export function DividerBlock({ props }: BlockViewProps<"divider">) {
  return (
    <div className="blog-divider" role="separator" aria-label={props.label || undefined}>
      <span className="blog-divider-rule" aria-hidden="true" />
      {props.label ? <span className="mono" aria-hidden="true">{props.label}</span> : <StarGlyph className="blog-divider-star" />}
      <span className="blog-divider-rule" aria-hidden="true" />
    </div>
  );
}

export function ButtonBlock({ props }: BlockViewProps<"button">) {
  return (
    <div className={cn("blog-button-row", props.align === "center" && "is-center")}>
      <BlogButton button={{ label: props.label, href: props.href, variant: props.variant }} small />
    </div>
  );
}
