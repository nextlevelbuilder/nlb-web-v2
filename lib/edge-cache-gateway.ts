/**
 * Normalises the requests that go through Workers Cache. The cache key is the path and query; a
 * response that varies on `Cookie` or `Accept-Language` gets one entry per distinct header value, and
 * real browsers carry per-visitor analytics cookies (`_ga`, PostHog), so varying on them would give
 * every visitor a private cache entry. The uncached gateway entrypoint therefore settles the locale
 * itself and forwards public page requests with those headers fixed, so each URL has one cached render.
 */
import { hasSessionCookie, isPublicPagePath, splitLocale } from "./edge-cache-policy";

const LOCALE_COOKIE = /(?:^|;\s*)NEXT_LOCALE=([^;]*)/;

type Locale = "en" | "vi";

function isLocale(value: string): value is Locale {
  return value === "en" || value === "vi";
}

/** The site locale an Accept-Language header prefers, or null when it names neither. */
export function preferredLocale(acceptLanguage: string): Locale | null {
  const ranges = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return { language: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter(({ language, q }) => language && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { language } of ranges) {
    if (isLocale(language)) return language;
    if (language === "*") return "en";
  }
  return null;
}

/**
 * The locale an unprefixed path renders in: the NEXT_LOCALE cookie first, then Accept-Language, then
 * English, mirroring next-intl's detection (i18n/routing.ts).
 */
export function unprefixedLocale(request: Request): Locale {
  const cookie = LOCALE_COOKIE.exec(request.headers.get("Cookie") ?? "")?.[1];
  if (cookie && isLocale(cookie)) return cookie;
  return preferredLocale(request.headers.get("Accept-Language") ?? "") ?? "en";
}

/**
 * The request to send through the cached entrypoint, or null when the request must reach Next.js
 * as it is: non-GET methods, personalised paths, signed-in visitors and unprefixed requests that
 * next-intl would redirect to `/vi`.
 */
export function toEdgeCacheRequest(request: Request): Request | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname } = new URL(request.url);
  if (!isPublicPagePath(pathname)) return null;
  if (hasSessionCookie(request)) return null;

  const { prefixed } = splitLocale(pathname);
  if (!prefixed && unprefixedLocale(request) !== "en") return null;

  const forwarded = new Request(request);
  forwarded.headers.delete("Cookie");
  // A fixed Accept-Language matches the path's locale, so next-intl neither redirects nor sets a cookie.
  forwarded.headers.set("Accept-Language", prefixed ? "vi" : "en");
  return forwarded;
}
