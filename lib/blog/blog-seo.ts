/**
 * Metadata for the public blog pages. hreflang alternates are emitted only for locales that really
 * have a published post (linked by translationKey), unlike lib/seo.ts pageMetadata which assumes every
 * page exists in both locales. Both the index and posts advertise their `.md` twin (app/api/markdown).
 */
import type { Metadata } from "next";
import { siteUrl } from "@/lib/seo";
import { breadcrumbJsonLd, founderByName, organizationId, personId } from "@/lib/structured-data";
import { readingMinutes } from "./blog-reading-time";
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
      languages: { vi: absolute(blogIndexPath("vi")), en: absolute(blogIndexPath("en")), "x-default": absolute(blogIndexPath("en")) },
      types: { "text/markdown": `${canonical}.md` },
    },
    // Tag-filtered lists are thin duplicates of the index; keep them out of the index but follow links.
    ...(tag ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: copy.indexTitle, description: copy.indexDescription, url: canonical, type: "website", siteName: "Next Level Builders", locale: OG_LOCALE[locale] },
    twitter: { card: "summary_large_image", title: copy.indexTitle, description: copy.indexDescription },
  };
}

export function blogPostMetadata(post: BlogPost, translation: BlogPostSummary | null): Metadata {
  const title = post.seo.title ?? post.title;
  const description = post.seo.description ?? post.description ?? undefined;
  const url = absolute(blogPostPath(post.locale, post.slug));
  // An explicit SEO image wins; otherwise the post's generated Constellation card (opengraph-image route)
  // is attached by Next. Config images take precedence over the file route, so set one only when chosen.
  const images = post.seo.ogImage ? [{ url: absolute(post.seo.ogImage), alt: title }] : undefined;
  const languages: Record<string, string> = {};
  if (translation) {
    languages[post.locale] = url;
    languages[translation.locale] = absolute(blogPostPath(translation.locale, translation.slug));
    languages["x-default"] = languages.en;
  }
  return {
    title,
    description,
    alternates: { canonical: post.seo.canonical ?? url, ...(translation ? { languages } : {}), types: { "text/markdown": `${url}.md` } },
    ...(post.seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "Next Level Builders",
      locale: OG_LOCALE[post.locale],
      ...(images ? { images } : {}),
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      modifiedTime: post.updatedAt,
      ...(post.authorName ? { authors: [post.authorName] } : {}),
      tags: post.tags,
    },
    twitter: { card: "summary_large_image", title, description, ...(images ? { images } : {}) },
  };
}

/** BlogPosting plus its BreadcrumbList, as one @graph. A founder author links to the site's Person node. */
export function blogPostJsonLd(post: BlogPost): Record<string, unknown> {
  const url = absolute(blogPostPath(post.locale, post.slug));
  const founder = founderByName(post.authorName);
  const author = founder
    ? { "@type": "Person", "@id": personId(founder.id), name: founder.name, url: founder.links[0]?.href }
    : post.authorName ? { "@type": "Person", name: post.authorName } : null;
  const copy = BLOG_COPY[post.locale];
  const { "@context": _context, ...breadcrumb } = breadcrumbJsonLd(
    [{ name: "Next Level Builders", path: "/" }, { name: copy.indexTitle, path: "/blog" }, { name: post.title, path: `/blog/${post.slug}` }],
    post.locale,
  );
  void _context;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        headline: post.title,
        ...(post.description ? { description: post.description } : {}),
        inLanguage: post.locale,
        url,
        mainEntityOfPage: url,
        // The generated Constellation card stands in when the post has no cover.
        image: post.coverUrl ? absolute(post.coverUrl) : `${url}/opengraph-image`,
        ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
        dateModified: post.updatedAt,
        ...(author ? { author } : {}),
        publisher: { "@id": organizationId(), "@type": "Organization", name: "Next Level Builders", url: siteUrl(), logo: { "@type": "ImageObject", url: `${siteUrl()}/icon-512.png` } },
        isPartOf: { "@type": "Blog", name: copy.indexTitle, url: absolute(blogIndexPath(post.locale)) },
        timeRequired: `PT${readingMinutes(post.blocks)}M`,
        ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
      },
      breadcrumb,
    ],
  };
}
