# Builder League review fixes (issue #3)

Source review: `plans/reports/code-reviewer-261017-1730-builder-league-review.md`. H1 was skipped because the merge already fixed it. All changes are uncommitted on `feat/3-builder-league`.

## Verification

- `npx tsc --noEmit -p .`: clean.
- `npx vitest run --maxWorkers=3 tests/builder-league`: 34 files and 256 tests pass. `tests/api-docs.test.ts` also passes.
- `npx eslint` on the touched TS/TSX files: clean.
- `npx drizzle-kit generate --name probe`: "No schema changes, nothing to migrate". It generated no probe files; the temporary 0004 files from the fold step were deleted and the journal restored.

## Findings

| Finding | Fix | Files | Tests |
|---|---|---|---|
| M1 | `recordDirectoryLaunch` now checks `getViewerAccess(...).canUse` for the submitter before writing anything, and skips with `no_league_access` when access is missing. Those users can import the launch later through the opt-in backfill. | `lib/builder-league/directory-events.ts` | integration-hooks: "writes nothing for a submitter without league access…" |
| M2 | New `assertApprovable` holds the approval preconditions (exists, not self, status, counterparty confirmation) and has no side effects. `approveEvidence` uses it, and `resolveAppeal` runs it before it commits an overturn. A failing overturn returns a 409 and leaves the appeal open, so it can still be upheld. | `lib/builder-league/moderation.ts`, `lib/builder-league/appeals.ts` | peer-help: "refuses to overturn an appeal whose evidence still lacks the counterparty confirmation…" |
| M3 | Public page and API now serve the stored snapshot through `loadCommunityWrapped`. A request computes a year only when that year has no snapshot yet. The hourly cron refreshes the previous and current year (`communityWrappedYears`), and its result `communityWrapped` is now an array. `builder_events(occurred_at)` index added. | `lib/builder-league/community-wrapped.ts`, `lib/builder-league/cron.ts`, `app/api/v1/builder-wrapped/[year]/route.ts`, `app/[locale]/wrapped/[year]/page.tsx`, runbook | community-wrapped: "serves the stored snapshot…"; cron tests updated |
| L1 | `revokeShareLink` takes an optional `expected.year` and checks it before revoking. The route passes the year. | `lib/builder-league/share-links.ts`, `app/api/v1/builder-year/[year]/share/[id]/route.ts` | share-links: wrong year returns 404 and the link stays active |
| L2 | `parseBoardQuery` rejects periods that ended before the first ruleset's `effectiveFrom` (`period_before_league`). Future periods were already rejected. | `lib/builder-league/leaderboards.ts` | leaderboards: `2000-W01` and `2024` rejected, `2025` accepted |
| L3 | `assertSameSite` moved to `http.ts`. `readRequestInput` runs it for every body, and `requireBuilderLeagueUser` and `requireBuilderLeagueAdmin` run it for every non-GET request authenticated by a session cookie, which also covers routes that call `request.json()` directly. API keys and delegation are exempt. | `lib/builder-league/http.ts`, `lib/builder-league/evidence-http.ts`, `lib/builder-league/access.ts` | access: cross-site `text/plain` PATCH/POST refused; GET and API key allowed |
| L4 | One launch claim per product in `score_cap_slots`, keyed `launch|product:{id}`. Its `entry_id` holds the dedupe key of the claiming event, and the claim is written with `INSERT … ON CONFLICT DO NOTHING`. Both the directory hook and the backfill take the claim, and the dry run reports it. If the directory hook fails before its event exists, it hands the claim back. | `lib/builder-league/directory-events.ts`, `lib/builder-league/backfill.ts`, schema comment | integration-hooks: concurrent backfill by two owners gives one launch; claim released after a failed hook |
| L5 | Four indexes added to the schema, folded into `0003_builder_league.sql`, with `meta/0003_snapshot.json` kept in sync (same id/prevId). | `lib/db/builder-league-schema.ts`, `drizzle/migrations/0003_builder_league.sql`, `drizzle/migrations/meta/0003_snapshot.json` | drizzle probe |
| L7 | `awardForEventDetailed` skips events with a tombstone subject (`subject_deleted`). This covers every dedupe-key replay path. | `lib/builder-league/ledger.ts` | ledger: tombstone event not awarded |
| L8 | `backfilledEvents` is null when fewer than `MIN_COHORT` members are behind it. Type, UI guard and OpenAPI (`["integer","null"]`) updated. | `lib/builder-league/community-wrapped.ts`, `components/builder-league/wrapped/community-metrics.tsx`, `lib/builder-league/openapi/journey.ts` | community-wrapped: suppression test |
| L10 | `canSeePublicSurface` = `flagEnabled \|\| canUse`, so a pilot without a paid tier no longer gets through while the flag is off. | `lib/builder-league/wrapped-access.ts` | access: public-surface visibility test |
| L13 | `approverOf` reads the approver's role from the approval audit row (`approve` / `approve_on_appeal`) and falls back to `moderator`. | `lib/builder-league/moderation.ts` | integration-hooks: "records the role the approver actually decided in" |
| L14 | Documented that a reversal keeps the dedupe key, so it is final, including for project-scoped awards: comment on `reverseAward` and a paragraph in the runbook. | `lib/builder-league/ledger.ts`, `docs/builder-league-runbook.md` | ledger: reversed event not re-awarded |

## Notes

- `GET /api/v1/builder-wrapped/{year}`: `backfilledEvents` is now nullable. The feature is unreleased, and the OpenAPI document was updated to match.
- Public Community Wrapped figures can now trail new verified events by up to an hour (the cron cadence). The runbook says so.
- The cron now scans the current year for Community Wrapped every hour, all year round. At pilot scale this matches the existing cost note; keep watching D1 rows read.
