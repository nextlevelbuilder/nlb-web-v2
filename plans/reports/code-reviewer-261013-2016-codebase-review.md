# Code review: nlb-web-v2 codebase (branch dev)

Date: 2026-10-13 (Asia/Saigon). Mode: `ak:code-review codebase`. Reviewed revision: `7a85969`. Fixes pushed as `1a8cdec` and `a96a62a`.
Reference app: `/Volumes/GOON/www/nlb/nlb-web` at **`origin/main`**. The local `dev` checkout there is 38 commits behind, so it is not the reference.

## Scope
- 15.4k LOC in `app/` and `lib/`, plus `scripts/migrate`, `.github/workflows`, `wrangler.jsonc` and `drizzle/`.
- Focus: new v2 code (courses, blog, D1 port, migration, CI). I diffed every ported file against old `origin/main` and audited only the deltas in unchanged code.
- Baseline before fixes: tsc clean, ESLint 0 errors and 94 warnings, Vitest 626 passed and 2 skipped.
- After fixes: tsc clean, Vitest 629 passed and 2 skipped. The changed files add no new lint findings.

## Overall assessment
The port is faithful. All 32 old route files exist in v2, and 27 of them are byte-identical to `origin/main`. The schema matches the migration (`drizzle-kit generate` reports no drift). No Postgres-isms are left. The new blog and courses code is well guarded: admin-only writes, sanitised hrefs, allowlisted embed iframes rebuilt from parsed ids, no `dangerouslySetInnerHTML` in blog rendering, the Stream uid kept out of public projections, and a 401/403/404/503 ladder on the token route.

I found two real defects and fixed both:
- CI deploys `main` to staging.
- Course entitlements are wrong after a refund or a repurchase.

The remaining findings are medium or lower. Most of them already exist in the old app.

## Critical
None.

## High (fixed)

### H1. CI: pushes to `main` migrated and deployed the **staging** worker. Fixed in `1a8cdec`.
`.github/workflows/ci-deploy.yml` had `WRANGLER_ENV_FLAG: ${{ github.ref_name == 'main' && '' || '--env staging' }}`. In Actions expressions `''` is falsy, so the expression always yields `--env staging`.
- On `main` this applied migrations to `nlb-staging` and deployed `nextlevelbuilder-web-staging`.
- That staging deploy was built with production `NEXT_PUBLIC_APP_URL` and the production Turnstile key.
- Production was never deployed from CI.

Fix: `'--env='` for main and `'--env=staging'` otherwise. I verified this with `wrangler deploy --dry-run`: `--env=` resolves to `nlb-prod`, `nextlevelbuilder-web` and `nlb-media-public`, and `--env=staging` resolves to the staging bindings.

### H2. Courses: a repurchase after a refund left the entitlement revoked, a late paid event re-granted access, and a partial refund revoked access. Fixed in `a96a62a`.
In `lib/courses/course-webhook-entitlements.ts` and `app/api/webhooks/polar/route.ts`:
- **Repurchase:** the insert used `onConflictDoNothing`, so the revoked `(user, video:<id>)` row stayed `is_active=0`. Access then depended entirely on the email-matched paid-order fallback. A buyer whose Polar email differs from their account email (which the metadata `userId` path supports) lost access they had paid for. It is now `onConflictDoUpdate` with `is_active=1, valid_until=null`.
- **Late or retried `order.paid` after a refund:** `handleOrderCreated` upserted `status='paid'` over `refunded`, which re-granted access through the order fallback. Refunded status is now terminal in the upsert (SQL `CASE`), and the entitlement sync skips orders stored as refunded.
- **Partial refund:** any `order.refunded` revoked access, which contradicted the docstring ("fully refunded"). Polar sends `order.refunded` for partial refunds too. Now only `status=refunded`, or an `order.refunded` that is not `partially_refunded`, revokes access.
- Three tests were added. Each one fails without the fix.

## Medium (not fixed; recommendations)

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| M1 | VIP course access trusts `subscriptions.status='active'` with no period check. A missed revoke or cancel webhook means VIP access never ends. The same pattern existed before, but v2 now puts paid content behind it. | `lib/courses/course-video-access.ts` (subscription query) | Add `or(isNull(currentPeriodEnd), gt(currentPeriodEnd, now - grace))`, with a grace of about 3 days for renewal lag. |
| M2 | Stream `requireSignedURLs` is only documented, never enforced. The signed JWT's `sub` (the video uid) is readable by any purchaser. If a video was uploaded without signed URLs, the uid plays unsigned forever. | `docs/deployment-guide.md:61`, `lib/courses/stream-signed-url.ts`, `publishVideo` | On publish, `GET /stream/{uid}` and refuse unless `requireSignedURLs===true`. |
| M3 | Final-sync risk in the migration. `import.sql` runs `DELETE FROM` on all 43 migrated tables, then re-inserts the Neon snapshot. Any rows created on v2 production before the final sync are wiped: users or sessions from workers.dev sign-ins, orders and entitlements if the Polar webhook is switched early, `webhook_events`. Rows in v2-only tables (`blog_posts.author_id`, entitlements keyed by user) can be orphaned. `PRAGMA defer_foreign_keys` only applies inside a transaction. | `scripts/migrate/lib/convert-to-sql.ts` | Keep the runbook order strict: freeze writes, sync, then switch Polar. Add a pre-import guard that refuses when the target has rows in migrated tables newer than `manifest.dumpedAt`, or when v2-only tables reference ids missing from the snapshot. |
| M4 | Migration verify compares row counts and a hash of primary keys only. It matches the contract, but it would not catch value corruption (timestamps, JSON, booleans). | `scripts/migrate/lib/import-and-verify.ts` | Also hash `SELECT *` rows, normalised per column kind, for at least the commerce and auth tables. |
| M5 | Webhook stale-lock reclaim sets `processed_at` but not `created_at`. After 5 minutes every concurrent redelivery can "reclaim" the same lock, and an event with a stored `error` is reprocessed concurrently with no lock at all. This exists in the old app too. The delivery intents and Resend idempotency keys limit side effects. | `app/api/webhooks/polar/route.ts` (claim/reclaim block) | Reclaim with a conditional update on a lease timestamp, and set the lease on reclaim. |
| M6 | MCP delegation assertions can be replayed within their 60 s lifetime. The `jti` is required but never recorded. Each assertion is bound to scope, method and path, which limits the impact. | `lib/auth-mcp-delegation.ts` | Store the `jti` with a TTL (KV or D1) and reject repeats, at least for `mcp:write` and `mcp:keys`. |
| M7 | Feature parity: the homepage FAQ section from old `home-client.tsx` (`FAQSection`) is gone. The `faq` message keys still exist but nothing renders them. The Constellation mockup has no FAQ, so this may be intended. | `messages/en.json` (`"faq"`), `app/[locale]/page.tsx` | Confirm whether this is a product decision. If not, port the FAQ, which covers refund and billing questions. |

## Low
- **API key auth does not check `users.banned`** (same as the old app). A banned admin's API key can still manage the blog and courses. Session and delegation paths do check it. See `lib/auth-api-key.ts` `verifyApiKey`.
- **Moderation decide has no `case.status !== 'decided'` guard**, so a double decide inserts two decisions (same as the old app). See `lib/domain/moderation.ts`.
- **`/api/health` response shape changed** from `db_name` to `db_engine`. The stack trace was removed, which is good. Any uptime checks that parse `db_name` will break. This is not a `/api/v1` route.
- **Staging and production share the `nlb-media-staging` R2 bucket** for `MEDIA_STAGING`, as in the old app. v2 splits only the public bucket. See `wrangler.jsonc`.
- **Staging `MCP_OAUTH_RESOURCE` still points to `nlb-directory-mcp-staging.digitop-vn.workers.dev`**, which is on the Digitop account.
- **Stale comments and defaults:**
  - `lib/courses/course-checkout.ts` still says "default locale (vi) has no prefix".
  - `createCourseVideoSchema.locale` defaults to `"vi"` while the site default is EN.
- **`POST /api/v1/blog/validate` is public** and parses up to 512 KB per call. It is CPU-cheap, but it has no rate limit.
- **Actions are pinned to major tags, not SHAs**, in a public repo. `images.remotePatterns` allows `**` (inherited from the old app).
- **The production `wrangler deploy` in CI previously had no `--env`.** Fixed by H1.

## Security checklist results
- **Secrets in git history:** I scanned all commits for 14 patterns (AWS, GitHub, Polar, Resend, Stripe, PEM private keys, Slack, Google, Postgres URLs, Cloudflare tokens, Discord bot tokens, JWTs, generic secret assignments, hex secrets).
  - Hits were only in `tests/mcp-delegation.test.ts` and `tests/traffic-backend-worker-config.test.ts`, where the values are test fixtures, and in `lib/courses/stream-signed-url.ts`, where the hit is the PEM header string literal, not a key.
  - No `.env` or `.dev.vars` file was ever committed. The Turnstile site keys in `wrangler.jsonc` and the CI workflow are public by design.
- **Client bundle:** only `NEXT_PUBLIC_*` values (app URL, assets URL, Discord URL, Polar product ids, PostHog public key, Turnstile site key) are referenced client-side. No server secrets are imported into `"use client"` modules.
- **API keys:** SHA-256 hex of the raw `nlb_live_` key, identical to old `origin/main`, so existing keys keep working. Bearer and `x-api-key` parsing is unchanged.
- **Polar webhook:** verified with `validateEvent` (Standard Webhooks). An empty `POLAR_WEBHOOK_SECRET` fails closed: the SDK throws, and the route returns 401. Idempotency comes from the unique `event_id` claim; see M5 for the lock caveat.
- **Courses:**
  - Unpaid callers get 403, anonymous callers get 401, and draft or unknown videos return 404.
  - Archived videos stay playable for existing buyers (a documented decision).
  - Access is granted by an active VIP subscription, a `video:` entitlement, or a paid order matched by email.
  - Email matching is safe because email+password sign-in is disabled. Sign-in is OTP or OAuth only, so the email is proven.
  - The Stream token is RS256 with a `kid`, `sub=uid`, `nbf` of now−30 s, `exp` of 1 h, and `no-store`.
- **Blog API:** every write needs an admin (session, API key or `mcp:write` delegation). Non-published reads need an admin. Idempotency is scoped per caller and request-hashed. Optimistic concurrency uses `changes()=1` inside a batch.
- **XSS:** blog rendering is React text nodes only. hrefs are limited to `/`, `#`, `https:`, `http:` and `mailto:`. Image `src` must be https or a site path. Embeds are allowlisted (YouTube nocookie, Vimeo, Stream, Loom), with the iframe `src` rebuilt from parsed ids, sandboxed. JSON-LD escapes `<`.
- **`/go/[slug]`:** byte-identical to the old app. It redirects only to the `websiteUrl` of a published, human-moderated product, so it is not an open redirect for arbitrary input. The KV binding `GO_REDIRECTS` is unused, as in the old app.
- **Markdown twin fetcher:** the origin is fixed, the paths are allowlisted, and cross-origin redirects are refused, so there is no SSRF.

## Data correctness
- **Types:** timestamps are `integer` `timestamp_ms` everywhere; app JSON uses drizzle `json` text; Better Auth arrays are JSON text, which matches the sqlite adapter. No Date values are interpolated into raw `sql` (the one raw case uses `.getTime()`).
- **`db.batch` replacements:**
  - Moderation submit and decide, revision creation, domain event plus outbox, and the vote plus counter (guarded by `exists`) are all atomic.
  - The pulse reservation is a single upsert statement.
  - Remaining gap: reads happen before the batch (moderation decide, `nextRevisionNumber`), so concurrent writers race. That was already true under Postgres READ COMMITTED.
- **Migration converter:** handles microsecond truncation, zone-less UTC timestamps, jsonb verbatim, text[] to JSON, and aborts on unknown tables or columns. Verify caveats are M3 and M4.

## /api/v1 and OpenAPI parity
- **Routes:** no old route is missing. 32/32 exist, and 27 are byte-identical. The changed ones are:
  - `stats`: removed the `::int` cast.
  - `health`: shape change, see Low.
  - `markdown`: query passthrough.
  - `webhooks/polar`: course hooks and the refund-terminal fix.
  - `llms.txt`: content.
- **OpenAPI:** `lib/openapi.ts` differs only by the additive `blogPaths` and `blogSchemas`.
- **Response shapes:** count columns still return numbers (D1 returns integers), and timestamps still serialise as ISO strings through Date.
- **New:** 9 `/api/v1/blog/*` and 5 `/api/courses/*` routes.

## Feature parity
- All page routes exist.
- Removed on purpose: `packages/cli`, `packages/mcp` and `packages/agent-skill`, which live in the toolkits repo, and `lib/db/migrate.ts`, which is Postgres-only.
- Old homepage sections were replaced by the redesign. FAQ is the only content block with no successor (M7).
- Turnstile, Discord, Resend, PostHog, Workers AI and the self-reference binding are all still wired.

## CI/CD
- Test job: `npm ci`, type-check, lint, test. PR runs get no secrets, and deploy runs only on push. Concurrency is per branch, without cancellation.
- Migrations run before the build, so a failed build leaves the schema ahead of the code. That is acceptable for additive migrations only.
- The env selection bug is fixed (H1). The token scope gap (D1 7403) remains an owner action.

## Fixed this session
1. `1a8cdec` fix(ci): deploy main to the production worker instead of staging.
2. `a96a62a` fix(courses): keep course entitlements correct across refunds and repurchases (with 3 tests).

Both are pushed to `origin/dev`. Nothing was deployed, and no Cloudflare or Neon resources were touched.

## Recommended next actions
1. M1: add the VIP period-end guard. Small change, protects paid content.
2. M2: enforce `requireSignedURLs` at publish time.
3. M3: add the pre-import guard before the final sync.
4. M7: decide on the FAQ.
5. M5, M6 and M4 as hardening.

## Metrics
- Type coverage: tsc strict passes. 94 ESLint warnings, mostly `no-explicit-any`, inherited.
- Tests: 629 passed, 2 skipped (65 files).
- Lint: 0 errors.

## Unresolved questions
- Is dropping the homepage FAQ intentional?
- Should partial refunds keep course access? The fix assumes yes, per the original docstring.
- Should a VIP subscription with `cancel_at_period_end` keep course access until period end? Recommended yes, and that is what M1's guard gives.

Status: DONE_WITH_CONCERNS
Summary: Full codebase review done. I fixed two high defects (CI deployed main to staging; course entitlements were wrong after refunds and repurchases) with tests, and pushed both to dev. No critical security issues, no secrets in git history, /api/v1 and OpenAPI unchanged apart from additive blog paths.
Concerns/Blockers: Medium items remain: the VIP period-end guard, Stream requireSignedURLs enforcement, the final-sync wipe risk, primary-key-only migration verify, the webhook lock reclaim race, and MCP assertion replay. Whether the homepage FAQ was dropped on purpose needs a product decision.
