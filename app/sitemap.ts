import { MetadataRoute } from "next";
import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { blogPostPath } from "@/lib/blog/blog-slug-rules";
import { listPublishedVideos } from "@/lib/courses/course-video-service";
import { getDb } from "@/lib/db";
import { POLICY_SLUGS } from "@/lib/constants/policy-slugs";
import { localizedPath, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** A failing optional source (blog, courses) drops its entries instead of breaking the sitemap. */
async function safely<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    console.error("sitemap source failed", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl();
  const products = await getAllPublishedProducts();
  const posts = await safely(() => listPostSummaries({ status: "published", limit: 500, offset: 0 }));
  const videos = await safely(() => listPublishedVideos(getDb()));
  const paths = ["/", "/build-with-us", "/build-with-us/instructions", "/leaderboards", "/blog", "/courses", "/policies", ...POLICY_SLUGS.map((slug) => `/policies/${slug}`)];
  const entries: MetadataRoute.Sitemap = [];
  const add = (path: string, lastModified?: Date) => {
    for (const locale of ["en", "vi"]) entries.push({
      url: `${baseUrl}${localizedPath(path, locale)}`,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages: { en: `${baseUrl}${localizedPath(path, "en")}`, vi: `${baseUrl}${localizedPath(path, "vi")}`, "x-default": `${baseUrl}${localizedPath(path, "en")}` } },
    });
  };
  for (const path of paths) add(path);
  entries.push({ url: `${baseUrl}/api-docs` });
  for (const product of products) add(`/products/${product.slug}`, product.updatedAt);
  for (const video of videos) add(`/courses/${video.slug}`, video.updatedAt);
  // Blog posts are single-locale documents; translations are linked through hreflang on the page.
  for (const post of posts) entries.push({ url: `${baseUrl}${blogPostPath(post.locale, post.slug)}`, lastModified: new Date(post.updatedAt) });
  return entries;
}
