/**
 * Share targets for a post. Every URL is built from the post's canonical public URL (site origin +
 * localized path), never from the request, so a crafted Host or query cannot leak into share links.
 * The links are plain anchors and work without JavaScript.
 */
import { siteUrl } from "@/lib/seo";
import { blogPostPath } from "./blog-slug-rules";
import type { BlogLocale } from "./blog-types";

export interface BlogShareLinks {
  url: string;
  x: string;
  facebook: string;
  linkedin: string;
}

export function blogPostPublicUrl(locale: BlogLocale, slug: string): string {
  return `${siteUrl()}${blogPostPath(locale, slug)}`;
}

/** Throws on anything other than an absolute http(s) URL; query and fragment are dropped. */
export function buildShareLinks(publicUrl: string, title: string): BlogShareLinks {
  const parsed = new URL(publicUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`Share URL must be http(s): ${parsed.protocol}`);
  const url = `${parsed.origin}${parsed.pathname}`;
  const u = encodeURIComponent(url);
  return {
    url,
    x: `https://x.com/intent/post?url=${u}&text=${encodeURIComponent(title.trim())}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
  };
}
