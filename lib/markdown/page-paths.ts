import { POLICY_SLUGS } from "@/lib/constants/policy-slugs";
import { localizedPath } from "@/lib/seo";
import { isPublicWrappedPath } from "@/lib/builder-league/public-surfaces";
import { isLiveEnabled } from "@/lib/live/live-flag";

// Only page routes may be fetched. API, OAuth callbacks, checkout and /go are
// deliberately excluded: requesting a representation must never execute them.
const pages = new Set(["/", "/blog", "/courses", "/build-with-us", "/build-with-us/instructions", "/leaderboards", "/policies", "/studio", "/profile", "/account", "/sign-in", "/sign-up", "/success", "/api-docs", "/api/docs", "/docs/api"]);

/** NLB Live index and event pages, only while the Live flag is on (the pages 404 otherwise). */
function isLivePath(path: string) {
  return /^\/live(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path) && path.length <= 126 && isLiveEnabled();
}

export function pagePath(pathname: string) {
  if (!pathname.startsWith("/") || pathname.includes("\\") || /[%?#\u0000-\u0020]/.test(pathname) || pathname.includes("//")) return null;
  const normalized = pathname.replace(/\/$/, "") || "/";
  const match = normalized.match(/^\/(en|vi)(?=\/|$)/);
  const locale = match?.[1] || "en";
  const rawPath = match ? normalized.slice(match[0].length) || "/" : normalized;
  const path = rawPath === "/index" ? "/" : rawPath === "/directory" ? "/build-with-us" : rawPath;
  if (path.split("/").some((part) => part === "." || part === "..")) return null;
  if (pages.has(path) || /^\/(products|builders|profile)\/[a-zA-Z0-9_-]+$/.test(path) || /^\/(blog|courses)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) || /^\/studio\/products\/[a-zA-Z0-9_-]+\/preview$/.test(path) || POLICY_SLUGS.some((slug) => path === `/policies/${slug}`) || isPublicWrappedPath(path) || isLivePath(path)) {
    // Canonical page URL: English unprefixed, Vietnamese under /vi (old /en links redirect there).
    return { path, locale, pathname: localizedPath(path, locale) };
  }
  return null;
}

export function markdownSourcePath(pathname: string) {
  if (!pathname.endsWith(".md")) return null;
  return pagePath(pathname.slice(0, -3) || "/");
}

export function isPrivatePage(path: string) {
  return /^(\/studio(?:\/|$)|\/account$|\/profile$|\/sign-in$|\/sign-up$|\/success$)/.test(path);
}
