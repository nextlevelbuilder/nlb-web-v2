/** Post slug rules (pure): one lowercase kebab-case segment, unique per locale. */
import { localizedPath } from "@/lib/seo";
import type { BlogLocale } from "./blog-types";

export const BLOG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_BLOG_SLUG_LENGTH = 96;

/** Title → slug: strips Vietnamese diacritics (đ → d), lowercases, joins words with "-". */
export function slugifyTitle(title: string, maxLength = MAX_BLOG_SLUG_LENGTH): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
}

/** Public path of a post: Vietnamese is unprefixed, English lives under /en (site-wide convention). */
export function blogPostPath(locale: BlogLocale, slug: string): string {
  return localizedPath(`/blog/${slug}`, locale);
}

export function blogIndexPath(locale: BlogLocale): string {
  return localizedPath("/blog", locale);
}
