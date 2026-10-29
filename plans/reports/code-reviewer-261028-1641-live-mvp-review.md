# Code review: NLB Live MVP + access foundation (`origin/dev...feat/34-live-mvp`)

Scope: 150 files, ~20.4k insertions (9.2k of them the drizzle snapshot). Read-only review. Targeted tests run: `tests/live/seats.test.ts`, `tests/live/live-webhook-tickets.test.ts`, `tests/operators/operator-approvals-and-guard.test.ts`: 21/21 pass. The first run had 2 transient `ECONNRESET` failures caused by machine load; the rerun was green. No UI screenshots taken, so the REVIEW.md viewport and Lighthouse checks were not verified.

## Contract check

| # | Item | Status |
|---|---|---|
| 1 | ADR | done (`docs/live-and-access-adr.md`) |
| 2 | `authorize()`; banned → deny; video semantics unchanged | done. Video delegates to the unchanged `canWatchVideo` |
| 3 | operators / audit / approvals, TTL, arg hash, single use, replay blocked | done (single conditional UPDATE in `consumeApproval`). See S1 and S6 |
| 4 | additive migration | done. `0004_live_access.sql` only creates tables and indexes |
| 5 | vote rules | done. PK `(round_id,user_id)`, SQL-side window recheck, tie-break, frozen snapshot |
| 6 | state machine + holds never oversell | done. Conditional UPDATE per claim and a CAS on transitions |
| 7 | webhook idempotent / refund ordering | done. Unique `polar_order_id`, refund tombstone, guarded batches. Existing handlers unchanged |
| 8 | MeetingProvider + Zoom, fail closed, join window | done. See S4 and S5 |
| 9 | `/live` pages + discovery | done, flag-gated. See S3 and S7 |
| 10 | operator REST (authorize + audit) | done. See S1, S2 and S6 |

Constraints: no `operator:*` wildcard (verified, `CAPABILITIES` is an exact set). No raw SQL tool. No secrets in the diff. API keys never qualify for operator (`decideOperator`). Builder League admin routes untouched. Join URLs are never in HTML or JSON-LD, `no-store` is set on join and all `ok()` responses, and the Zoom `start_url` and token are never read out.

## Blocking

None found.

## Should-fix

**S1. Approvers decide blind: no route shows what they are approving.**
`app/api/v1/live-admin/approvals/route.ts` (POST only) and `approvals/[id]/decision/route.ts`.
- Scenario: operator A requests `live.ticket.refund` with target `{ticketId: X}` (or `live.poll.override` with an arbitrary `topicId`). Operator B gets only an approval id. No route returns the approval's action, target args, reason or requester. The audit rows hold only `resource` (for example `live:ticket:<eventId>`), `argsHash` and `{requestedAction}`, never the ticket or topic id.
- Effect: B cannot verify what they approve, so the two-person control becomes a rubber stamp.
- Fix: add `GET /api/v1/live-admin/approvals[/{id}]` (operator-guarded and audited) that returns action, resource, the canonical args, reason, requester, status and expiry. Also store the canonical args (non-personal ids) on the approval row, or recompute them from the target, so the approver can check them against the hash.

**S2. Anonymous and non-operator traffic writes an audit row on every request, with no rate limit.**
`lib/live/http/live-operator-route.ts:63-66` → `operator-guard.ts:57-63`.
- Scenario: any internet client loops `GET /api/v1/live-admin/events`. Each request runs `requireOperator`, which inserts a `deny` row into `operator_audit_logs` (actor null).
- Effect: the append-only table grows without bound and costs D1 writes. It also drowns real operator denies in the audit trail.
- Fix: do not write audit rows for `unauthenticated` denies (log a counter instead). Rate-limit deny-row writes per user or IP (`enforceUserRateLimit` or an IP limiter) before writing.

**S3. The public OpenAPI document advertises every Live member and operator endpoint while `LIVE_ENABLED=false`.**
`lib/openapi.ts:49,435`, served by the force-static `app/api/openapi.json/route.ts:4`.
- Scenario: in production with the flag off, `/api/openapi.json` and `/api-docs` list `/api/v1/live/*` and `/api/v1/live-admin/*` (approvals, refunds, audit), but the member routes answer 404.
- Effect: the hidden feature leaks, and the paths are published as a public contract. Because the contract is additive-only, removing or renaming them later would count as a breaking change.
- Fix: either gate the member paths on the flag (needs a dynamic route) or keep them out of the spec until launch. Confirm the intended policy with the owner.

**S4. The join path creates Zoom meetings lazily, so concurrent joins cause a thundering herd that leaves orphan Zoom meetings.**
`lib/live/meetings/join-access.ts:59-61` → `meeting-service.ts:35-59`.
- Scenario: the operator never calls `POST /events/{id}/meeting`. At T-15 min, N ticket holders open the page. Each `GET /join` runs `registerTicketHolder` → `ensureEventMeeting`, sees no `live_meetings` row and calls `provider.createMeeting`.
- Effect: up to N Zoom meetings are created. The primary key keeps one; the rest are orphans that are only logged, and Zoom rate limits get hit at the worst possible moment.
- Fix: have `registerTicketHolder` and the join path only read the meeting and answer `not_ready` when it is missing. Create the meeting only through the operator route, or automatically at `openSales`.

**S5. The registrant-cancellation sweep can block itself and retry failures every minute forever.**
`lib/live/meetings/meeting-service.ts:137-171`, called every minute from `worker.ts` / `live-cron.ts`.
- Scenario: rows whose Zoom cancel fails permanently (registrant or meeting deleted → 404, a meeting already ended, revoked app scope) keep `provider_registrant_id`, so they are re-selected on every run. The SELECT has no ORDER BY, no attempt counter and no backoff, with `LIMIT 200`.
- Effect: once 200 such rows exist, newly refunded registrants may never be cancelled at Zoom, so their personal join links keep working at the provider. Meanwhile every minute sends up to 200 failing Zoom calls.
- Fix: treat a 404 as done. Add `attempts` / `next_attempt_at` columns (additive) or order by `updated_at` and skip rows whose `last_error` is recent. Stop retrying for events whose `ends_at` has passed.

**S6. The approval is consumed before the action runs, so a transient downstream failure burns it.**
`lib/operators/operator-guard.ts:73-82`, then `run()` in `live-operator-route.ts:82`.
- Scenario: the refund route consumes the approval, then Polar `orders.get` or `refunds.create` returns 502 (`live-ticket-refund.ts:73,103`). The same happens when `cancelEvent` hits a 409 CAS conflict.
- Effect: the approval is now `consumed` and a fresh two-person round-trip is needed for a retry. Arguably safe, but it is operational friction on exactly the time-critical actions.
- Fix: accept this and document it, or add a compensating `consumed → approved` reset only for provider errors that are provably pre-effect (the Polar lookup failure). Do not reset after `refunds.create` was attempted.

**S7. The Live nav flag is read in the locale layout, which statically prerendered pages bake in at build time (uncertain).**
`app/[locale]/layout.tsx:35`, with `app/[locale]/policies/[slug]/page.tsx:10` (`generateStaticParams`, no dynamic APIs).
- Scenario: when policies pages are prerendered at build, `isLiveEnabled()` has no Cloudflare request context and falls back to the build machine's `process.env.LIVE_ENABLED`.
- Effect: in production a build env with `true` would show a Live nav item that 404s. On staging, static pages would hide it.
- Note: Builder League avoided this with a client hook (`useBuilderLeagueNav`).
- Fix: confirm the build env never sets `LIVE_ENABLED`, or read the flag client-side or through a dynamic segment. I did not verify the actual build output.

## Nits

- **N1. Banned voters stay counted.** `poll-tallies.ts:31-39` counts votes of users banned after voting. Exclude banned users at finalize, or document that they are counted.
- **N2. A vote can miss the snapshot by milliseconds.** `castVote` (`polls.ts:128-137`) checks the window against the request-start `now`. A vote can therefore land after `finalizeRound` computed its tallies (`poll-tallies.ts:76-82`), so it sits in `live_votes` but not in the snapshot. Use `unixepoch('subsec')*1000` in SQL for the window check.
- **N3. Re-registration can overwrite a pending provider cancel.** `registerTicketHolder` upserts over a `cancelled` registration whose `provider_registrant_id` is still waiting to be cancelled (refund, then rebuy before the sweep). The upsert clears that id, so the old registrant is never cancelled at Zoom. Zoom usually returns the same registrant for the same email, which lowers the impact; this is unverified.
- **N4. No timeouts on Zoom fetches.** The fetches in `zoom-meeting-provider.ts:81,96` have no timeout or AbortSignal, so a hung Zoom call stalls a join request or the cron.
- **N5. Bad references surface as 500.** `updateEvent` / `createEventDraft` do not check that `topicId` / `pollRoundId` exist. With D1 foreign keys on, a bad id becomes a generic 500 instead of a 400.
- **N6. Seat-holding by many accounts is not rate-limited across accounts.** Many verified free accounts can each hold one seat for 15 minutes and keep a small event "sold out". This is a product risk, not a code defect. Consider a per-IP checkout limit or a shorter hold.
- **N7. Join panel shows the wrong state on 401.** `components/live/live-join-panel.tsx:42` maps 401 to the generic error state, not to sign-in or no-ticket.
- **N8. Files over 200 lines.** `lib/live/live-copy.ts` (391, copy tables, acceptable), `lib/db/live-access-schema.ts` (322) and `components/live/live-ui-helpers.ts` (207). Splitting the schema per table group would help navigation.
- **N9. Cron errors before the migration.** The cron runs two UPDATEs every minute in production with the flag off. If the code deploys before migration 0004 is applied, it logs errors every minute. Apply the migration first; the deploy order is worth a line in the deployment guide.

## Verified non-issues (for calibration)

- **Seat claim cannot oversell.** It is one UPDATE with a re-checked `claimableSeat` and a `NOT EXISTS mine` guard. The reservation INSERT…SELECT is keyed by the claimed `reservation_id`.
- **`applyPaid` ignores the losing insert.** Later statements are guarded by `EXISTS live_tickets.id = new ticketId`, so a lost ON CONFLICT race writes nothing. A second active ticket per user is blocked in SQL.
- **Refund ordering is safe.** A refund that arrives before the paid event leaves a `refunded` tombstone, and a late paid event is then a duplicate. Partial refunds are ignored. The entitlement is kept when another active ticket exists. The `entitlements(user_id, feature_key)` unique index exists (0000_init), so the ON CONFLICT target is valid.
- **Existing webhook behavior is unchanged.** `handleOrderCreated` / `handleOrderRefunded` / course sync are untouched. Live sync is appended after them; Live orders also get an `orders` row and the Discord notice, the same as course videos.
- **Delegated scopes are bound per request.** `verifyMcpDelegation` binds scope, method and path. Operator routes demand `mcp:operator`, and member routes demand `mcp:read` / `mcp:write`. Sessions doing writes get `assertSameSite`.
- **Banned users are denied everywhere.** `loadUserFacts` denies until `ban_expires`, which also covers API keys and sessions.
- **The approval is consumed atomically.** The conditional UPDATE binds action, resource, args hash, requester, expiry and status. Self-decision is refused both in code and in SQL (`ne(requestedBy)`).

## Pre-existing (separate issues, not fixes for this PR)

- **`resolveCaller` session branch does not check ban** (`lib/auth-api-key.ts:180-196`), unlike the delegation branch. Live is protected by `authorize()`, but other `/api/v1` routes that rely on `resolveCaller` alone may not be. Unverified whether Better Auth's ban plugin already revokes sessions.

## Unresolved questions

1. Should Live paths appear in the public OpenAPI document while the flag is off (S3)?
2. Is the build environment guaranteed never to carry `LIVE_ENABLED` (S7)?
3. Is a burned approval on a transient Polar failure acceptable (S6)?

Verdict: CHANGES_REQUIRED (no blockers; should-fix S1–S5 are real defects, S6–S7 need an owner decision)
