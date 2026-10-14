/** Media blog blocks: image, gallery, video, embed and code. Embeds use allowlisted player URLs only. */
import React from "react";
import { resolveEmbed } from "@/lib/blog/blocks/embed-url";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { cn } from "@/lib/utils";
import type { BlockViewProps } from "./blog-block-view-types";
import { BlogCopyButton } from "./blog-copy-button";

const IFRAME_ALLOW = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
const ASPECT_CLASS = { "16:9": "is-16x9", "4:3": "is-4x3", "1:1": "is-1x1", "9:16": "is-9x16" } as const;

/** Sandboxed provider iframe in a hairline frame. Renders nothing if the URL no longer passes the allowlist. */
function EmbedFrame({ url, title, aspect }: { url: string; title: string; aspect: keyof typeof ASPECT_CLASS }) {
  const target = resolveEmbed(url);
  if (!target) return null;
  return (
    <div className={cn("blog-frame", ASPECT_CLASS[aspect])}>
      <span className="mono blog-frame-label" data-title={title} aria-hidden="true" />
      <iframe
        src={target.src}
        title={title}
        allow={IFRAME_ALLOW}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        data-provider={target.provider}
      />
    </div>
  );
}

export function ImageBlock({ props }: BlockViewProps<"image">) {
  return (
    <figure className="blog-figure">
      {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
      <img src={props.src} alt={props.alt} width={props.pixelWidth} height={props.pixelHeight} loading="lazy" decoding="async" />
      {props.caption && <figcaption className="mono">{props.caption}</figcaption>}
    </figure>
  );
}

export function GalleryBlock({ props }: BlockViewProps<"gallery">) {
  return (
    <figure className="blog-gallery">
      <ul className={cn("blog-gallery-grid", `cols-${props.columns ?? 2}`)}>
        {props.images.map((image, index) => (
          <li key={index}>
            <figure className="blog-figure">
              {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
              <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
              {image.caption && <figcaption className="mono">{image.caption}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
      {props.caption && <figcaption className="mono blog-gallery-caption">{props.caption}</figcaption>}
    </figure>
  );
}

export function VideoBlock({ props }: BlockViewProps<"video">) {
  return (
    <figure className="blog-figure blog-video">
      <EmbedFrame url={props.url} title={props.title} aspect="16:9" />
      {props.caption && <figcaption className="mono">{props.caption}</figcaption>}
    </figure>
  );
}

export function EmbedBlock({ props }: BlockViewProps<"embed">) {
  return (
    <div className="blog-embed">
      <EmbedFrame url={props.url} title={props.title} aspect={props.aspect ?? "16:9"} />
    </div>
  );
}

/**
 * Terminal-style code panel (the home `.term` language). Code is a React text node, so it is escaped
 * and never interpreted; the copy button appears only once JavaScript runs.
 */
export function CodeBlock({ props, ctx }: BlockViewProps<"code">) {
  const copy = BLOG_COPY[ctx.locale];
  const name = props.filename ?? props.language ?? "code";
  return (
    <figure className="blog-code">
      <div className="surface blog-term">
        <div className="blog-term-bar">
          <span className="blog-term-dots" aria-hidden="true"><span /><span /><span /></span>
          <span className="mono blog-term-name">{name}</span>
          {props.filename && props.language && (
            <>
              <span className="sr-only"> · </span>
              <span className="mono blog-term-lang">{props.language}</span>
            </>
          )}
          <BlogCopyButton text={props.code} label={copy.copyCode} idleText={copy.copy} copiedText={copy.copied} failedText={copy.copyFailed} />
        </div>
        <pre tabIndex={0} role="region" aria-label={copy.codeLabel(name)} data-language={props.language}>
          <code>{props.code}</code>
        </pre>
      </div>
      {props.caption && <figcaption className="mono">{props.caption}</figcaption>}
    </figure>
  );
}
