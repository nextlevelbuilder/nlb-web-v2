/**
 * Metadata for the public blog pages. hreflang alternates are emitted only for locales that really
 * have a published post (linked by translationKey), unlike lib/seo.ts pageMetadata which assumes every
 * page exists in both locales and advertises a .md twin the blog does not serve.
 */
import type { Metadata } from "next";
import { siteUrl } from "@/lib/seo";
import { BLOG_COPY } from "./blog-copy";
import { blogIndexPath, blogPostPath } from "./blog-slug-rules";
import type { BlogLocale, BlogPost, BlogPostSummary } from "./blog-types";

const OG_LOCALE: Record<BlogLocale, string> = { en: "en_US", vi: "vi_VN" };

const absolute = (urlOrPath: string) => (/^https?:\/\//i.test(urlOrPath) ? urlOrPath : `${siteUrl()}${urlOrPath}`);

export function blogIndexMetadata(locale: BlogLocale, tag?: string): Metadata {
  const copy = BLOG_COPY[locale];
  const canonical = absolute(blogIndexPath(locale));
  return {
    title: copy.indexTitle,
    description: copy.indexDescription,
    alternates: {
      canonical,
      languages: { vi: absolute(blogIndexPath("vi")), en: absolute(blogIndexPath("en")), "x-default": absolute(blogIndexPath("vi")) },
    },
    // Tag-filtered lists are thin duplicates of the index; keep them out of the index but follow links.
    ...(tag ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: copy.indexTitle, description: copy.indexDescription, url: canonical, type: "website", siteName: "Next Level Builders", locale: OG_LOCALE[locale] },
  };
}

export function blogPostMetadata(post: BlogPost, translation: BlogPostSummary | null): Metadata {
  const title = post.seo.title ?? post.title;
  const description = post.seo.description ?? post.description ?? undefined;
  const url = absolute(blogPostPath(post.locale, post.slug));
  const image = post.seo.ogImage ?? post.coverUrl ?? `${siteUrl()}/og-image.png`;
  const languages: Record<string, string> = {};
  if (translation) {
    languages[post.locale] = url;
    languages[translation.locale] = absolute(blogPostPath(translation.locale, translation.slug));
    languages["x-default"] = languages.vi;
  }
  return {
    title,
    description,
    alternates: { canonical: post.seo.canonical ?? url, ...(translation ? { languages } : {}) },
    ...(post.seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "Next Level Builders",
      locale: OG_LOCALE[post.locale],
      images: [absolute(image)],
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      modifiedTime: post.updatedAt,
      ...(post.authorName ? { authors: [post.authorName] } : {}),
      tags: post.tags,
    },
    twitter: { card: "summary_large_image", title, description, images: [absolute(image)] },
  };
}

export function blogPostJsonLd(post: BlogPost): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    ...(post.description ? { description: post.description } : {}),
    inLanguage: post.locale,
    mainEntityOfPage: absolute(blogPostPath(post.locale, post.slug)),
    ...(post.coverUrl ? { image: absolute(post.coverUrl) } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    ...(post.authorName ? { author: { "@type": "Person", name: post.authorName } } : {}),
    publisher: { "@type": "Organization", name: "Next Level Builders", url: siteUrl() },
    ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
  };
}
