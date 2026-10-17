# UX/AX review: nlb-web-v2 — 2026-10-13

## Verdict
The biggest win was making content visible to everyone. The section reveal shipped `opacity:0` in the server HTML, so every home chapter headline was blank to crawlers, no-JS visitors and full-page captures. The courses pages also lost their mobile gutters. Both are fixed, and the AX surfaces now pass the discovery scan with zero errors and warnings on all 37 sitemap pages, on staging and production. The DONE contract passes; the skipped Could items are listed with reasons.

## Scope and environment
- Mode: `--auto`, a single round. Focus: the whole public web app.
- URLs:
  - staging https://nextlevelbuilder-web-staging.hi-7ac.workers.dev (`--site-origin https://staging.nextlevelbuilder.io`);
  - production https://nextlevelbuilder-web.hi-7ac.workers.dev (`--site-origin https://nextlevelbuilder.io`).
- Baseline: staging at `c0ba062` (before this pass's UX/AX commits). After: staging, then production, at `3805c2f`.
- Pages: `/`, `/vi`, `/blog`, `/courses`, `/api-docs` (screenshots), plus all 37 sitemap URLs (scan).
- Capture: puppeteer-core with local Chrome (`scratchpad/pp/shots.mjs`). It scrolls through the page before the full-page capture so in-view reveals fire.
- Not run:
  - no `ak:frontend-design` render-check script (the puppeteer captures replaced it);
  - no field Core Web Vitals (no CrUX data for workers.dev);
  - no Safari clipboard check (no page actions were added).

## Baseline evidence
- Full-page captures at 1440×900, 768×1024 and 375×812: `enhance-ux-ax-261013-2030-nlb-web-v2/round-0-baseline/` (local only; `*.png` is gitignored, 20 MB).
- Committed crops:
  - `key-desktop-home-dark-chapter-before.jpg`: the chapter I headline is missing;
  - `key-mobile-courses-before.jpg`: text flush against the screen edge.
- Console: `pageerror: __name is not defined` on every page, at every viewport (the theme no-flash script).
- Discovery scan (`scan-round-0-staging.txt`, 40 pages), exit 1:
  - 5 errors:
    - `/blog` and `/vi/blog` missing `og:image`;
    - `/courses.md` and `/vi/courses.md` advertised but 404;
    - `/api-docs` missing `og:image`;
  - 7 warnings: blog twins missing; `/api-docs` missing `og:title`, `og:description`, `og:url`, `twitter:card` and JSON-LD;
  - info: `og:image:alt` missing site-wide, `llms.txt` without `X-Robots-Tag: noindex`, `/api-docs` canonical pointing at production from staging.

## Scores
| Area | Before | After | Evidence |
|---|---|---|---|
| First impression | 2 | 2 | The hero says "Every product starts as a single point of light", with a plain-language subhead and one primary CTA |
| Brand recall | 3 | 3 | Wordmark, serif and italic gold emphasis, numbered mono chapter plates repeated on every section |
| Content punch | 2 | 2 | Chapter headlines state the problem plainly ("Most builders ship in the dark — no feedback, no audience, no momentum.") |
| Clarity and hierarchy | 2 | 2 | One primary action per view; the pricing CTAs open a confirm dialog |
| Storytelling | 3 | 3 | Chapters run problem → insight → courses → directory → proof → pricing → FAQ → finale |
| Knowledge and trust | 2 | 2 | Named team with real companies, a real partner (EGANY.COM), real seat caps ("Limited to 30 members") |
| Motion | 1 | 2 | Before: content hidden until JS (`key-desktop-home-dark-chapter-before.jpg`). After: the server HTML is visible, only below-the-fold elements fade (600 ms, transform/opacity), reduced motion drops the movement |
| Responsive | 1 | 2 | Before: no gutter on `/courses` at 375 (`key-mobile-courses-before.jpg`). After: gutters restored; no overflow at 320/375/768/1440 on any checked page |
| Accessibility | 2 | 3 | Lighthouse accessibility 100 on home EN, VI, blog and courses (staging and production) |
| Performance feel | not measured | not measured | No field data; the hero is text (LCP is not an image) |

## Proposals
### P1: Section reveal hides content in the server HTML (Must) [done]
- Evidence:
  - `key-desktop-home-dark-chapter-before.jpg`;
  - `components/home/reveal.tsx` used framer-motion `initial={{opacity:0}}`.
  - This is a known mistake in the best-practices file ("Content hidden at opacity: 0 until a scroll-reveal script runs").
- Change: Reveal keeps the server HTML visible. After hydration, it marks only elements still below the viewport as `pending`, and an IntersectionObserver reveals them. The CSS is `.reveal` in `app/globals.css`.
  - The first attempt used a CSS scroll-driven animation (`animation-timeline: view()`). It failed verification: with a tall viewport the timeline is inactive and the backwards fill kept the content at `opacity: 0`. Googlebot renders this way, so the attempt was replaced (commit `3805c2f`).
- Files: `components/home/reveal.tsx`, `app/globals.css`.
- Acceptance: `scratchpad/pp/reveal-check.mjs` must report opacity 1 for "scrolled into view", "tall viewport" and "reduced motion, no JS". It passes on staging and production.

### P2: Course pages lose their side gutters (Must) [done]
- Evidence: `key-mobile-courses-before.jpg`. The class string was `wrap w-full`, and the `w-full` utility overrides `.wrap`'s gutter width.
- Change: dropped `w-full` on both course pages and recorded the rule in DESIGN.md.
- Acceptance: `key-mobile-courses-after.jpg` shows a 20 px gutter; no overflow at 320 px.

### P3: Theme script crashes on the deployed Worker (Must) [done in the fix pass]
- Evidence: `__name is not defined` on every page in the baseline.
- Change: `keep_names: false` in `wrangler.jsonc`.
- Acceptance: `round-1*/report.json` shows no console errors on any page or viewport. The theme persists across reloads and the class is set before hydration (`live-verify.mjs`: `themeBeforeHydration: light`).

### P4: Advertised course markdown twins return 404 (Must) [done]
- Change: added `/blog`, `/courses` and the kebab-case `/blog/<slug>` and `/courses/<slug>` paths to `lib/markdown/page-paths.ts`.
- Acceptance: `/courses.md`, `/vi/courses.md`, `/blog.md` and `/vi/blog.md` return 200 `text/markdown`. Tests are in `tests/discovery-surfaces.test.ts`.

### P5: Blog index and API reference have no social image (Must) [done]
- Change:
  - `defaultOgImage()` in `lib/seo.ts` (1200×630 with alt text), used by `pageMetadata`, the blog metadata and `/api-docs`;
  - the blog index gets a `twitter:card`;
  - `/api-docs` gets OG and Twitter tags and `TechArticle` JSON-LD.
- Acceptance: the scan reports no open-graph or twitter-card finding.

### P6: Blog pages do not advertise markdown twins (Should) [done]
- Change: `alternates.types["text/markdown"]` on the blog index and posts.

### P7: `og:image:alt` missing site-wide (Should) [done]

### P8: llms files (Should) [done]
- `X-Robots-Tag: noindex` on `llms.txt` and `llms-full.txt`.
- Fixed the wrong locale note: English is unprefixed, Vietnamese uses `/vi`.
- Blog and Courses entries, and blog post links to their `.md` twins.

### P9: `/api-docs` canonical is hard-coded to production (Should) [done]
- The canonical now uses `siteUrl()`, so each environment self-references.

### P10: `Accept: text/markdown` negotiation (Could) [skipped]
- The scan rates it optional. The `.md` twins and `rel="alternate"` already serve agents. Accepted.

### P11: Copy page / Open in AI / Share actions on blog posts (Could) [skipped]
- There are no published posts on either environment to build and verify against. Revisit once the blog has content.

### P12: Per-page generated social cards (Could) [skipped]
- One branded static card is used site-wide. A per-page OG image route is a design task for later.

## DONE contract
1. Every Must and Should proposal (P1–P9) meets its acceptance checks. P10–P12 are Could items, skipped with the reasons above. **Pass.**
2. `check-discovery-surfaces.mjs --sample 40` exits 0 on staging and production and checks all 37 sitemap pages. The remaining info lines are optional content negotiation (P10) and the crawler-policy note, which is an owner decision. **Pass.**
3. Captures at 1440×900, 768×1024 and 375×812 of every changed page (`round-1/`, `round-1-production/`) show no horizontal overflow; the 320 px check passes. Vision review found no High issue. The sticky CTA appears mid-page only in full-page captures, because it is a fixed element. **Pass.**
4. No rubric area regressed. Motion and Responsive rose from 1 to 2. Performance feel was not measured (see questions). **Pass, with one recorded gap.**
5. Keyboard and reduced motion:
   - the checkout dialog opens from the CTA;
   - the Terms checkbox gates "Continue to Polar checkout";
   - the dialog has an accessible name;
   - reduced motion with no JS shows content at opacity 1.
   **Pass.**
6. Typecheck is clean, lint has 0 errors (94 pre-existing warnings), and 700 tests pass (2 skipped). The opennext build succeeds for staging and production. **Pass.**
7. Added `DESIGN.md`, `REVIEW.md` and `AGENTS.md`; updated the Motion and Themes sections of `docs/design-guidelines.md`. No prior content was removed. **Pass.**
8. No dev server was started; the headless Chrome instances closed with each script. **Pass.**

## Round log
| Round | Proposals done | Checks passing | Regressions fixed | Notes |
|---|---|---|---|---|
| 1 | P1–P9 | 8/8 | The first P1 attempt (scroll-driven CSS) was hidden on tall viewports; replaced | Verified on staging, then production |

## Unresolved questions
- The FAQ carries FAQPage JSON-LD because the coordinator required it. The skill's dated evidence says Google retired FAQ rich results in May 2026, so the markup is harmless but earns nothing in search.
- AI crawler policy: robots.txt blocks no search, user or training bot. Should training crawlers (GPTBot, ClaudeBot, CCBot) be blocked? This is an owner decision.
- Performance feel: no field data yet on workers.dev. Measure LCP/INP/CLS after the domain cutover.
