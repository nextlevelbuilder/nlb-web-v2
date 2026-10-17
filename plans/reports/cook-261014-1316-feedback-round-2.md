# Cook report: owner feedback round 2

Date: 2026-10-14 (Asia/Saigon) · Branch: `dev` @ `2b7dbf1` (pushed, never main) · Plan: `plans/261014-1317-feedback-round-2/plan.md`

All seven items shipped to staging and then to production, and were verified live on both. Constellation vocabulary kept throughout: chapter numerals, mono kickers, Cormorant headings, star and orbit motifs, both themes, EN and VI with full diacritics.

Live:
- staging https://nextlevelbuilder-web-staging.hi-7ac.workers.dev, version `8265459a-9c18-445b-9643-92e1c7c5274a`
- production https://nextlevelbuilder-web.hi-7ac.workers.dev, version `8d52a13d-b556-4e9f-bf78-a16c5375616f`

## Commits (dev, 207be2c..2b7dbf1)

| Commit | Subject |
|---|---|
| 207be2c | refactor(styles): share constellation section and card primitives across pages |
| 6bf9ccd | feat(home): add founder pronunciation and full profile link rows |
| ef7f675 | feat(nav): show the full navigation on every page |
| e282637 | feat(brand): use the star mark as favicon and add a web app manifest |
| 6b39d9c | feat(seo): generated social cards, linked structured data and agent discovery |
| 13851d7 | feat(courses): rebuild the courses page with a 200lab and ZueyOS reading list |
| e286a7f | feat(blog): constellation index and post pages with a product-cards block |
| 0fb7324 | fix(markdown): render tables in markdown page twins |
| 4d7d526 | feat(media): serve public R2 media through the app origin |
| e046bd6 | feat(directory): seed six ecosystem tools through the moderated publish path |
| 1a4624b | feat(home): show the six ecosystem tools in the team row |
| 848a411 | feat(blog): describe the blog index with Blog and breadcrumb structured data |
| b184b7f, cd50490 | fix(media): derive promoted asset URLs from the app media route; ignore the unbound asset host |
| f67fcfe | docs: map media serving, ecosystem seed, social cards and structured data |
| 1dbff75 | feat(directory): expose the listing cover image in the published projection |
| 4683ecb | feat(directory): constellation directory and product pages with server-side search |
| 2b7dbf1 | fix(directory): hide the live traffic card when no traffic provider is configured |

## Checklist per item

### 1. Founder card (Duy)
- [x] `/zuey/` phonetic next to the name (`lib/constants/home-content.ts`)
- [x] Link row: ZUEY.ME · DIGITOP.AI · T.O.P GROUP · FACEBOOK · X @goon_nguyen
- [x] Person JSON-LD `sameAs` carries the same profiles

### 2. Favicon and manifest
- [x] Star-mark favicon set: ico 16/32/48, adaptive SVG, 192, 512, apple-touch, maskable
- [x] `manifest.webmanifest` returns 200 `application/manifest+json` on both environments

### 3. SEO / GEO / social / agents
- [x] Per-page metadata, canonical, hreflang (en / vi / x-default)
- [x] Per-page `opengraph-image` routes, plus Twitter cards
- [x] JSON-LD: Organization, WebSite+SearchAction (`/build-with-us?q=`), Person, SoftwareApplication+Offer, Course, Blog, BlogPosting, BreadcrumbList, FAQPage
- [x] Sitemap with lastmod, robots, `llms.txt`, `llms-full.txt`, `.md` twins (GFM tables now render), `/.well-known/mcp.json`, `ai-catalog.json`, `api-catalog`, `Link` headers
- [x] Semantic no-JS HTML: directory search is a GET form `role=search` and the server renders `?q=` results
- [x] ak-enhance-ux-ax discovery scan: 0 errors and 0 warnings on staging and on production (table below)

### 4. Header nav
- [x] Courses · Directory · Leaderboard · Blog · Pricing · Build with us on every page, mirrored in the mobile menu

### 5. /courses
- [x] Constellation page plus sidebar: 200lab featured courses and ZueyOS knowledges, Cache API 6h, fallback, UTM
- [x] Lighthouse accessibility 100 (EN and VI)

### 6. Blog
- [x] Constellation index and post redesign, plus an additive `product-cards` block
- [x] Three factual posts in EN and VI via the REST API, author Duy Nguyen, rich widgets (product cards, tables, callouts, code); staging first, then production
- [x] Temporary admin API key `tmp-blog-seed-261014` deleted on both environments (D1 count 0); local key file removed and never printed

### 7. Six ecosystem products
- [x] D1 exported before writing: `/Volumes/GOON/www/nlb/.d1-backups/d1-{staging,prod}-261014-pre-ecosystem-seed.sql`, plus a fresh `d1-prod-261014-pre-ecosystem-seed-2.sql` just before the production write (mode 600)
- [x] Seeded through the real domain path: draft, revision (validated, content hash), submission, automated checks (`safe_fetch`, `ai_safety`), then an admin human decision. Idempotent by slug and hash; a re-run on staging reported all six unchanged.
- [x] Owner is the AgentKit organization. Makers: Duy for five products, Viet Tran for 3dviz-pro-max.
- [x] Media content-addressed in R2 (`public/products/<slug>/<name>-<sha8>.webp`), served by `/media/<key>` (immutable cache, ETag, 304 on conditional requests)
- [x] No fake votes and no seeded trust: `trust_score` 0 and 0 votes on all six (verified in production D1)
- [x] Showcased in the home team row and the toolkits chapter (internal links to `/products/<slug>`). /build-with-us and the product pages rebuilt in Constellation style.

## Products (published, revision approved, checks passed, decision approved/admin)

| Slug | Maker | Staging product id | Production product id | Production revision id |
|---|---|---|---|---|
| multix-cli | Duy Nguyen | dc7a54f0-73d8-416c-af8c-44f0429af87b | fd806940-5c62-436b-9ce5-7f46260b2129 | f33567ab-5f27-4886-8d10-78807a526bac |
| cloud-harness-mcp | Duy Nguyen | 3ed2f94a-dd64-4902-b71b-2d3c661716f7 | 038b10f2-186f-41f7-a2b5-e1d877bd1d71 | e3a7e566-7e01-4617-aa58-058c904acf40 |
| design-studio-ai | Duy Nguyen | 6e636652-5dc3-4e78-bbab-2eb601ae1b81 | 373281a5-b6b5-4e59-a61a-6d9e13bddb90 | 56467fc3-a87a-4806-8360-d646ff0c93f0 |
| ak-render | Duy Nguyen | c9c19681-0103-4f4e-883c-6c755ef5586c | 9f417cf4-5577-48a0-b539-62ba7495cac6 | b28b3aad-cc77-4923-a882-b384f909f56f |
| 3dviz-pro-max | Viet Tran | cc0b0092-88d2-4e5a-85ed-f733ff0b7ebc | 05e5af61-54de-4863-8650-2d441b584bb6 | 73bc5ac6-ea88-4e56-8a00-e95ffd1c351f |
| anymd | Duy Nguyen | 6f63372b-7d1b-404a-9707-ec3c372d7275 | af85568a-607c-4625-991d-846d1910db67 | bd862bd8-3623-44c8-9773-6ab56f5e954f |

Staging revision ids, in table order: 965e64e1-b777-4f42-85c7-caa1950b5b62, 5b806669-eccd-40d6-a8d7-cee2a960639e, 0ee19f85-dfdc-4e0f-8afa-91eeb6688b9e, 5bcd4477-9e18-451c-b09d-21d726498ea7, 30892e1f-a162-4795-9e9b-754da593b996, 12f6da0b-d46d-4e21-898a-da9eecf08a12.

## Posts published (author Duy Nguyen)

| Locale | Slug | Staging id | Production id |
|---|---|---|---|
| en | introducing-next-level-builders-v2 | f5347447-7be5-40a2-999c-e1bb472220dc | fd42202f-58ab-401a-a837-4ace4499bcf9 |
| en | launch-your-product-from-the-terminal | d22b280d-7ebe-4f98-b379-5af4060a7ee8 | 25771139-398a-47b4-b450-9fb9a4458ddd |
| en | six-tools-from-the-nlb-ecosystem | c9a52709-aa88-49cb-a6b3-84ff1e547e8d | dd7c4bf7-8d8a-4a5b-8ae4-1cc72100457c |
| vi | gioi-thieu-next-level-builders-v2 | 5a97ed45-e1a4-4d69-b0bc-15f5beb39db3 | 14d7864b-1029-4c02-926c-c27ec7914cfa |
| vi | ra-mat-san-pham-tu-terminal | b4420a1f-0d76-4c0e-9534-04bb8cdef36c | 1a66e8e8-4fdd-447c-b8e2-4fc0c8295255 |
| vi | sau-cong-cu-tu-he-sinh-thai-nlb | 0e511e9a-8453-4a2c-9316-69ef999a0d73 | b2a5831e-5d86-478e-9715-06c200ad83d3 |

All return 200 on production, with BlogPosting, BreadcrumbList and Person JSON-LD, and `.md` twins with tables.

## SEO / GEO / agent audit

| Surface | Staging | Production | Notes |
|---|---|---|---|
| Discovery scan (ak-enhance-ux-ax, sample 10) | 55 URLs, 0 err, 0 warn, 11 info | 55 URLs, 0 err, 0 warn, 11 info | Info items are optional content negotiation and the AI-crawler allow policy |
| Canonical / hreflang | pass | pass | Canonical uses `https://nextlevelbuilder.io` |
| OG / Twitter + per-page `opengraph-image` | pass | pass | Root, product, blog and courses cards return 200 image/png |
| Organization, WebSite+SearchAction | pass | pass | SearchAction target is `/build-with-us?q={search_term_string}` (server-rendered) |
| Person (`sameAs`) | pass | pass | Founder card and blog author |
| SoftwareApplication + Offer + BreadcrumbList | pass | pass | Product pages |
| Course | pass | pass | /courses |
| Blog, BlogPosting, BreadcrumbList | pass | pass | Index and posts |
| FAQPage | pass | pass | Home and product FAQ blocks |
| sitemap.xml (lastmod) / robots.txt | pass | pass | |
| llms.txt / llms-full.txt / `.md` twins | pass | pass | GFM tables fixed with remark-gfm |
| `/.well-known/mcp.json`, `ai-catalog.json`, `api-catalog` | pass | pass | Correct media types |
| `Link` response headers | pass | pass | |
| manifest / favicon | pass | pass | |

## Quality gates

- Lighthouse accessibility on production: home 96, /build-with-us 100, /products/anymd 100, VI post 100, /courses 100. Staging: directory and product pages 100. Local: /vi/courses 100, /blog 100.
- 0px horizontal overflow at 320px on every captured page.
- Console: no app errors. The only remaining entries are Turnstile iframe noise (see concerns).
- Tests on the final head `2b7dbf1`: 80 files passed, 1 skipped, 796 tests passed (2 skipped). Lint: 0 errors (97 warnings, all pre-existing). Typecheck clean. `build:worker` passed for both environments.

## Screenshots

Directory: `plans/reports/visual-261014-round-2/`. Each set covers 1440, 820 and 390 in light and dark. The PNGs (136 MB) stay untracked, like the visual-parity PNGs.

| Set | What it shows |
|---|---|
| `prod-home-*`, `prod-directory-*`, `prod-product-anymd-*`, `prod-post-six-tools-vi-*` | Production, live |
| `staging-home-*`, `staging-directory-*` (re-shot after the traffic fix), `staging-product-design-studio-ai-*`, `staging-blog-index-*`, `staging-post-six-tools-*`, `staging-post-cli-vi-*` | Staging, live |
| `home-toolkits-*` | Team row and toolkits chapter |
| `courses-*-{en,vi}` | /courses |
| `blog-index-{en,vi}-*`, `blog-post-{en,vi}-*` | Blog index and post |
| `directory-*`, `product-*` | Local, before deploy |

## Concerns

1. Production listings point their media and founder-avatar URLs at the workers.dev origin, because the custom domains still serve v1. After the domain cutover, re-run `scripts/seed-ecosystem-products/seed-ecosystem-products.ts --env production --media-origin https://nextlevelbuilder.io`. It creates a new approved revision only where the hash changes.
2. nextlevelbuilder.io and staging.nextlevelbuilder.io still serve the v1 site. Canonical, OG and sitemap URLs already use the custom domains.
3. Console noise `%c%d font-size:0;color:transparent NaN` comes from the third-party Turnstile iframe and is outside app control.
4. Home Lighthouse accessibility is 96. The only failure is color-contrast on the approved scroll-reveal words (`#dark-title span.fw`), caught mid-animation.
5. The Studio preview inherits the new product block styles (shared renderer); intended, but owners will see the new look in the editor.
6. The directory search form lives in the client component. It is still SSR-rendered and works without JS.
7. `NEXT_PUBLIC_ASSETS_URL` is now unused. It points at a dead cdn host and still sits in `wrangler.jsonc`, `cloudflare-env.d.ts` and CI. Safe to remove in a later cleanup.
8. Courses: the Zuey feed has a 6s timeout with fallback. The course detail page was not visually verified because no course videos are published.
9. The trust passport shows the real projection (60), with no votes.
10. No PostHog traffic backend is configured on either environment, so the live traffic card is hidden until `POSTHOG_HOST`, `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID` exist.

## Operations

- Wrangler was used only through the pinned hi@ OAuth wrapper (`env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90…`, explicit `--config`, run from a temp dir).
- The Digitop account was not touched, and Neon was not touched.
- The dev server I started (port 3000) is stopped. The python server on 4806 was left running.

Status: DONE_WITH_CONCERNS
Summary: All seven items shipped and verified on staging and production: six moderated ecosystem listings, six EN/VI posts, the SEO/agent surfaces (0 scan errors) and the redesigned pages, with dev pushed. The concerns are the workers.dev media origins until the domain cutover and third-party console noise.
Concerns/Blockers: Media and avatar URLs need a seed re-run with `--media-origin` after the custom domains move to v2. The custom domains still serve v1. Turnstile iframe console noise. Home Lighthouse is 96 because of the reveal animation. No PostHog backend is configured.
