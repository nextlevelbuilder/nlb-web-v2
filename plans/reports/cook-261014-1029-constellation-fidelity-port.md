# Cook report: Constellation fidelity port

Date: 2026-10-14 · Branch: `dev` (pushed, head `4ab34bb`) · Mode: `ak:cook --auto`

## Outcome

Production now follows the chosen mockup ([`mockups/06-constellation.html`](./mockups/06-constellation.html)) in design, experience and effects. It keeps the real data, pricing, the seat rule, checkout, i18n and JSON-LD.

The release went to staging first, was verified live, then went to production:

| Env | Version | URL |
|---|---|---|
| staging | `3aadac0c-bbc5-4720-afdb-d4bc6ac5c3e4` | https://nextlevelbuilder-web-staging.hi-7ac.workers.dev |
| production | `ccd1dcc7-bc88-4f4b-b362-ad12fa65b210` | https://nextlevelbuilder-web.hi-7ac.workers.dev |

The production rollback target is `d68adaf5-5be2-430f-b50b-942a89403edd`. To roll back, run `wr rollback d68adaf5-5be2-430f-b50b-942a89403edd --env=""` ([deployment-guide](../../docs/deployment-guide.md#manual-deploy)).

All wrangler calls ran with `env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08` from a temp directory with `--config`. The Digitop account was never touched, and no secrets were printed.

## Commits on `dev`

- `d5c3bf2` build(deps): gsap ~3.12.5, lenis ~1.1.20. The lockfile diff only adds them; I hand-merged it because npm 11.17 wanted to prune vite's optional esbuild peer.
- `d290400` feat(shell): site-wide header, menu, footer, static sky and data-theme tokens, plus the typed `lib/constellation/*` engine.
- `300dad6` feat(home): all chapters, real pricing, seats and checkout.
- `81d1685` refactor: removed the dead `components/sections/*`, navbar, old home widgets and toggles.
- `d8639e9` docs: DESIGN.md, design-guidelines, codebase-summary and AGENTS.md updated; contact sheet added.
- `a7ee4ff` fix(a11y): accessible names now include the visible text (EN/VI segments, back-to-top orbit).
- `4ab34bb` perf(home): motion setup moved out of the hydration commit; `/#hash` arrivals stay aligned through late refreshes.

## Parity checklist

| Element | Status | Note |
|---|---|---|
| WebGL sky: point → NLB constellation → finale star | Matched | Raw WebGL in `lib/constellation/sky-renderer.ts`, same seed and states. Starts after first paint so the headline stays the LCP element. |
| Cursor gravity + HUD celestial coordinates | Matched | Fine pointer only. |
| Nebula, dark/light palettes, light star atlas | Matched | Crossfade follows `<html data-theme>`. |
| Planisphere, split hero, plates, rules | Matched | |
| Custom cursor, magnetic CTAs | Matched | Fine pointer and motion allowed only. |
| Orbit progress with chapter numeral | Matched | The numeral is drawn from `data-n` via CSS so the accessible name stays clean. |
| Lenis + GSAP pinned hook / dark / community | Matched | `PIN_TOLERANCE_PX = 24`. The mockup's +4 only passed because it measured before fonts loaded. |
| Dark chapter word-by-word light-up | Matched | Words start at 0.13 opacity by design. Lighthouse flags that contrast; a11y still scores 96. |
| Split text (server-rendered `.w > .wi`) | Matched | Headlines are SSR-visible; the rise is CSS keyframes. |
| Sticky CTA, toasts | Matched | Toasts use real activity events only; off under reduced motion or with no events. |
| Header, full-screen menu, footer | Matched | Site-wide on every page; inner pages get the same tokens plus a static sky. |
| Course cards | Adapted | Orbit "lens" SVGs instead of mockup thumbnails, because real videos have no designed art. They show the real week, minutes and Buy price, or fall back to "Every Monday". |
| Directory chart + leaderboard | Adapted | Plotted from real rankings with integer vote ticks. Empty magnitudes become "open" rows linking to the submission instructions. |
| Proof quotes | Adapted | Flagship products (AgentKit, dewee, ReelCrew) instead of sample testimonials, so no fabricated quotes. |
| Founders, partners (DIGITOP.AI / 200LAB.IO / EGANY.COM) | New, in mockup language | Sub-chapters V·ii and V·iii. |
| "Launched by members" + "Built by the NLB team" | New, in mockup language | Hidden when the catalogue is unavailable; empty-state copy when it is empty. |
| FAQ before finale, blog logbook | New, in mockup language | The logbook renders only when posts exist. |
| Pricing: billing switch, seat rule, early-bird countdown, Terms → Polar | Matched + real | "N of M left" only when at least 50% is taken, otherwise "Limited to M members". |
| Touch | Matched | Fewer particles, no cursor effects; the signature constellation stays. |
| Reduced motion | Matched | No Lenis or pins, static per-chapter sky states, CSS kill switch, SMIL paused. 0 hidden elements. |
| No WebGL | Matched | Designed SVG sky fallback. |
| data-theme, no flash | Matched | next-themes `attribute="data-theme"`. |

## Verification

- Typecheck passes. Lint has 0 errors; the warnings all predate this work, and none come from lines I changed. Tests: 72 files, 719 passed. `build:worker` passed for both staging and production values.
- Parity screenshots were taken at 1440×900, 820×1180 and 390×844, dark and light, at every chapter, for the mockup, local app, staging and production. Committed sheets:
  - [`visual-parity-261014/contact-sheet.jpg`](./visual-parity-261014/contact-sheet.jpg): mockup vs app.
  - [`visual-parity-261014/production-contact-sheet.jpg`](./visual-parity-261014/production-contact-sheet.jpg): live production.
  - The full-size PNGs are gitignored, in `plans/reports/visual-parity-261014/`:
    - `mockup-*`, `app-*`, `staging-*` and `production-*`, named `{target}-{viewport}-{theme}-{chapter}.png`;
    - `staging-live-*` and `production-live-*` for inner pages and the checkout dialog;
    - `check-*` for overflow, reduced motion, focus, VI and inner pages.
- Console is clean on the home page at every capture combo (mockup, app, staging, production). The only output is SwiftShader's "GPU stall due to ReadPixels", which the screenshot readback causes.
- No horizontal scroll at 1440, 820/768, 390/375 or 320.
- Keyboard: skip link, brand, nav and segments show a 2px focus ring.
- EN/VI diacritics render correctly ("Mọi sản phẩm đều bắt đầu từ một đốm sáng.").
- Live behaviour, the same on staging and production:
  - `/#pricing` lands with pricing 8px from the top;
  - nav anchors scroll through Lenis, and the wheel takes over;
  - a load without a hash stays at the top;
  - the Join button opens the Terms dialog before Polar;
  - reduced motion has 0 pins and 0 hidden elements.
- Lighthouse on home, live production:
  - desktop: perf 96, a11y 96, BP 100, SEO 92;
  - mobile: perf 65 (staging runs ranged 63–76), a11y 96, BP 100, SEO 92.
  - The SEO 92 is the canonical pointing at `nextlevelbuilder.io` from the workers.dev host, which is expected there.

## Concerns

- **Mobile performance regressed** versus the old production page: 87 → about 65–76. TBT fell from 770 ms to about 300–490 ms after the motion deferral. What remains is React hydration of a larger page, WebGL setup (inflated by Lighthouse's SwiftShader) and the mockup's hero word-rise delaying LCP. Desktop is 96. Further gains would mean changing the designed hero timing or lazy-hydrating chapters.
- **`/build-with-us` console errors predate this work.** Verified on the old production: the realtime traffic API returns 503, plus Turnstile challenge-iframe noise.
- **CI cannot deploy yet.** The deploy job fails at the D1 migrate step until the repo's `CLOUDFLARE_API_TOKEN` gets D1 permission ([deployment-guide](../../docs/deployment-guide.md)). Both deploys were manual.
- **Locale cookie.** After visiting `/vi`, unprefixed URLs render VI because of next-intl's locale cookie. That's existing behaviour, not changed here.

Status: DONE_WITH_CONCERNS
Summary: The constellation mockup is ported faithfully (sky, pins, cursor, orbit progress, sticky CTA, toasts, split text, shell) with real pricing, seats, checkout and i18n. It was verified locally, deployed and checked on staging, then deployed and checked on production.
Concerns/Blockers: Mobile Lighthouse performance is about 65–76, down from 87 on the old page; desktop is 96 and a11y is 96. CI deploy still needs a D1-capable token. The /build-with-us console errors predate this work.
