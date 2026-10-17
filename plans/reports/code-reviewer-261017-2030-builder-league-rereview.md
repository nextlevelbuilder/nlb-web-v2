# Builder League re-review (issue #3)

Date: 2026-10-17. Reviewer: code-reviewer (read-only). Branch `feat/3-builder-league` at HEAD 702e791. The fixes are committed in 702e791, although the fix report says they are uncommitted.

## Scope

- `git diff origin/dev...HEAD`, limited to Builder League code, with a close read of the fix commit 702e791 (22 code files).
- I verified each prior finding by reading the code, not the fix report. I also looked specifically for regressions in four areas: the same-site check on session writes, the launch claim in `score_cap_slots`, the Community Wrapped snapshot path, and appeal overturns.
- Checks run here:
  - `npx tsc --noEmit -p .`: clean.
  - `npx vitest run --maxWorkers=3 tests/builder-league`: 34 files and 256 tests pass.
  - The four new indexes appear in both `0003_builder_league.sql` and `meta/0003_snapshot.json`.

## Verdict: CLEAN

0 Critical, 0 High, 0 Medium, 3 Low, plus a few informational notes.

## Prior findings: verification

| ID | Status | Evidence |
|---|---|---|
| H1 | Fixed | `git diff origin/dev...HEAD -- drizzle/migrations` touches only 0003, its snapshot and the journal. 0002 is taken from dev. |
| M1 | Fixed | `lib/builder-league/directory-events.ts:139`: `getViewerAccess(db, submitter).canUse` runs before any claim or write. |
| M2 | Fixed | `lib/builder-league/appeals.ts:115`: `assertApprovable` runs before the overturn batch. Rejected evidence cannot move to another status (`decideEvidence`, edit and withdraw all require `OPEN_EVIDENCE_STATUSES`; `evidence.ts:382,506`; `moderation.ts:347`). So no state can change between the check and the commit, apart from a privacy delete, which deletes the appeal as well. If `approveEvidence` fails after the overturn is committed, a retry still completes it (`current.status === "overturned"` leads to the approval). |
| M3 | Fixed | The page and the API call `loadCommunityWrapped`; the only `ensureCommunityWrapped` caller left is `cron.ts:140`. The OG image reads `getLatestCommunityWrapped`. Index `builder_events_occurred_idx` added. |
| L1 | Fixed | `share-links.ts:71`: the year is checked before the revoke. |
| L2 | Fixed | `leaderboards.ts:92`. |
| L3 | Fixed | `access.ts:93` covers session non-GET requests in both guards, and `evidence-http.ts:85` covers every body read. |
| L4 | Fixed | `directory-events.ts:79-89`: `INSERT ... ON CONFLICT DO NOTHING`, then the holder is compared. Both sources take the claim. |
| L5 | Fixed | 4 indexes. 0003 has not been applied remotely yet (`brief.md:25` puts the remote migration after the merge), so changing it in place is safe. |
| L7 | Fixed | `ledger.ts:262`, using `subject_deleted`. |
| L8 | Fixed | `community-wrapped.ts:95-98`, the UI guard and the OpenAPI `["integer","null"]` are all updated. The feature is unreleased, so this does not break the additive-API rule. |
| L10 | Fixed | `wrapped-access.ts:54`. |
| L13 | Fixed | `moderation.ts:188-205`. `moderator` is in `AWARDING_ROLES` (`types.ts:66`), so approvals by moderators still award. |
| L14 | Documented | Comment on `reverseAward` and a paragraph in the runbook. |

## Regression probes

### Same-site check on session writes
- No breakage found.
- `origin !== new URL(request.url).origin` is the same comparison production already relies on in `lib/traffic/collection.ts:6` and `app/api/v1/products/[slug]/pulse/route.ts:41`. That means `request.url` carries the public origin on Workers.
- The client `fetch` writes (claim reward, seasons, time capsule, confirm help) and the HTML form posts are all same-origin.
- The only server action (`app/[locale]/builder-league/settings/actions.ts`) does not use these guards, and Next already checks the origin of server actions.
- API keys and MCP delegation are exempt in `requireBuilderLeagueUser`.
- Routes that are not session-authenticated (Discord ingest, the visit beacon, render-job callbacks) do not call the guards.

### Launch claim in `score_cap_slots` and privacy delete
- The claim key `launch|product:{id}` contains no user id, so the slot-key rewrite (`privacy-requests.ts:351-353`) leaves it alone. Only `user_id` is moved to the tombstone, and `entry_id` (the marker) is kept.
- If the same person later rejoins and backfills, the marker matches. The event dedupe then returns the tombstone event, and `subject_deleted` stops any award, so nothing is awarded twice.
- A reversal releases slots by `entry_id = ledger id`. Ledger ids are UUIDs and the claim marker is a sha256 hex, so a reversal never frees a launch claim.
- `takenSlots` matches prefixes that start with `{userId}|`, so launch claims never count against a member's caps.

### Community Wrapped staleness
- A new version row is written only when the canonical data changes (`community-wrapped.ts:186`), so there are at most about 8,760 rows a year.
- Once a year's snapshot is final it is never replaced. The cron keeps the previous year current until it becomes final.
- Public figures can trail new events by up to an hour; the runbook documents this.

### Appeal overturn atomicity
- See M2 in the table above. The only gap left is a product limitation, described in Low-1.

## Findings

### Critical
None.

### High
None.

### Medium
None.

### Low

**Low-1. A rejected peer-help appeal without the counterparty's confirmation can never be overturned.**
- Files: `lib/builder-league/appeals.ts:115`, `lib/builder-league/peer-help.ts:105`.
- Scenario: a moderator rejects peer-help evidence that has no counterparty confirmation, and the member appeals. Every overturn returns 409 `counterparty_unconfirmed`. The counterparty cannot confirm either, because `confirmPeerHelp` only accepts evidence in an open status. The appeal sits in the admin queue until someone upholds it.
- Effect: the state stays consistent; this is a dead end for the member, not corruption.
- Fix: decide on the product behaviour. Either an overturn of an unconfirmed peer-help moves the evidence back to `submitted` so the counterparty can confirm, or the runbook and the admin message say "uphold, then ask the member to resubmit".

**Low-2. The backfill never hands back a launch claim when it fails after taking it.**
- File: `lib/builder-league/backfill.ts:164-185`. The directory hook does release its claim on failure (`directory-events.ts:156-158`); the backfill does not.
- Scenario: the backfill takes the claim for user A, then `findOrCreateProductProject` or `recordBuilderEvent` throws.
  - If user A's backfill runs again, it recovers, because the marker matches.
  - If A never runs it again, or A's league data is deleted before that, a co-owner B is blocked from the launch for good. B's backfill reports `launch_already_recorded` although no event exists.
- Likelihood: narrow, because it needs a D1 failure at exactly that point.
- Fix: wrap the work after the claim in the same try/catch with `releaseProductLaunchClaim(db, claim)`.

**Low-3. The same-site check on request bodies applies to every auth type, not only session cookies.**
- File: `lib/builder-league/evidence-http.ts:85` (`readRequestInput` calls `assertSameSite` with no auth check).
- The fix report says API keys and delegation are exempt. That is true in `access.ts`, but `handleWrite` then runs `readRequestInput`, which checks every caller.
- Effect today: none. `/api/v1` sends no CORS headers, so no browser holding an API key can call it from another site, and server-side clients send neither `Origin` nor `Sec-Fetch-Site`.
- Risk: if CORS is ever opened for API-key callers, these routes would refuse them with `cross_site_request`.
- Fix: rely on `assertSameSiteSessionWrite` alone, or pass the caller's auth type into `readRequestInput`. At minimum, correct the comment in `evidence-http.ts:6-8`.

### Informational (no action needed)
- `snapshots.ts:235` still sets `previousKey` for the earliest allowed period. Following it from 2025-W01 now gives a 404 (`period_before_league`). Nobody is likely to page 90 weeks back.
- `loadCommunityWrapped`: if many requests arrive at once for a year with no snapshot, each computes the year once, before the first insert. This happens once per year and only before the first cron run.
- `createdAt` on the API response is when the data last changed, not when the snapshot was last refreshed. Clients cannot tell how fresh it is, which is acceptable for a provisional aggregate.
- `assertSameSite` accepts `Origin: null`. Browsers that send `Sec-Fetch-Site` are still refused, and SameSite=Lax cookies block a cross-site POST, so the remaining exposure is only older browsers without `Sec-Fetch-Site`.

## Recommended actions
1. Low-2: release the backfill launch claim on failure (a one-line try/catch, mirroring the directory hook).
2. Low-1: get a product decision on unconfirmed peer-help appeals; at least document "uphold and resubmit" in the runbook.
3. Low-3: correct the comment or narrow the body check to session callers.

## Metrics
- Typecheck: clean.
- Tests: 256/256 pass in `tests/builder-league` (34 files).
- Lint: not re-run (the fix report says it is clean on the touched files).
- New `any`: none.

## Unresolved questions
- Low-1: when a peer-help overturn comes in without the counterparty's confirmation, should it move the evidence back to `submitted` for confirmation, or should the admin uphold it?
