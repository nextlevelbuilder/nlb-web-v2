# System architecture

nextlevelbuilder.io is one Next.js 16 App Router app. It is compiled by `@opennextjs/cloudflare` into a single Cloudflare Worker per environment on the **hi@nextlevelbuilder.io** account. It replaces the old site (`nlb-web`: Postgres on Neon, Digitop Cloudflare account) feature for feature. On top of that it adds the Constellation redesign, the blog and paid courses.

## Why this shape

These decisions are recorded in `plans/reports/advisor-261013-1240-nlb-web-v2-redesign.md` and `plans/reports/bootstrap-261013-1759-brainstorm-contract.md`.

| Decision | Reason | Trade-off / rejected |
|---|---|---|
| Everything on the hi@ Cloudflare account | One account, one vendor, one bill. D1, Stream and R2 sit next to the Worker with no egress. | Workers, R2, KV and Hyperdrive cannot move between accounts, so all of them were recreated on hi@ |
| D1 (SQLite) instead of Neon Postgres | Removes Neon and Hyperdrive. The data is small. | Keeping Neon over Hyperdrive "temporarily" was rejected. D1 limits apply: no interactive transactions, no `FOR UPDATE`, a cap on bound parameters per query, 10 GB per database. The decision should be revisited if data growth or heavy analytics outgrow D1. |
| `db.batch()` instead of `db.transaction()` | D1 batches are atomic. Interactive transactions do not exist. | Reads before a batch can race (see [code-standards.md](./code-standards.md#database-d1)) |
| `/api/v1` paths, payloads and OpenAPI unchanged | The CLI, MCP server and existing integrations must keep working | Changing the contract is a stop-and-ask decision |
| API keys stay SHA-256 hashes ([`lib/auth-api-key.ts`](../lib/auth-api-key.ts)) | Existing `nlb_live_` keys keep working after migration | — |
| New `BETTER_AUTH_SECRET` | The old secret was unavailable. Every user signs in once more after cutover, and `jwks_keys` were cleared because they were encrypted with the old secret. | Forced re-login |
| Polar and Better Auth kept | Changing the payment or auth provider is a contract non-goal | — |
| wrangler in CI | Stable, with an official action | The `cf` CLI is only for one-off operations while it is in beta |

## Request path

1. [`middleware.ts`](../middleware.ts):
   - Rewrites `*.md` paths to `/api/markdown`. These are markdown twins of pages.
   - Passes everything else through next-intl locale routing ([`i18n/routing.ts`](../i18n/routing.ts)). English is unprefixed and Vietnamese lives under `/vi`. Detection uses the `NEXT_LOCALE` cookie, then `Accept-Language`.
2. Pages live under `app/[locale]/`. Non-localized routes are API (`app/api/`), `/go/[slug]`, `/llms.txt`, `/llms-full.txt`, `/api-docs`, `robots`, `sitemap`.
3. Data access goes through `getDb()` in [`lib/db/index.ts`](../lib/db/index.ts). It resolves the D1 binding from an explicit env, then an AsyncLocalStorage override (tests, scripts), then the OpenNext Cloudflare context.

Markdown twins render the HTML page through the `WORKER_SELF_REFERENCE` service binding ([`lib/markdown/page-fetch.ts`](../lib/markdown/page-fetch.ts)), so session cookies never leave the deployment. [`lib/markdown/page-markdown.ts`](../lib/markdown/page-markdown.ts) pins the `Host` header because service-binding requests carry none, and OpenNext would otherwise treat the next-intl rewrite as external and fetch the public site.

## Cloudflare bindings

[`wrangler.jsonc`](../wrangler.jsonc) declares the bindings and resource ids, with production at the top level and staging under `env.staging`. Purpose and current use:

| Binding | Purpose | Used in code |
|---|---|---|
| `DB` (D1 `nlb-prod` / `nlb-staging`) | All relational data | [`lib/db`](../lib/db) |
| `MEDIA_PUBLIC`, `MEDIA_STAGING` (R2) | Uploaded product media, served from `cdn.nextlevelbuilder.io` | [`app/api/v1/media/upload/route.ts`](../app/api/v1/media/upload/route.ts) |
| `WORKER_SELF_REFERENCE` (service) | Markdown twins | [`lib/markdown/page-fetch.ts`](../lib/markdown/page-fetch.ts) |
| `ASSETS` | Static assets emitted by OpenNext | OpenNext runtime |
| `BUILDER_EVIDENCE` (R2 `nlb-builder-evidence` / `nlb-builder-evidence-staging`) | Private Builder League evidence uploads and rendered Wrapped videos; never public | [`lib/builder-league/evidence-storage.ts`](../lib/builder-league/evidence-storage.ts) |
| `MCP_DELEGATION_JTI` (KV) | One-time use of MCP delegation assertions: each `jti` is stored until the token expires | [`lib/auth-mcp-delegation-replay.ts`](../lib/auth-mcp-delegation-replay.ts) |

The old app also declared `GO_REDIRECTS` (KV), `POLAR_WEBHOOK_QUEUE` (Queue) and `AI` (Workers AI), but never used them: `/go/[slug]` reads D1, Polar webhooks are processed inline, and listing screening is a deterministic heuristic. They are not bound here.

Scheduled work runs in [`worker.ts`](../worker.ts) on the two crons in `wrangler.jsonc`: every minute (the onboarding job queue) and hourly at `:17` (the membership resync, plus the Builder League cron: period finalization, the year snapshots and Community Wrapped, render job expiry; [`lib/builder-league/cron.ts`](../lib/builder-league/cron.ts)). The hourly cron also matures affiliate commissions past their refund hold ([`lib/referrals/referral-cron.ts`](../lib/referrals/referral-cron.ts)). The league cron runs whatever `BUILDER_LEAGUE_ENABLED` says: it writes only league tables, and pages check the flag. The flag is `false` in production (admins and pilot members only) and `true` on staging.

Staging and production share the `nlb-media-staging` bucket for `MEDIA_STAGING`. Only the public bucket is split.

## Auth

[`lib/auth.ts`](../lib/auth.ts) configures Better Auth with the Drizzle sqlite adapter, served at `/api/auth/*`:
- Sign-in is email OTP or GitHub/Google OAuth. Email+password is disabled. Because every login proves the email, email-keyed commerce lookups are safe (see [courses.md](./courses.md)).
- Plugins: organization, admin, bearer, device authorization. The MCP OAuth provider is enabled by the `MCP_OAUTH_ENABLED` var.
- `BETTER_AUTH_URL` is the environment's final domain, so OAuth only works there. Use email OTP on workers.dev.

Programmatic callers are resolved in one place, `resolveCaller` in [`lib/auth-api-key.ts`](../lib/auth-api-key.ts). It accepts:
1. An `nlb_live_` API key in `Authorization: Bearer` or `x-api-key`.
2. A session cookie.
3. An MCP delegation assertion in `x-nlb-mcp-assertion`, signed with `MCP_DELEGATION_SECRET`. The MCP server ([`packages/mcp`](../packages/mcp), mounted in this Worker at `/mcp` by [`lib/mcp-worker-mount.ts`](../lib/mcp-worker-mount.ts)) mints it, bound to user, scope, method and path, with a lifetime of at most 60 s ([`lib/auth-mcp-delegation.ts`](../lib/auth-mcp-delegation.ts)). Each assertion is single-use: its `jti` is recorded in the `MCP_DELEGATION_JTI` KV for the token lifetime and a reuse is rejected. KV is eventually consistent, so a replay at the same instant from another location is not guaranteed to be caught.

Bot protection: votes require a Turnstile token, verified server-side in [`lib/domain/analytics.ts`](../lib/domain/analytics.ts).

## Payments (Polar)

- Checkout sessions are created in [`lib/polar.ts`](../lib/polar.ts) (memberships, directory listings) and [`lib/courses/course-checkout.ts`](../lib/courses/course-checkout.ts) (course videos). Success URLs are derived from `NEXT_PUBLIC_APP_URL`.
- Webhooks arrive at `POST /api/webhooks/polar` and are verified with the Polar SDK (Standard Webhooks, `POLAR_WEBHOOK_SECRET`). The route fails closed when the secret is empty. Idempotency comes from the unique event id in `webhook_events`. A delivery claims an event with an atomic conditional update on `locked_until` (a 5-minute lease), so concurrent redeliveries cannot process it twice; a failure releases the lease for Polar's retry ([`lib/domain/webhook-event-lock.ts`](../lib/domain/webhook-event-lock.ts)). Side effects (Resend email, Discord) go through delivery intents ([`lib/domain/events.ts`](../lib/domain/events.ts)).
- Affiliate referrals: membership checkout binds a signed-in buyer's first purchase to an affiliate snapshot carried in Polar metadata (`nlb_aff_attr`); the order webhook accrues commission into an append-only ledger and reverses it on refunds. See [affiliate-program-adr.md](./affiliate-program-adr.md).
- After a membership payment, onboarding links the buyer to the subscription and grants Discord and Telegram access from the effective tier, through a D1 job queue drained by the worker cron (behind `ONBOARDING_V2_ENABLED`). See [membership-onboarding.md](./membership-onboarding.md).
- Membership plans (Premium, VIP) and the FOMO seat caps are in [`lib/home`](../lib/home) and [`lib/polar.ts`](../lib/polar.ts). Seat counts come from real `active` subscriptions, not fabricated numbers (a contract decision).

## Content features

- **Build with Us directory**: products, revisions, moderation, votes, rankings, Pulse and traffic. The domain logic is in [`lib/domain`](../lib/domain). The submission guide on `/build-with-us` (anchor `#guide`; the old `/build-with-us/instructions` URL redirects there) and the root README cover the agent-facing workflows.
- **Blog**: typed widget blocks managed over REST, CLI or MCP. See [blog-and-agent-management.md](./blog-and-agent-management.md).
- **Courses**: one Polar product per video, Cloudflare Stream signed playback. See [courses.md](./courses.md).
- **Discovery**: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt` and markdown twins. Implemented in `app/robots.ts`, `app/sitemap.ts`, `app/llms*.txt/` and [`lib/markdown`](../lib/markdown).

## Environments

The worker names, URLs and the branch mapping are in [deployment-guide.md](./deployment-guide.md). The same Worker serves the MCP server at `/mcp`; see [blog-and-agent-management.md](./blog-and-agent-management.md#mcp-server) for its protocol and OAuth model.
