import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/account", "/profile", "/studio", "/sign-in", "/sign-up", "/success"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/go/", ...["", "/vi", "/en"].flatMap((locale) => privatePaths.map((path) => `${locale}${path}`))] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
