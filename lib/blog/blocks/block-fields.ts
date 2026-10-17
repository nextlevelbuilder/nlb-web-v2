/**
 * Field builders shared by every blog block schema. Block input is untrusted data from admins,
 * API keys and MCP agents, so links, image sources and embeds are restricted here, once, for all blocks.
 * Isomorphic: no server-only imports.
 */
import { z } from "zod";
import { toEmbedSrc } from "./embed-url";

export const text = (max: number) => z.string().trim().min(1).max(max);
export const optText = (max: number) => z.string().trim().max(max).optional();

const UNSAFE_URL_CHARS = /[\s<>"'`\\]/;

/** Site paths ("/build-with-us"), #anchors, http(s) and mailto only; never javascript:, data: or "//host". */
export function isSafeHref(href: string): boolean {
  if (UNSAFE_URL_CHARS.test(href)) return false;
  if (/^\/(?!\/)/.test(href) || /^#[\w-]*$/.test(href)) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

/** Images are https URLs (our CDN or any https host) or site-relative paths under /images or /media. */
export function isSafeImageSrc(src: string): boolean {
  if (UNSAFE_URL_CHARS.test(src)) return false;
  if (/^\/(images|media|img)\/[A-Za-z0-9/_.-]+$/.test(src)) return !src.includes("..");
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}

export const href = z.string().trim().min(1).max(500).refine(isSafeHref, "Use a site path (/blog), #anchor, https:// or mailto: link.");
export const imageSrc = z.string().trim().min(1).max(500).refine(isSafeImageSrc, "Images must be https:// URLs or /images/, /media/ paths.");
export const embedUrl = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((url) => toEmbedSrc(url) !== null, "Only YouTube, Vimeo, Cloudflare Stream and Loom URLs can be embedded.");

/** Alt text may be empty for purely decorative images, but must be present so authors decide explicitly. */
export const altText = z.string().trim().max(300);

/** Markdown source: rendered by the safe markdown renderer, raw HTML is always shown as text. */
export const markdown = (max: number) => text(max);

export const buttonVariant = z.enum(["primary", "secondary", "ghost"]);
export const button = z.object({ label: text(60), href, variant: buttonVariant.optional() }).strict();

export const anchorId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/, "Use lowercase letters, digits and dashes, starting with a letter.");

export type BlockButton = z.infer<typeof button>;
