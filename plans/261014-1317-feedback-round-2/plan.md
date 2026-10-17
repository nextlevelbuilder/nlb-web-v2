# Owner feedback round 2

Status: completed (staging + production verified) · Branch: `dev` · Mode: `ak:cook --auto`

## Outcome
Apply the owner's seven feedback items on top of the approved Constellation port, in the same visual vocabulary, EN/VI, both themes; ship staging then production.

## Work items (order of execution)
1. Founder card: `/zuey/` phonetic, link row ZUEY.ME · DIGITOP.AI · T.O.P GROUP · FACEBOOK · X @goon_nguyen; Person JSON-LD `sameAs`.
2. Favicon set from the header star mark (ico 16/32/48, adaptive SVG, 192, 512, apple-touch, maskable) + `manifest.webmanifest`.
3. SEO/GEO/agent surfaces: per-page metadata, hreflang, OG image routes, JSON-LD set, sitemap lastmod, llms, `.md` twins, `/.well-known/mcp.json` + `ai-catalog.json`, `Link` headers.
4. Header nav: Courses · Directory · Leaderboard · Blog · Pricing · Build with us, same in the mobile menu.
5. `/courses`: Constellation page + sidebar (200lab featured courses, ZueyOS knowledges), Cache API 6h, fallback, UTM.
6. Blog: Constellation index/post designs, `product-cards` widget (additive), 3 posts EN+VI via REST on staging then production.
7. Six ecosystem products via an idempotent seed script over the domain functions (draft → revision → submission → checks → human decision), staging then production, D1 export first, R2 media; homepage/toolkits/build-with-us/product detail showcase.

## Acceptance
Typecheck, lint, tests, build pass; screenshots 1440/820/390 both themes; console clean; Lighthouse a11y ≥ 95; no 320px overflow; discovery scan 0 errors; staging and production verified live.

## Data safety
D1 export backup before writes; seed is idempotent by slug; temporary API key deleted after posting; Neon untouched; Digitop account untouched.
