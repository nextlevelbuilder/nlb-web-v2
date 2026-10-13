import { MetadataRoute } from "next";
import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { POLICY_SLUGS } from "@/lib/constants/policy-slugs";
import { localizedPath, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl();
  const products = await getAllPublishedProducts();
  const paths = ["/", "/build-with-us", "/build-with-us/instructions", "/leaderboards", "/policies", ...POLICY_SLUGS.map((slug) => `/policies/${slug}`)];
  const entries: MetadataRoute.Sitemap = [];
  const add = (path: string, lastModified?: Date) => {
    for (const locale of ["vi", "en"]) entries.push({
      url: `${baseUrl}${localizedPath(path, locale)}`,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages: { vi: `${baseUrl}${localizedPath(path, "vi")}`, en: `${baseUrl}${localizedPath(path, "en")}`, "x-default": `${baseUrl}${localizedPath(path, "vi")}` } },
    });
  };
  for (const path of paths) add(path);
  entries.push({ url: `${baseUrl}/api-docs` });
  for (const product of products) add(`/products/${product.slug}`, product.updatedAt);
  return entries;
}
