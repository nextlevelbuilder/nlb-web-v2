# Code Review: feat/3-builder-league vs main (issue #3 NLB Builder League)

Date: 2026-10-17. Reviewer: code-reviewer (read-only). Branch HEAD 310ca28.

## Scope

- Diff: `git diff main...HEAD`. The branch also carries the post-checkout onboarding work merged in from feat/2 (polar webhook, checkout, `0002` migration, onboarding cron).
- Focus: security and privacy gates, ledger correctness, migrations, the `/api/v1` and OpenAPI contract, integration hooks, and a light UI parity check.
- Not run: the full test suite or build, because they were already running in the same worktree. EN/VI message key parity was checked with a node script: 0 missing keys either way.

## Overall Assessment

The core league engine is solid. The ledger is append-only with sha256 dedupe keys, cap slot rows enforce the caps, the ruleset is chosen by `occurredAt`, and the UTC+7 windows are correct. Self-moderation is blocked, agents and API keys cannot approve, evidence files go to private R2 with owner-or-admin download, sniff checks and a sandbox CSP, and the Discord ingest secret is compared in constant time. Reward inventory and the render-job leases use real compare-and-swap. The OpenAPI and `/api/v1` changes are additive only: no existing route was modified or deleted, and `lib/openapi.ts` only spreads in new paths and schemas.

The main risks are a migration collision with feat/2, league data being written for users who never joined or opted in, an appeal path that can leave a broken state that cannot be repaired, and unauthenticated recompute work.

## Critical Issues

None found.

## High Priority

### H1. `0002_onboarding_community.sql` differs from feat/2's final 0002, so the schema drifts depending on deploy order
- File: `drizzle/migrations/0002_onboarding_community.sql`, lines 24 and 74 (compared with `origin/feat/2-post-checkout-onboarding`).
- Evidence: `git diff HEAD origin/feat/2-post-checkout-onboarding -- drizzle/migrations/0002_onboarding_community.sql` shows two differences in feat/2: an added column `community_connections.unlink_requested_at`, and the unique index `customers_user_id_unique` replaced by a non-unique `customers_user_id_idx`.
- Failure scenario: wrangler D1 records migrations by filename. If this branch's 0002 runs first, the final feat/2 0002 is never applied. The column is then missing, so unlink code fails with `no such column`. The unique index also stays, so linking a second Polar customer to the same user (which feat/2 deliberately allowed) fails with a UNIQUE violation inside the Polar webhook. If feat/2 deploys first, this branch's `meta/0002_snapshot.json` and journal no longer match the schema, and the next `drizzle-kit generate` produces bad diffs.
- Fix: rebase onto the final feat/2, or merge it once it lands on main, and take its 0002, snapshot and journal verbatim before any remote `migrations apply`. Add a pre-deploy check that the migration files are byte-identical to main's.

## Medium Priority

### M1. Directory launch hook writes league data for every submitter, whatever the flag, membership or opt-in
- File: `lib/builder-league/directory-events.ts:50-92`, called from `lib/domain/moderation.ts` (`scheduleBuilderLaunch`).
- Failure scenario: production has `BUILDER_LEAGUE_ENABLED=false`, and a moderator approves a product from a user who never joined the league or is not a paid member. The code still writes a `builder_events` row, a `score_ledger` +100 RP entry, a `builder_projects` row, and refreshes their rank. This contradicts "Everything is private by default" (`docs/builder-league-adr.md:56`) and the brief's opt-in backfill (`brief.md:23`). It also means that once the flag turns on, users who never opted in already have a rank and RP history, and those users then appear in the Community Wrapped aggregates.
- Fix: gate on `getViewerAccess(...).canUse`, or on league membership. If pre-launch accumulation is intended, record the event without the award and award it on join, and write that down in the ADR. This needs a product decision.

### M2. Overturning an appeal can leave the appeal "overturned" while the evidence stays rejected, with no way to repair it
- File: `lib/builder-league/appeals.ts:106-139`, with `lib/builder-league/peer-help.ts:84-85`.
- Failure scenario: peer-help evidence is rejected before the counterparty confirmed it, and the member appeals. The admin overturns the appeal: the batch commits `status=overturned` and the audit row (lines 110-125), then `approveEvidence` throws `counterparty_unconfirmed`. The counterparty cannot confirm now, because `confirmPeerHelp` refuses evidence that is not open (`evidence_locked`, peer-help.ts:84). Every retry of the overturn fails the same way, and the member cannot appeal again (`appeal_used`, appeals.ts:56). The UI and audit trail say "overturned", yet no RP is awarded. The same split appears on any approval error, such as a cap race or a 409 after 8 retries, but those cases can be retried.
- Fix: run the approval preconditions (counterparty confirmation, evidence still rejected) before committing the overturn. Alternatively, for peer help, move the evidence back to an open status such as `submitted`/`pending_counterparty`, not straight to approved, so the counterparty can confirm.

### M3. Public Community Wrapped recomputes a full-year scan on every request
- Files: `app/[locale]/wrapped/[year]/page.tsx:44`, `app/api/v1/builder-wrapped/[year]/route.ts:19`, `lib/builder-league/community-wrapped.ts:173-177`, `lib/builder-league/year-review.ts:535` (`readVerifiedMilestoneEvents`).
- Failure scenario: for any non-final year, which includes the whole current year, each anonymous GET runs `computeCommunityWrapped`. That reads every verified `builder_events` row for the year, with no supporting `(occurred_at)`/`(kind)` index, and hashes the IDs. Once the flag is on, this becomes an unauthenticated, uncached, unrate-limited D1 full scan, which is cheap to amplify into D1 read cost and latency. The `cutoffAt` value is stable, so new version rows are not created on every request; the cost is the reads.
- Fix: serve `getLatestCommunityWrapped` on the request path, and recompute only in the hourly cron (`lib/builder-league/cron.ts`) or for admins. Add `Cache-Control`/ISR-style caching, and an index on `builder_events(occurred_at)` or `(kind, occurred_at)`.

## Low Priority

- L1. `app/api/v1/builder-year/[year]/share/[id]/route.ts:16-17`: DELETE revokes the link before checking `link.year !== year`. A wrong-year URL revokes the owner's link and then answers 404, so the client believes nothing happened. Fix: load the link, check the year, then revoke.
- L2. `lib/builder-league/leaderboards.ts:74` (`parseBoardQuery`) accepts any past period key. A member GET of an old period such as `2000-W01` computes and writes FINAL snapshot rows for 7 boards. This causes write amplification and permanent junk rows. Fix: limit keys to `>= SEASON_EPOCH`/ruleset v1 `effectiveFrom`, or only read past snapshots and never create them on read.
- L3. `lib/builder-league/evidence-http.ts:37-38, 99`: `assertSameSite` runs only for form posts. The comment says JSON is protected by a CORS preflight, but any non-form content type is parsed as JSON, so `text/plain` gets through without a preflight. Better Auth's default `SameSite=Lax` cookies mitigate a cross-site POST today. Fix: require `content-type: application/json` for the JSON branch, or run `assertSameSite` for every cookie-authenticated write.
- L4. `lib/builder-league/directory-events.ts:71` and `backfill.ts:148`: the cross-source "already recorded" check is read-then-write, which the ADR's D1 constraints forbid (`docs/builder-league-adr.md:64`). If an approval and a backfill of the same product run at the same time for different users (submitter vs org owner), each user gets 100 RP. The project cap does not catch this because projects are per user. Narrow window. Fix: a unique product-launch claim key, for example a cap slot keyed on `product:{id}` regardless of user.
- L5. Missing indexes in `drizzle/migrations/0003_builder_league.sql`: `builder_events(event_type, source, external_event_id)` (used by `productLaunchRecorded` on every moderation approval), `builder_events(occurred_at)`, `share_attributions(user_id)` (signup and Polar conversion path), and `activity_evidence(counterparty_user_id)`.
- L6. `lib/builder-league/cron.ts`: each hourly run recomputes 9 periods, including full-year ledger scans. This is fine at pilot scale; watch D1 rows read as the user base grows.
- L7. `lib/builder-league/privacy-requests.ts:13`: deletion keeps the dedupe keys. A later backfill or directory event for the same user and source returns the existing event, whose subject is now the `deleted-<uuid>` tombstone. In edge cases RP can be awarded to the tombstone.
- L8. `lib/builder-league/community-wrapped.ts:134`: `backfilledEvents` is published without the `MIN_COHORT` suppression. It is a count, not per user, so the risk of identifying someone is minimal; apply the same suppression for consistency.
- L9. `lib/builder-league/attribution.ts:52-67`: without `TRAFFIC_HASH_SECRET`, visits are not deduplicated, and the public visit beacon has no rate limit, so share-funnel "visits" can be inflated. Only the owner sees them, and no reward depends on them.
- L10. `lib/builder-league/wrapped-access.ts:50,59`: `canSeePublicSurface` lets a pilot without a paid tier through, while `canUse` (`access.ts`) requires a tier. The two rules are inconsistent; pick one.
- L11. `app/[locale]/builder-league/opengraph-image.tsx`: serves the Builder League card while the flag is off. This leaks only the feature name, but it differs from the 404 on the page.
- L12. Four near-duplicate page-viewer gate helpers (`getBuilderPageViewer`, `getLeagueViewer`, `getPageViewer`, `loadProgressionViewer`). This is a DRY problem: a future gate fix applied to one of them will miss the others. Consolidate them on `getViewerAccess`.
- L13. `lib/builder-league/moderation.ts:183`: `approverOf` hard-codes `actorRole: "admin"` for any moderator decision, so the ledger actor role is wrong when moderators (not admins) approve.
- L14. Reversal keeps the original award dedupe key, so evidence that is reversed and then re-approved is never awarded again. If this is by design, document it in the runbook.

## Edge Cases Found by Scout

- Ruleset boundary: v1 has no `validate_*`/`build_*` events, so evidence of those types dated before 2026-10-17 +07:00 is rejected as `unknown_event_type`. This is correct under the ruleset, but the member sees a confusing error. Consider a clearer message.
- Members can backdate `occurredAt` back to 2025-01-01 to reach unused cap windows. A moderator gate applies; this is low risk.
- Render jobs: `getRenderDownload` checks owner, year, status and expiry. The lease token is a compare-and-swap on `locked_until`, and when a lease is lost after upload the objects are deleted. No issue.
- Rewards: inventory uses `INSERT ... SELECT WHERE inventory > 0` plus a guarded decrement in one batch. The release path uses `changes() > 0`, so units cannot be oversold or double-freed. No cash-convertible rewards.
- Polar hook `recordPaidShareConversion` catches its own errors, and the signup hook `recordSignupFromShareRef` catches as well. The worker cron runs in `waitUntil` with catch. All are best-effort, as required.

## Positive Observations (risk calibration only)

- The OpenAPI and `/api/v1` changes are additive only (verified with `git diff --diff-filter=DM -- app/api/v1`, which returned nothing).
- The flag and pilot gates exist on every page under `app/[locale]/builder-league/**` and `studio/builder-league/**`. The sitemap, llms and markdown twins use `publicWrappedPaths()`, which is empty while the flag is off. `robots.ts` disallows the league paths.

## Recommended Actions

1. H1: realign 0002 with the final feat/2 before any remote migration.
2. M1: decide product intent for directory launches by non-members, then gate or defer the award.
3. M2: check approval preconditions before committing an appeal overturn.
4. M3: serve the stored Community Wrapped snapshot and recompute in the cron.
5. L1, L2, L3, L4, L5: small fixes; add the indexes in a new 0004 migration rather than editing 0003 if it has already been applied anywhere.

## Metrics

- Type coverage: not measured; there is no new `any` in the league modules apart from webhook payload typing inherited from main.
- Test coverage: not run (the suite was running elsewhere).
- Lint: not run.
- EN/VI i18n key parity: 0 differences.

## Unresolved Questions

- Is accumulating directory-launch RP before launch, for users who are not in the league, intended (M1)?
- Has `0002` or `0003` already been applied to staging D1? If so, H1 needs a corrective 0004 rather than a file swap.

## Pre-existing Issues (main)

- `lib/auth-api-key.ts` `verifyApiKey` does not check `users.banned`; only the delegation path does.
