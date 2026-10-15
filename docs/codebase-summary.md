# Codebase map

Where each concern lives. This page lists entry points only, not inventories. Run `ls` or search to see the current files.

| Concern | Start here | Notes |
|---|---|---|
| Pages (localized) | `app/[locale]/` | One folder per route. `home-client.tsx` wraps the homepage chapters with checkout state, the sky engine, sticky CTA, toast and orbit progress. |
| Root layout, fonts, theme | [`app/layout.tsx`](../app/layout.tsx), [`app/globals.css`](../app/globals.css) | See [design-guidelines.md](./design-guidelines.md) |
| Locale routing | [`middleware.ts`](../middleware.ts), [`i18n/`](../i18n) | EN unprefixed, VI under `/vi` |
| UI strings | [`messages/en.json`](../messages/en.json), [`messages/vi.json`](../messages/vi.json) | next-intl. Long-form copy lives in `content/` and `lib/*/…-copy.ts` |
| Policies and legal pages | [`content/policies/`](../content/policies) | EN and VI in the same module. The route is `app/[locale]/policies/[slug]` |
| Shared UI | `components/ui/` (shadcn/Radix primitives), `components/site/` (site shell), `components/constellation/` (home chapters), `components/home/` (checkout state) | Motion engine: `lib/constellation/`. |
| Public REST API | `app/api/v1/` | Contract: [`lib/openapi.ts`](../lib/openapi.ts) → `/api/openapi.json`, `/api-docs` |
| Product document contract | [`packages/contracts/src/`](../packages/contracts/src) | Imported as `@/packages/contracts/...`. Shared shape with the toolkits repo. |
| Caller auth (API key, session, MCP delegation) | [`lib/auth-api-key.ts`](../lib/auth-api-key.ts), [`lib/auth-mcp-delegation.ts`](../lib/auth-mcp-delegation.ts) | |
| Better Auth (sign-in, OAuth provider) | [`lib/auth.ts`](../lib/auth.ts), [`lib/mcp-oauth-config.ts`](../lib/mcp-oauth-config.ts), `app/api/auth/[...all]` | |
| Database | [`lib/db/schema.ts`](../lib/db/schema.ts), [`lib/db/index.ts`](../lib/db/index.ts), `drizzle/migrations/` | |
| Directory domain (catalog, moderation, trust, rankings, events, Pulse) | [`lib/domain/`](../lib/domain), [`lib/moderation/`](../lib/moderation) | |
| Payments | [`lib/polar.ts`](../lib/polar.ts), [`app/api/checkout/route.ts`](../app/api/checkout/route.ts), [`app/api/webhooks/polar/route.ts`](../app/api/webhooks/polar/route.ts) | |
| Homepage data (seats, countdown, activity) | [`lib/home/`](../lib/home), [`lib/constants/`](../lib/constants) | |
| Blog | [`lib/blog/`](../lib/blog), `components/blog/`, `app/api/v1/blog/`, `app/[locale]/blog/` | [blog-and-agent-management.md](./blog-and-agent-management.md) |
| Courses | [`lib/courses/`](../lib/courses), `components/courses/`, `app/api/courses/`, `app/[locale]/courses/` | [courses.md](./courses.md) |
| Markdown twins and discovery | [`lib/markdown/`](../lib/markdown), `app/api/markdown/`, `app/llms.txt/`, `app/llms-full.txt/`, `app/sitemap.ts`, `app/robots.ts` | Agent discovery documents (`/.well-known/mcp.json`, `ai-catalog.json`, `api-catalog`) are built in [`lib/discovery/`](../lib/discovery); the `Link` header is appended in `middleware.ts` |
| SEO metadata and structured data | [`lib/seo.ts`](../lib/seo.ts), [`lib/structured-data.ts`](../lib/structured-data.ts), [`lib/blog/blog-seo.ts`](../lib/blog/blog-seo.ts) | One linked JSON-LD graph (Organization, WebSite, Person) in `app/layout.tsx`; pages add Product, Course, BlogPosting and breadcrumbs |
| Social cards | [`lib/og/`](../lib/og), `opengraph-image.tsx` next to each public page | Every public page needs its own file: a page that sets `openGraph` loses the parent's image. `pageMetadata` never pins images |
| Media upload (R2) | [`lib/media/`](../lib/media), `app/api/v1/media/upload/`, `app/media/[...key]/` | The public bucket has no domain of its own; `/media/<key>` streams `public/<key>` from `MEDIA_PUBLIC` |
| Traffic analytics | [`lib/traffic/`](../lib/traffic), `app/api/traffic/`, `infra/clickhouse/` | Optional PostHog/ClickHouse backends |
| Site analytics (GA4, PostHog) | [`components/analytics/`](../components/analytics), [`lib/analytics/posthog-config.ts`](../lib/analytics/posthog-config.ts), [`lib/constants/analytics-consent.ts`](../lib/constants/analytics-consent.ts) | Both skip DNT/GPC browsers. PostHog runs only on the production hostnames, sends straight to US cloud, identifies signed-in members and strips query strings on private pages. Replay, heatmaps, exceptions, dead clicks and web vitals are also switched on in PostHog project 605621 (replay limited to the production domains) |
| Site sound (music + effects) | [`lib/site-audio/site-sound-engine.ts`](../lib/site-audio/site-sound-engine.ts), [`components/site/sound-toggle.tsx`](../components/site/sound-toggle.tsx), [`components/site/site-sound-effects.tsx`](../components/site/site-sound-effects.tsx), [`public/audio/`](../public/audio) | Off by default; the header switch stores `nlb-sound` in localStorage. Web Audio plays the 84 s ambient loop gaplessly and the tap, twinkle (stars, leaderboard rows) and whoosh (page change) effects. Tracks were generated with ElevenLabs music and SFX; the loop has its fade-out tail mixed over its intro |
| Studio WebMCP widget | [`lib/webmcp/`](../lib/webmcp) | Vendor provenance in `lib/webmcp/vendor/README.md` |
| Email, Discord | [`lib/resend.ts`](../lib/resend.ts), [`lib/discord.ts`](../lib/discord.ts) | |
| Env schema | [`lib/env.ts`](../lib/env.ts), [`cloudflare-env.d.ts`](../cloudflare-env.d.ts) | |
| Worker config | [`wrangler.jsonc`](../wrangler.jsonc), [`open-next.config.ts`](../open-next.config.ts), [`next.config.ts`](../next.config.ts) | |
| CI/CD | [`.github/workflows/ci-deploy.yml`](../.github/workflows/ci-deploy.yml) | |
| Ops scripts | [`scripts/provision-cloudflare.sh`](../scripts/provision-cloudflare.sh), `scripts/dns/`, `scripts/migrate/`, `scripts/setup-polar-products.ts`, `scripts/rename-polar-products.ts`, `scripts/seed-ecosystem-products/` | The ecosystem seed: [deployment-guide.md](./deployment-guide.md#seeding-ecosystem-listings) |
| Tests | `tests/` (plus colocated `lib/**/*.test.ts`), [`tests/helpers/local-d1.ts`](../tests/helpers/local-d1.ts) | |

## Related repositories

- `nextlevelbuilder/nlb-directory-toolkits`: the `nlb` CLI, the MCP worker (`mcp.nextlevelbuilder.io`) and the contracts consumed by agents. The blog commands and tools are on branch `feat/blog-management`.
- `mrgoonie/nextlevelbuilder-web` (local checkout `nlb-web`): the old site. Its `origin/main` is the reference for feature parity until cutover.
