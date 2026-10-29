# Re-review: NLB Live MVP + access foundation (`origin/dev...feat/34-live-mvp`, HEAD 820b2a6)

Scope: the full diff (153 files, ~21.1k insertions, 9.2k of them the drizzle snapshot), with most attention on the 12 fix commits `16be477..HEAD` (41 files, +878/-106). The review was read-only.

Tests run, all passing (64/64, no ECONNRESET): `tests/operators/operator-approvals-and-guard.test.ts`, `tests/live/join-access.test.ts`, `tests/live-api/live-operator-routes.test.ts`, `tests/live/zoom-meeting-provider.test.ts`, `tests/live/polls.test.ts`, `tests/live-api/live-openapi-and-sweeps.test.ts`, `tests/live/event-lifecycle.test.ts`, `tests/live-api/live-member-routes.test.ts`.

Not run: the full suite, the build, and the UI viewport and Lighthouse checks.

## Previous findings: fix verification

| Prior | Fix | Verdict |
|---|---|---|
| S1 approvers decide blind | `operator_approvals.args` holds the canonical JSON. `requestApproval` now computes the hash itself from the same `canonicalJson`, so `sha256(args) === args_hash` by construction. Added `GET /live-admin/approvals[/{id}]`, which is operator-guarded and audited. The effective-status SQL filter matches `effectiveStatus()` | Correct. The new reads are missing a domain scope, see S1 below |
| S2 deny flood | Anonymous denies are never written. Signed-in access denies are throttled per user, action and reason over 60 s, using the existing `(actor_user_id, created_at)` index. Approval failures are always written | Correct, and it matches the accepted decision. The ADR text is stale, see S2 |
| S3 OpenAPI leak | `PUBLISH_LIVE_OPENAPI = false` drops both the paths and the schemas. A test asserts that Live is absent. No other Live reference remains in `lib/openapi.ts` | Correct |
| S4 join herd | `registerTicketHolder` only reads `live_meetings` and returns `no_meeting` (shown as `meeting_not_ready`) before any upsert or provider call. `ensureEventMeeting` is called only from the operator route (grep-verified). ADR runbook updated | Correct |
| S5 sweep jam | A 404 counts as done (`MeetingProviderNotFoundError`). Retries back off exponentially, capped at 60 min. Only due rows are selected, NULLs first. After `endsAt` a row moves to terminal `cancel_abandoned`. The status guard is now part of every per-row UPDATE. The re-register upsert resets the backoff columns | Correct |
| S6 burned approval | Documented in the ADR as an accepted decision | Accepted |
| S7 build-time nav flag | The layout no longer reads the flag. `useLiveNav` probes `GET /api/v1/live/nav` (force-dynamic, always 200, `no-store`), caches the answer in sessionStorage and hides the entry on failure. Sitemap and llms routes are already `force-dynamic` | Correct. The always-200 probe also keeps the home page console clean |
| N1 banned voters | `computeRoundTallies` excludes accounts banned at `now` with the same semantics as `loadUserFacts` (`banned=1 AND (ban_expires IS NULL OR > now)`, timestamp_ms). It applies to both finalize and the closed view | Correct |
| N4 Zoom timeouts | `AbortSignal.timeout(10s)` on the token request and every API call | Correct, but see N1 below |
| N5 bad refs → 500 | `assertReferencesExist` runs on create and update, giving a 400 | Correct. The FK race in between is negligible |
| N7 join 401 | A 401 now shows a sign-in prompt using `signInHref` from the hero. EN and VI copy both added | Correct |
| N2, N3, N6, N8, N9 | Not addressed | Still nits, see "Carried" |

No regressions found in the paths the fixes touched. The approval hash binding is unchanged: the action route still hashes `plan.args`, which equals `target.args`.

## Blocking

None.

## Should-fix

**S1. Approval reads are not scoped to the caller's capability domain.**
Files: `lib/operators/operator-approval-reads.ts:86-115`, `app/api/v1/live-admin/approvals/route.ts:23-38`, `app/api/v1/live-admin/approvals/[id]/route.ts:15-27`.
- Scenario: `operator_approvals` is shared across domains. `operator.grant` and `operator.revoke` map to `system` (`operator-actions.ts:7-13`). Writing on the decide path checks the domain: `decideApproval` calls `assertOperatorFor(row.action)`. Reading does not. The list and get routes only check `operator:live` and return every row, including its `args` (target user id, capability) and the free-text `reason`.
- Effect: once a system-domain approval writer exists, any `live:manage` operator can read system-administration approvals, a capability boundary the ADR says has no wildcard. Today this is latent, because the only writer creates Live actions.
- Fix: in `listApprovalPage`, add `inArray(operatorApprovals.action, <sensitive actions whose domain is live>)`. In `getApprovalView`, return null (so the route answers 404) when `sensitiveActionDomain(row.action) !== "live"`. Add one test with a seeded `operator.grant` row.

**S2. The ADR misstates the deny-audit policy the code now implements.**
Files: `docs/live-and-access-adr.md:40` against `lib/operators/operator-guard.ts:14-23`. The guard docblock at `:76-78` also says "capability denies".
- The ADR says only `not_operator` and `missing_capability` are throttled, per action, and that "every other deny" is always written.
- Since `820b2a6`, the code throttles all eight signed-in access reasons (`banned`, `email_unverified`, `insufficient_scope`, `credential_not_allowed`, `no_entitlement`, `not_operator`, `missing_capability`, `not_available`), keyed on action plus reason. That matches the accepted decision, so the doc is what is wrong.
- Effect: an auditor relying on the ADR would expect a row for every banned-user or scope deny.
- Fix: change the ADR sentence to "signed-in access denies are written at most once per user, action and reason per minute; approval failures and allows are always written", and update the guard docblock to match.

## Nits

- **N1. Zoom transport failures and timeouts surface as a generic 500.** `zoom-meeting-provider.ts:86-91,103-108`. `AbortSignal.timeout` and network failures reject with a `DOMException` or `TypeError`, which is not a `MeetingProviderError`. On `POST /live-admin/events/{id}/meeting`, `liveErrorResponse` therefore falls through to a 500 instead of `502 meeting_provider_failed`. A timed-out `createMeeting` may also have succeeded at Zoom, so the operator's retry creates an orphan meeting that nothing logs. Fix: wrap `doFetch` rejections in `MeetingProviderError("zoom", 504, ...)`. Optionally log "possible orphan" when a `createMeeting` times out.
- **N2. Migration `0004_live_access.sql` was edited in place.** The fix commits added `cancel_attempts`, `next_cancel_attempt_at` and `args`. This is safe only if 0004 was never applied to a remote D1. CI applies migrations only on `dev` and `main`, and the branch is not merged, so it is likely fine. Any local or staging D1 that already applied the old 0004 would lack the columns, and the sweep and approval inserts would then fail every minute. See question 1.
- **N3. The deny throttle is check-then-insert, not atomic.** `operator-guard.ts:32-48`. A concurrent burst can write a few rows inside one window. The number is bounded and acceptable; noting it so nobody assumes exactly one.
- **N4. The every-minute sweep has no supporting index.** It filters `live_attendee_registrations` by `status`, `provider_registrant_id` and `next_cancel_attempt_at`. The table is small today; consider `(status, next_cancel_attempt_at)`.
- **N5. Carried from the previous review:**
  - N2: the vote window is checked against the request-start `now`, so a vote can land after the snapshot by milliseconds (`polls.ts:127-136`).
  - N3: the re-register upsert clears a still-pending provider registrant id (`meeting-service.ts:110-118`).
  - N6: holding seats is not limited across accounts.
  - N8: `meeting-service.ts` is now 237 lines, `live-access-schema.ts` over 300.
  - N9: deploy order relative to the migration.

## Verified as correct (re-checked this pass)

- **Operator route flow.** Preflight `authorize` → `requireOperator` deny with audit → `prepare` → `requireOperator`, which consumes the approval and writes the allow row (fail closed) → `run`. Non-operators never reach input validation. API keys never qualify. There is no `operator:*` wildcard.
- **Approvals.**
  - TTL is capped at 24 h.
  - The requester must hold the capability.
  - Self-decision is refused both in code and in the SQL (`ne(requestedBy)`).
  - Consumption is a single conditional UPDATE on id, action, resource, hash, requester, expiry and status, so replay and mismatch are blocked.
  - The new `args` column holds ids only.
- **Join.**
  - It is gated on an active ticket and an active `live:ticket:<id>` entitlement.
  - It opens at `startsAt − 15 min` and closes at `endsAt`.
  - Cancelled or ended events never return a URL.
  - Decryption failure answers `not_ready`.
  - The join path creates no provider meeting.
- **Sweep.**
  - Each per-row UPDATE carries the `status='cancelled'` guard, so a concurrent re-registration is not clobbered.
  - Abandonment is logged once, gated on the `returning()` row.
  - Event-cancel and refund SQL still mark registrations `cancelled`. A `cancel_abandoned` row re-enters the sweep only on an event cancel after its end time, which is harmless.
- **Flag reads.** The nav, pages, OG images, sitemap, llms, md twins and the member API (`live-request-context.ts:45`) all read the flag at runtime. Operator APIs ignore the flag, by design.
- **Constraints.** `/api/v1` changes are additive (a new `nav` route; Live is absent from the public spec). Builder League admin routes are untouched. There is no raw SQL tool, and no secrets are in the diff.
- **Earlier verifications still hold** (no fix commit touched these files): seat claim and hold cannot oversell; the webhook is idempotent with a refund tombstone; the vote PK is `(round_id, user_id)` with an SQL window recheck and a tie-break on earliest `updated_at` then id; the snapshot is frozen.

## Unresolved questions

1. Has `0004_live_access.sql` been applied to any remote D1 (staging previews, manual `db:migrate:staging`)? If yes, ship the three new columns as `0005` (`ALTER TABLE ... ADD COLUMN`) instead of relying on the edited 0004.
2. Is a system-domain approval writer (`operator.grant` / `operator.revoke` over REST or MCP) planned for a later phase? That decides how urgent S1 is. The fix is cheap either way.

Verdict: CHANGES_REQUIRED
