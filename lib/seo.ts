import type { Metadata } from "next";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://nextlevelbuilder.io").replace(/\/$/, "");
}

/** English is the unprefixed default locale; Vietnamese lives under /vi (next-intl `as-needed`). */
export function localizedPath(path: string, locale: string) {
  const suffix = path === "/" ? "" : path;
  return `${locale === "vi" ? "/vi" : ""}${suffix}` || "/";
}

/** Site-wide social card; per-page metadata reuses it so every share shows the brand. */
export function defaultOgImage() {
  return { url: `${siteUrl()}/og-image.png`, width: 1200, height: 630, alt: "Next Level Builders: a community of builders shipping products together" };
}

export function pageMetadata({ title, description, path, locale }: {
  title: string; description: string; path: string; locale: string;
}): Metadata {
  const canonical = `${siteUrl()}${localizedPath(path, locale)}`;
  return {
    title, description,
    alternates: {
      canonical,
      languages: { vi: `${siteUrl()}${localizedPath(path, "vi")}`, en: `${siteUrl()}${localizedPath(path, "en")}`, "x-default": `${siteUrl()}${localizedPath(path, "en")}` },
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: { title, description, url: canonical, type: "website", siteName: "Next Level Builders", locale: locale === "en" ? "en_US" : "vi_VN", images: [defaultOgImage()] },
    twitter: { card: "summary_large_image", title, description, images: [defaultOgImage()] },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
