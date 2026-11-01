# Edge cache misses for returning visitors

Status: open, needs a product decision. Date: 2026-10-31.

## Summary

Public pages are cached by Workers Cache since #76 and #78 (released in #79). A request without visitor cookies is a HIT in 0.14–0.25 s on production. Real browsers carry `_ga`, `_ga_MJ62DM021G` and the PostHog cookie, and public responses send `Vary: Accept-Language, Cookie`, so every visitor gets their own cache entry. Returning visitors and client-side (RSC) navigations therefore MISS and render in 3–8 s.

## Measurements

| Case | Result |
|---|---|
| Production, no cookies, warm | HIT 0.14–0.25 s |
| Production, `_ga` cookie, first request | MISS 3–8 s |
| Request without `Accept-Language` | next-intl sets `NEXT_LOCALE=en`, `Set-Cookie` makes it BYPASS |
| Staging with #80 (gateway entrypoint), `/` | MISS 7.6 s, MISS 10.7 s, HIT 2.5 s |
| Staging with #80, `/blog` | HIT 1.8 s, 3.9 s, 4.9 s |
| Staging with #80, `/vi/mcp-server` | HIT 3.5 s, 2.5 s |

## Why #80 was reverted (#81)

#80 made the default entrypoint strip cookies and forward cacheable requests to a `CachedPages` entrypoint through `ctx.exports`, with Workers Cache enabled only on that entrypoint. Visitors did share one entry, but the default entrypoint is the same 50 MB OpenNext bundle, so every request still paid the isolate start before the cache lookup. HITs took 1.8–4.9 s, slower than the 0.2 s cookie-less HIT production already has. Locale redirects, `/account` (private) and `/mcp` were correct.

## Options

**A. Thin gateway Worker (recommended).** A separate small Worker owns the routes, removes analytics cookies, normalizes `Accept-Language` to `en`/`vi`, answers the unprefixed-path locale redirect itself, and calls `nextlevelbuilder-web` through a service binding to a cache-enabled entrypoint. The small bundle starts fast, so HITs stay near 0.2 s for every visitor. Cost: one more Worker and deploy step; routes and custom domains move from `nextlevelbuilder-web` to the gateway. This changes production routing, so it was not done unattended.

**B. Drop `Vary: Cookie` and `Accept-Language` on unprefixed paths.** Serve English on `/` to everyone and move the "switch to Vietnamese" suggestion to the client (banner or redirect after load). No new Worker, but it changes first-visit behaviour for Vietnamese visitors and SEO-visible redirects.

Either option should also drop `next-router-state-tree` from `Vary` for RSC requests or normalize it, because it fragments RSC cache entries per navigation origin.

## Decisions needed

1. A or B?
2. If A: may the gateway take over the production custom domain, with the current Worker as a fallback route during rollout?
