/**
 * Cache-Control policy for responses leaving the Worker. Workers Cache (`cache.enabled` in
 * wrangler.jsonc) sits in front of the Worker, so a hit skips isolate startup entirely. It honours
 * Cache-Control and Vary, and caches responses that carry no Cache-Control heuristically, so every
 * response gets an explicit decision here:
 *
 * - Anonymous GET/HEAD renders of public pages that do not read the session become shared-cacheable
 *   for a short TTL with stale-while-revalidate.
 * - Everything else without its own Cache-Control is marked `private, no-store`; routes that already
 *   set Cache-Control keep it.
 */

const PUBLIC_TTL_SECONDS = 60;
const STALE_WHILE_REVALIDATE_SECONDS = 300;
const PUBLIC_CACHE_CONTROL = `public, max-age=${PUBLIC_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;
const NO_STORE = "private, no-store";

const SLUG = "[A-Za-z0-9_-]+";
const PUBLIC_PAGE_PATTERNS = [
  /^\/$/,
  /^\/blog$/,
  new RegExp(`^/blog/${SLUG}$`),
  /^\/courses$/,
  /^\/policies$/,
  new RegExp(`^/policies/${SLUG}$`),
  new RegExp(`^/products/${SLUG}$`),
  /^\/mcp-server$/,
];

// better-auth's default cookie names; the `__Secure-` variant is used over HTTPS.
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

export function hasSessionCookie(request: Request): boolean {
  return SESSION_COOKIE.test(request.headers.get("Cookie") ?? "");
}

/** Strips the `/vi` locale prefix and reports whether it was present. */
export function splitLocale(pathname: string): { path: string; prefixed: boolean } {
  if (pathname === "/vi") return { path: "/", prefixed: true };
  if (pathname.startsWith("/vi/")) return { path: pathname.slice(3), prefixed: true };
  return { path: pathname, prefixed: false };
}

export function isPublicPagePath(pathname: string): boolean {
  const { path } = splitLocale(pathname);
  return PUBLIC_PAGE_PATTERNS.some((pattern) => pattern.test(path));
}

function appendVary(headers: Headers, values: string[]): void {
  const current = (headers.get("Vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set(current.map((value) => value.toLowerCase()));
  for (const value of values) {
    if (!seen.has(value.toLowerCase())) current.push(value);
  }
  headers.set("Vary", current.join(", "));
}

function isEdgeCacheable(request: Request, response: Response): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (response.status !== 200 || response.headers.has("Set-Cookie")) return false;
  if (hasSessionCookie(request)) return false;
  return isPublicPagePath(new URL(request.url).pathname);
}

/**
 * next-intl answers every `/vi` page with `Set-Cookie: NEXT_LOCALE=vi`, which would keep VI pages out of
 * the edge cache. The prefix already fixes the locale there, and the language switcher writes the cookie
 * client-side on an explicit choice, so a public `/vi` page drops it when it is the only cookie set.
 */
function dropPrefixedLocaleCookie(request: Request, response: Response): Response {
  const { pathname } = new URL(request.url);
  if (!splitLocale(pathname).prefixed || !isPublicPagePath(pathname)) return response;
  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0 || !cookies.every((cookie) => cookie.startsWith("NEXT_LOCALE="))) return response;
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Returns the response with the Cache-Control (and Vary) the edge cache should act on. */
export function applyEdgeCachePolicy(request: Request, original: Response): Response {
  // Upgrade responses (WebSocket) cannot be rebuilt and are never cached.
  if (original.status === 101) return original;

  const response = dropPrefixedLocaleCookie(request, original);
  const cacheable = isEdgeCacheable(request, response);
  if (!cacheable && response.headers.has("Cache-Control")) return response;

  const headers = new Headers(response.headers);
  if (cacheable) {
    headers.set("Cache-Control", PUBLIC_CACHE_CONTROL);
    // Unprefixed paths pick EN or redirect to /vi from the NEXT_LOCALE cookie and Accept-Language,
    // so a cached EN render must not be served to a request that would have been redirected.
    if (!splitLocale(new URL(request.url).pathname).prefixed) appendVary(headers, ["Accept-Language", "Cookie"]);
  } else {
    headers.set("Cache-Control", NO_STORE);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
