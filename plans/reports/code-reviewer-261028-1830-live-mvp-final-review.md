# Final review: NLB Live MVP fix commits `f9e4dff`, `5bc6b41` (branch `feat/34-live-mvp`, HEAD 5bc6b41)

Read-only review in a fresh context. It covers the two should-fix items and the Zoom nit from `code-reviewer-261028-1812-live-mvp-rereview.md`, plus a stray-file check of the branch.

## Checks run

- `npx vitest run tests/live-api/live-operator-routes.test.ts tests/live/zoom-meeting-provider.test.ts tests/operators`: 4 files, 30/30 passed, no ECONNRESET.
- `npx tsc --noEmit -p .`: exit 0.
- `npx eslint` on the touched files: clean.

## Prior findings

| Prior | Fix | Result |
|---|---|---|
| S1: approval reads not scoped to the Live domain | `LIVE_APPROVAL_ACTIONS` is defined as `SENSITIVE_OPERATOR_ACTIONS` filtered to `live.*` (`lib/live/http/live-operator-route.ts:28`). Both read functions now require an `actions` parameter, and the filter is applied in SQL. `getApprovalView` uses `and(eq(id), inArray(action))` (`lib/operators/operator-approval-reads.ts:89-101`), so an out-of-domain row reads as null and the route answers 404. `listApprovalPage` adds `inArray(action)` to its conditions (`:110`), so the pagination cursor and `limit + 1` stay correct. Test: a seeded `operator.grant` row is absent from the list and answers 404 by id (`tests/live-api/live-operator-routes.test.ts:208-216`) | Fixed. The parameter is required, not optional, so a future caller cannot forget it and get an unscoped read |
| S2: ADR and guard comment misdescribed the throttle | ADR (`docs/live-and-access-adr.md:40`) now says: anonymous denies are not written; a signed-in caller denied access for any access reason writes at most one row per action and reason per minute; allows and approval events are always written. Guard docblock (`lib/operators/operator-guard.ts:76`) now says "repeated signed-in denies are throttled". Checked against the code: `THROTTLED_DENIES` holds all 8 access reasons (`:14-23`) and the lookup is keyed on actor, action, reason and the 60 s window (`:32-48`). Approval codes are not in the set, so they are always written | Fixed. Doc and code agree |
| N1: Zoom timeout or network failure gave a 500 | A new `send()` wrapper (`lib/live/meetings/zoom-meeting-provider.ts:87-94`) turns any `doFetch` rejection into `MeetingProviderError("zoom", null, …)`. It is used for the token request and for every API call. `status: null` was already allowed by the type (`meeting-provider.ts:52-57`). The test asserts the timeout case (`tests/live/zoom-meeting-provider.test.ts:111-126`) | Fixed |

## Callers checked for regressions

- **`getApprovalView` / `listApprovalPage`.** Grep finds only the two approval routes. Both pass `LIVE_APPROVAL_ACTIONS`. No MCP or other caller exists.
- **Zoom error handling.**
  - `liveErrorResponse` (`lib/live/http/live-http-errors.ts:38-41`) maps `MeetingProviderError` to `502 meeting_provider_failed`. The meeting route (`app/api/v1/live-admin/events/[id]/meeting/route.ts`) runs inside `runOperatorRoute` → `withLiveErrors`, so a timeout now answers 502 instead of 500.
  - `registerTicketHolder` (`meeting-service.ts:120-130`) catches all errors and records `failed`. The behavior is unchanged; only the message text is clearer.
  - The cancel sweep (`meeting-service.ts:200-235`) treats only `MeetingProviderNotFoundError` as done. A wrapped timeout is not a NotFound subclass, so it still retries with backoff, as intended.
  - `accessToken()` is evaluated before `send()` in `call()`, so token failures are not double-wrapped.
  - A timeout while reading the body after the headers arrive is caught by `readJson` and becomes a "no id/registrant" `MeetingProviderError`. Still a 502.
- **Branch hygiene.** `git diff origin/dev...HEAD --stat` shows 153 files. The only file outside the source directories that matches the secret patterns is `.dev.vars.example`, and it has only empty placeholders (`LIVE_ENABLED`, `ZOOM_*`). `wrangler.jsonc` adds only `LIVE_ENABLED` flags. No `.dev.vars`, `.env*`, logs, keys or debug output in the branch.

## Blocking

None.

## Should-fix

None.

## Nits (non-blocking)

- **N1.** The decision route can still be probed for an out-of-domain approval's state. `app/api/v1/live-admin/approvals/[id]/decision/route.ts` → `decideApproval` (`lib/operators/operator-approvals.ts:122-133`) runs the not-found, expired, not-pending and self-decision checks before the domain capability check. A Live operator who knows a system approval's UUID can therefore learn whether it exists and what state it is in (409 codes or 403, against 404). No args or reason leak, and since the list no longer returns the ids, this needs a leaked UUID. Optional fix: when the route is reached via `live-admin`, answer `approval_not_found` for a non-Live action.
- **N2.** The network-failure branch ("could not reach Zoom") has no test. Only the timeout path is covered (`tests/live/zoom-meeting-provider.test.ts:111-126`). A one-line test with a fetch that rejects with a `TypeError` would cover it.
- **N3.** A timed-out `createMeeting` may have succeeded at Zoom. The code comment says so (`zoom-meeting-provider.ts:85`), but nothing logs a "possible orphan meeting" for the operator. Optional.
- Nits carried from the previous review (migration 0004 edited in place, the throttle being check-then-insert, the sweep index, and the older N2/N3/N6/N8/N9) are unchanged and remain non-blocking.

## Unresolved questions

1. As before: has `0004_live_access.sql` been applied to any remote D1? If yes, ship the new columns as `0005`.

Verdict: CLEAN
