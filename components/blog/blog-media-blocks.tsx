/** Media blog blocks: image, gallery, video, embed and code. Embeds use allowlisted player URLs only. */
import React from "react";
import { resolveEmbed } from "@/lib/blog/blocks/embed-url";
import { cn } from "@/lib/utils";
import { WIDTH_CLASS, type BlockViewProps } from "./blog-block-view-types";

const IFRAME_ALLOW = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
const ASPECT_CLASS = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square", "9:16": "aspect-[9/16] max-w-sm mx-auto" } as const;

/** Sandboxed provider iframe. Renders nothing if the URL no longer passes the allowlist. */
function EmbedFrame({ url, title, aspect }: { url: string; title: string; aspect: keyof typeof ASPECT_CLASS }) {
  const target = resolveEmbed(url);
  if (!target) return null;
  return (
    <div className={cn("w-full overflow-hidden rounded-lg border border-line bg-canvas-deep", ASPECT_CLASS[aspect])}>
      <iframe
        src={target.src}
        title={title}
        allow={IFRAME_ALLOW}
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        className="h-full w-full"
        data-provider={target.provider}
      />
    </div>
  );
}

export function ImageBlock({ props }: BlockViewProps<"image">) {
  return (
    <figure className={WIDTH_CLASS[props.width ?? "prose"]}>
      {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
      <img src={props.src} alt={props.alt} width={props.pixelWidth} height={props.pixelHeight} loading="lazy" decoding="async" className="h-auto w-full rounded-lg border border-line" />
      {props.caption && <figcaption className="mt-2 text-center text-step-sm text-ink-3">{props.caption}</figcaption>}
    </figure>
  );
}

const GALLERY_COLUMNS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

export function GalleryBlock({ props }: BlockViewProps<"gallery">) {
  return (
    <figure className={WIDTH_CLASS.wide}>
      <div className={cn("grid grid-cols-1 gap-4", GALLERY_COLUMNS[props.columns ?? 2])}>
        {props.images.map((image, index) => (
          <figure key={index}>
            {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size */}
            <img src={image.src} alt={image.alt} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
            {image.caption && <figcaption className="mt-1 text-step-sm text-ink-3">{image.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {props.caption && <figcaption className="mt-3 text-center text-step-sm text-ink-3">{props.caption}</figcaption>}
    </figure>
  );
}

export function VideoBlock({ props }: BlockViewProps<"video">) {
  return (
    <figure className={WIDTH_CLASS.wide}>
      <EmbedFrame url={props.url} title={props.title} aspect="16:9" />
      {props.caption && <figcaption className="mt-2 text-center text-step-sm text-ink-3">{props.caption}</figcaption>}
    </figure>
  );
}

export function EmbedBlock({ props }: BlockViewProps<"embed">) {
  return (
    <div className={WIDTH_CLASS.prose}>
      <EmbedFrame url={props.url} title={props.title} aspect={props.aspect ?? "16:9"} />
    </div>
  );
}

/** Code is rendered as a React text node, so it is escaped and never interpreted. */
export function CodeBlock({ props }: BlockViewProps<"code">) {
  return (
    <figure className={WIDTH_CLASS.wide}>
      <div className="overflow-hidden rounded-lg border border-line bg-canvas-deep">
        {(props.filename || props.language) && (
          <div className="flex items-center justify-between border-b border-line px-4 py-2 font-mono text-step-xs text-ink-3">
            <span>{props.filename}</span>
            <span className="uppercase">{props.language}</span>
          </div>
        )}
        <pre className="overflow-x-auto p-4 font-mono text-step-sm leading-relaxed text-ink" data-language={props.language}>
          <code>{props.code}</code>
        </pre>
      </div>
      {props.caption && <figcaption className="mt-2 text-step-sm text-ink-3">{props.caption}</figcaption>}
    </figure>
  );
}
