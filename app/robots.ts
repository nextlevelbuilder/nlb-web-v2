import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

const LOCALE_PREFIXES = ["", "/vi", "/en"];

export default function robots(): MetadataRoute.Robots {
  // Builder League member pages and personal share links (`/wrapped/{year}/{token}`) are never crawled.
  // `/wrapped/*/` blocks every path below a year (RFC 9309: `*` matches any run of characters, rules are
  // prefix matches). The public Community Wrapped page `/wrapped/{year}` has no slash after the year, so it
  // stays allowed, and the annual Hall of Fame (and its `.md` twin) is re-allowed by an exact,
  // `$`-anchored rule, which is longer and therefore wins over the disallow.
  const privatePaths = ["/account", "/profile", "/studio", "/sign-in", "/sign-up", "/success", "/onboarding", "/builder-league", "/wrapped/*/"];
  const publicExceptions = ["/wrapped/*/hall-of-fame$", "/wrapped/*/hall-of-fame.md$"];
  const localized = (paths: string[]) => LOCALE_PREFIXES.flatMap((locale) => paths.map((path) => `${locale}${path}`));
  return {
    rules: [{ userAgent: "*", allow: ["/", ...localized(publicExceptions)], disallow: ["/api/", "/go/", ...localized(privatePaths)] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
