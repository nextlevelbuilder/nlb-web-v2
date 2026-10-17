import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Builder League member pages and personal share links (`/wrapped/{year}/{token}`) are never crawled;
  // the public Community Wrapped page `/wrapped/{year}` stays allowed.
  const privatePaths = ["/account", "/profile", "/studio", "/sign-in", "/sign-up", "/success", "/builder-league", "/wrapped/*/"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/go/", ...["", "/vi", "/en"].flatMap((locale) => privatePaths.map((path) => `${locale}${path}`))] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
