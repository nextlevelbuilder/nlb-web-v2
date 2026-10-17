# Fix pass, UX/AX enhancement and release: nlb-web-v2

Date: 2026-10-13. Branch: `dev`. Range: `6cc9470..c8efd0e` plus this report.

Inputs:
- `code-reviewer-261013-2016-codebase-review.md`
- `live-check-261013-2016-production-workers-dev.md`
- the coordinator's docs-gap list

## Outcome

All items in A, B, C and the docs-gap list are implemented with tests and released.
- Migration 0001 ran on staging, then on production, each after a D1 export backup.
- Both workers are deployed and live-verified.
- Nothing was pushed to main. No custom domain was added, the Polar webhook was not switched, and Digitop and Neon were not touched.

| Environment | Version | URL |
|---|---|---|
| Staging | `40003f84-c810-4db0-8614-d11f3333e05c` | https://nextlevelbuilder-web-staging.hi-7ac.workers.dev |
| Production | `d68adaf5-5be2-430f-b50b-942a89403edd` | https://nextlevelbuilder-web.hi-7ac.workers.dev |

## A. Review items

| # | Item | Change | Tests |
|---|---|---|---|
| 1 | VIP period end | `lib/courses/course-video-access.ts`: VIP needs `status=active` and `current_period_end > now`. A null period end is denied. A cancelled VIP keeps access until the period ends. | `tests/courses-token-route.test.ts`: in period, past period, cancel-at-end, null period |
| 2 | Partial refunds | The order fallback accepts `paid` and `partially_refunded` | partial-refund case in the same test file |
| 3 | Signed-only Stream | `lib/courses/stream-video-api.ts` POSTs `requireSignedURLs:true` to the Stream API and verifies the response. Create, update and publish enforce it before storing. `course_videos.stream_signed_only` records it. The token route returns 409 `stream_not_signed_only` otherwise, and 503 if `CF_ACCOUNT_ID` or `CF_STREAM_API_TOKEN` is missing. | `tests/courses-stream-video-api.test.ts`, `tests/courses-polar-product.test.ts`, token-route 409 |
| 4 | Migration `--final-sync` | Upsert by PK, never deletes. Blog, courses and idempotency tables are never touched. A D1 export runs before every write, including `rekey-jwks`. Full replace needs `--replace --i-understand`. Mode and snapshot headers are checked against `manifest.json`. | `tests/migrate-import-modes.test.ts` |
| 5 | Verify value hash | Per table: row count, PK hash, and a SHA-256 of type-normalised full rows (epoch ms, 0/1, canonical JSON, folded numbers), paged. In final-sync mode, D1-only rows are reported as info. | `tests/migrate-row-normalization.test.ts` |
| 6 | Webhook lock | `lib/domain/webhook-event-lock.ts`: insert or conditional `UPDATE … WHERE processed=0 AND (locked_until IS NULL OR locked_until < now)`, then check `meta.changes`. 5-minute lease; a failure releases it. | `tests/webhook-event-lock.test.ts` (concurrent claims), `tests/polar-webhooks.test.ts` |
| 7 | MCP jti replay | `lib/auth-mcp-delegation-replay.ts`: KV `MCP_DELEGATION_JTI`, key `mcp-jti:<jti>`, TTL `max(60, exp-now)`. A reuse is rejected; it fails closed in a Worker without the binding. KV is eventually consistent, so a simultaneous replay from another location is not guaranteed to be caught (documented). | `tests/mcp-delegation.test.ts` |
| 8 | Homepage FAQ | `components/sections/faq-section.tsx` in Constellation style. The old site's questions in EN and VI (`lib/home/home-faq.ts`), FAQPage JSON-LD, placed before the finale. | `tests/home-faq.test.ts` |

## B. Live-check items

| Item | Result |
|---|---|
| Theme `__name` crash | `keep_names: false`. The console is clean on `/` and `/vi` on both URLs. The theme persists across reloads, and the class is set before hydration. |
| PostHog beacon | A valid beacon returns 204 when analytics is not configured (verified live on both URLs). A malformed body is still a 400. |
| CTAs and dialog | Hero and pricing CTAs are always enabled. They open an accessible dialog ("Confirm your membership") with plan, price, a Terms checkbox and "Continue to Polar checkout". The continue button is disabled until the Terms are accepted. On staging it reached `polar.sh/checkout`; the run stopped there and nothing was paid. |
| Seat meter | Shows "N of M left" only when at least 50% of seats are taken, otherwise "Limited to M members". Live: "Limited to 10/30 members", VI "Giới hạn 10/30 thành viên" (`tests/home-seat-meter.test.ts`). |
| EGANY name | "EGANY.COM" is shown in partners (EN and VI). |

## Docs-gap items

1. `.dev.vars.example` lists every variable name with an empty value and a one-line comment.
2. `db:seed:local` is removed (the seed file never existed). `docs/getting-started.md` now says the local database starts empty and points to the migration import.
3. Scripts:
   - `deploy:staging` uses `--env=staging` and `deploy:production` uses `--env=""`;
   - `db:migrate:staging` and `db:migrate:production` are pinned the same way.
   - opennext drops an empty `--env`, so wrangler targets the top-level (production) config.
4. `MCP_DELEGATION_SECRET`:
   - rotated: one value is set on both the staging and production web workers, and appended to `.env` without being echoed (64 characters);
   - `provision-cloudflare.sh secrets` now copies it from `.env` instead of generating a per-environment value it never stored;
   - `docs/cutover-runbook.md` explains how to put the same value on the MCP worker.
5. Bindings `POLAR_WEBHOOK_QUEUE`, `GO_REDIRECTS` and `AI`: **the removal case applied.**
   - The old app (`nlb-web`, origin/main) declared them as scaffolding only. Its AGENTS.md says "Do not implement a queue consumer for POLAR_WEBHOOK_QUEUE (currently sync route)". No code referenced `GO_REDIRECTS` (`/go` reads the database) or `AI` (moderation is a heuristic).
   - They were removed from `wrangler.jsonc` and the provisioning script, and `cloudflare-env.d.ts` was regenerated.
   - The Cloudflare resources themselves were not deleted.

Updated docs:
- `system-architecture.md`: bindings, webhook lease, jti;
- `deployment-guide.md`: token permissions, provisioning, scripts;
- `courses.md`: access rule, Stream API token, publishing;
- `data-migration-neon-to-d1.md` and `cutover-runbook.md`: final-sync, verify, MCP secret;
- `getting-started.md`, `design-guidelines.md`, `project-roadmap.md`.

## C. ak:enhance-ux-ax --auto

Report: [enhance-ux-ax-261013-2030-nlb-web-v2.md](./enhance-ux-ax-261013-2030-nlb-web-v2.md). Main fixes:
- Reveal no longer ships `opacity:0` in the server HTML, so the chapter headlines were blank before the fix. A CSS scroll-driven attempt failed the tall-viewport check and was replaced by an observer that only hides off-screen elements.
- Course pages had lost their gutters on mobile (`wrap w-full`).
- Markdown twins now exist for blog and courses. Before, the course twins were advertised but returned 404.
- Social cards: `og:image` with alt everywhere, and Twitter, OG and JSON-LD on `/api-docs` with an environment canonical.
- llms files are `noindex`, the locale note is fixed, and blog and courses are listed.
- Added `DESIGN.md`, `REVIEW.md` and `AGENTS.md`.

The discovery scan exits 0 with no errors or warnings on all 37 sitemap pages on both URLs. Baseline: 5 errors and 7 warnings.

## D. Release and verification

| Check | Staging | Production |
|---|---|---|
| typecheck / lint / tests / build | tsc clean; eslint 0 errors (94 pre-existing warnings); vitest 700 passed, 2 skipped; opennext build OK | same tree |
| D1 export backup before migration | `scratchpad/d1-backups/staging-pre-0001-20261013-2104.sql` (8.3 MB, mode 600) | `scratchpad/d1-backups/prod-pre-0001-20261013-2134.sql` (8.3 MB, mode 600) |
| Migration 0001 applied, columns present | yes | yes |
| Console clean, home EN/VI (and blog, courses, api-docs) | yes | yes |
| Theme persists, no flash | yes | yes |
| CTA dialog to Polar checkout | reached `polar.sh/checkout`; stopped there, no payment | not exercised (staging only, as specified) |
| FAQ renders, FAQPage JSON-LD (13 questions), before finale | yes | yes |
| `/api/v1` smoke with temp key | see the results below | same results |
| Lighthouse accessibility (home EN, VI, blog, courses) | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| No horizontal scroll at 320 px | yes (home EN/VI, blog, courses, api-docs) | yes |

`/api/v1` smoke results:
- public GETs return 200;
- a non-admin key gets 403 on drafts;
- a bad key, no key, or the deleted key gets 401;
- an authenticated POST returns 400 for a validation failure, which shows authentication passed.

The temporary user and key were inserted with only the SHA-256 hash in D1 and deleted after use. Zero `smoke-%` rows remain.

Course playback on the live sites cannot be exercised: no videos are published, and Stream is not enabled. Registering a video returns 503 until `CF_STREAM_API_TOKEN` is set.

## Deviations and notes

- **FAQ JSON-LD vs skill guidance.** The skill says not to add FAQ markup for search appearance, because Google retired FAQ rich results in May 2026. The coordinator explicitly required it, so it ships. It is harmless.
- **Smoke retry.** One production D1 call returned Cloudflare error 7403 ("account not authorized"). Queries worked again immediately afterwards, no rows had been written, and the retry passed.
- **Not changed (out of scope).** Low review items: the `createCourseVideoSchema` locale default, a banned-user check on API keys, and an idempotent moderation decide. They are listed in the roadmap.
- **Evidence.** Full-page screenshots (20 MB) stay local under the gitignored evidence folder. Key before/after crops and the scan outputs are committed.

## Unresolved questions

- Should training crawlers (GPTBot, ClaudeBot, CCBot) be blocked in robots.txt? Today nothing is blocked. This is an owner decision.
- The MCP worker still runs on Digitop with its own secret. Delegation from that worker to v2 fails until the rotated value from `.env` is set on it during the hi@ move.
- Enable Stream and set `CF_STREAM_API_TOKEN` and the signing key, so the signed-only enforcement can be exercised live.

Status: DONE
Summary: Every review, live-check, UX/AX and docs-gap item is implemented with tests in focused commits on dev. Migration 0001 ran on staging and production after D1 backups, both workers are deployed, and live checks pass on both URLs (clean console, theme, CTA to Polar on staging, FAQ, API smoke, Lighthouse 100, no overflow at 320 px).
Concerns: The MCP worker needs the rotated delegation secret when it moves to hi@. The FAQPage JSON-LD conflicts with the skill guidance. The AI crawler policy is an owner decision.
