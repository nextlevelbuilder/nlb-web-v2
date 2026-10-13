import type { Metadata } from "next";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://nextlevelbuilder.io").replace(/\/$/, "");
}

export function localizedPath(path: string, locale: string) {
  const suffix = path === "/" ? "" : path;
  return `${locale === "en" ? "/en" : ""}${suffix}` || "/";
}

export function pageMetadata({ title, description, path, locale }: {
  title: string; description: string; path: string; locale: string;
}): Metadata {
  const canonical = `${siteUrl()}${localizedPath(path, locale)}`;
  return {
    title, description,
    alternates: {
      canonical,
      languages: { vi: `${siteUrl()}${localizedPath(path, "vi")}`, en: `${siteUrl()}${localizedPath(path, "en")}`, "x-default": `${siteUrl()}${localizedPath(path, "vi")}` },
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: { title, description, url: canonical, type: "website", siteName: "Next Level Builders", locale: locale === "en" ? "en_US" : "vi_VN", images: [`${siteUrl()}/og-image.png`] },
    twitter: { card: "summary_large_image", title, description, images: [`${siteUrl()}/og-image.png`] },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
