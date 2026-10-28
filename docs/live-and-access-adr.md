# ADR: NLB Live, shared access policy and platform operators

Status: accepted · Date: 2026-10-28 · Issue: nextlevelbuilder/nlb-web-v2#34 · MCP counterpart: nextlevelbuilder/nlb-directory-toolkits#19

## Context

NLB sells Courses videos (per-video Polar orders, `video:<id>` entitlements, VIP plan access) and memberships (Premium, VIP). The next product is **NLB Live**: weekly community-voted livestream topics, paid seats, hosted meetings and, later, replays sold as Courses videos. Members and operators will also reach these resources through the existing MCP endpoint `https://mcp.nextlevelbuilder.io/mcp`.

Access checks are spread today across `canWatchVideo`, Builder League `getViewerAccess`, `users.role === "admin"` checks and API-key scopes. A second product with paid access, plus agents acting for users and operators, needs one answer to "may this subject do this action on this resource now?".

The runtime is a Cloudflare Worker on D1. D1 has no interactive transactions: one SQL statement or one `db.batch([...])` is the atomic unit.

## Decision

### One MCP endpoint, one policy

- There is exactly one MCP endpoint. Member and operator tools live behind it; there is no separate admin MCP server and no raw SQL tool. MCP `tools/list` filtering is UX only: **every** REST, domain or MCP call is checked server-side by `authorize()`.
- `authorize({ subject, action, resource, context })` in [`lib/access/authorize.ts`](../lib/access/authorize.ts) is the single resolver. Contract: [`lib/access/types.ts`](../lib/access/types.ts). It loads current facts on every call (no cached grants), so bans, refunds, revoked operators and ended subscriptions take effect at the next check.
- Independent concepts, checked separately: identity (user, banned, email verified), credential (session, API key, MCP delegation, OAuth) and its scopes, membership tier, purchased entitlement, operator capability, per-action approval.

### Rules

| Resource | Action | Allowed when |
|---|---|---|
| `video:<id>` | watch | unchanged `canWatchVideo`: active `video:<id>` entitlement, paid order, or a plan in `COURSES_ACCESS_PLANS` (VIP by default). Premium alone does not unlock Courses. |
| `live:event:<id>` | read | anyone (published events only; drafts are operator-only) |
| `live:poll:<roundId>` | vote | signed-in, email-verified, not banned; free accounts included; write scope |
| `live:event:<id>` | purchase | signed-in, email-verified, not banned; write scope |
| `live:ticket:<eventId>` | join | active `live:ticket:<eventId>` entitlement backed by an `active` ticket. Membership never implies a ticket. |
| `live:replay:<eventId>` | watch | active `live:replay:<eventId>` entitlement (granted in P2) |
| `asset:<id>` | download | reserved; denied (`not_available`) until the assets domain is specified |
| `operator:<domain>` | manage | live `platform_operators` row with the exact `<domain>:manage` capability, via a session or an MCP delegation carrying `mcp:operator`; API keys never qualify |

Fail closed: a missing user, banned user (ban not expired), revoked operator, unknown resource or a provider error is a deny. Read actions need a read or write scope; mutating actions need a write scope. Sessions carry all member scopes; API keys and delegations carry only what they were issued. Operator scopes are never default scopes, and a valid client token never escalates beyond the user's own current rights.

### Platform operators, approvals and audit

- `platform_operators` grants exact capabilities (`live:manage`, …) independent of `users.role`. There is no wildcard. Existing session-only Builder League admin routes keep their current checks; nothing is loosened.
- Sensitive actions (`live.ticket.refund`, `live.event.cancel`, `live.poll.override`, `operator.grant`, `operator.revoke`) need an `operator_approvals` row: requested by one operator, approved by a **different** operator, bound to `sha256(canonical JSON arguments)`, valid for a short TTL, consumed once by a conditional UPDATE. A replayed, expired, mismatched or self-approved approval changes no rows and the action is refused. The row also stores the canonical JSON arguments (non-personal ids) behind the hash, and `GET /api/v1/live-admin/approvals[/{id}]` shows the approver the action, resource, arguments, reason and requester before they decide.
- Every operator decision, allowed or denied, writes an append-only `operator_audit_logs` row with action, resource, argument hash, approval id and a non-personal summary. Two exceptions keep probing from flooding the table: anonymous denies are not written, and a signed-in non-operator (`not_operator`, `missing_capability`) writes at most one deny row per action per minute. Allows, approval events and every other deny are always written.
- Operator writes call domain services, never arbitrary SQL. Polar stays the source of truth for payments: a manual grant is never recorded as a Polar order.

### Live voting

- Operators curate topic groups and topics and open weekly rounds with `opens_at`/`closes_at` stored in UTC and configured in `Asia/Ho_Chi_Minh`.
- One current vote per account per round (`live_votes` primary key `round_id, user_id`); changing it before close rewrites the row. Votes after close are refused. Per-user rate limits apply.
- Finalizing a closed round freezes `result_snapshot`. Ranking: vote count descending, then the topic whose earliest current vote is earliest, then topic id. An override of the winner needs an approval and is audited.

### Live events and seats

State machine (`lib/live/event-lifecycle.ts`): `draft → scheduled → sales_open → live → ended → archived`, plus `cancelled` from `draft`, `scheduled`, `sales_open` or `live`. Every other transition is refused.

- Opening sales creates `capacity` rows in `live_seats`. A checkout claims one seat with a single conditional `UPDATE … WHERE seat is free OR its hold expired`; SQLite applies it atomically, so concurrent checkouts can never hold or sell more seats than `capacity`.
- Holds last 15 minutes (`LIVE_SEAT_HOLD_MS`). One active hold or ticket per user per event.
- Checkout needs recording consent: buyers accept that the session is recorded and the replay may be sold later.

### Ticket payment

- Polar one-off product per event, checkout bound to the signed-in buyer, metadata `kind=live_ticket`, `eventId`, `reservationId`, `userId`.
- `order.paid` (and paid `order.updated`) → `live_tickets` row keyed by unique `polar_order_id` plus the `live:ticket:<eventId>` entitlement. Duplicate or out-of-order deliveries are no-ops; a refunded order stays refunded and never re-grants.
- If the hold expired and the seat went to someone else, the handler claims any free seat; if none is free, or the buyer has no account, the ticket is stored as `exception` for operator reconciliation (refund through Polar). Paid money never silently disappears and access is never granted without a seat.
- A full refund or event cancellation revokes the ticket and entitlement and frees the seat. Partial refunds keep the ticket.

### Meetings

- `MeetingProvider` interface (`lib/live/meetings/`), Zoom first via Server-to-Server OAuth. Credentials stay server-side (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`). Missing credentials or provider errors fail closed: no join data, an explicit "not ready" state.
- Each attendee is registered individually; the personal join URL is stored encrypted and returned only to the ticket holder from 15 minutes before start until the event ends. Host start URLs and host credentials are never stored or returned.
- Cancelling a ticket cancels the registrant. Google Meet is a later adapter.

### Feature flag

`LIVE_ENABLED` is `"false"` in production and `"true"` on staging. With the flag off, Live pages and member APIs answer 404; operators with `live:manage` can still use operator APIs to prepare events.

## Phases

| Phase | Scope | Where |
|---|---|---|
| P0 | this ADR, `authorize()`, operators, approvals, audit | this repo (#34) |
| P1 | `/live`, voting, events, seats, Polar tickets, Zoom adapter, operator Live API | this repo (#34) |
| P2 | recording ingestion, Stream signed playback, early replay, delayed Courses release (configurable) | follow-up issue |
| P3 | permission-aware APIs and operator services for the other domains | follow-up issue |
| MCP | single endpoint tools/resources/prompts, OAuth 2.1 defaults, operator tools, old-client compatibility | toolkits#19 |

OAuth 2.1 defaults for MCP clients (Authorization Code + PKCE S256, audience binding, refresh rotation, consent) are owned by toolkits#19 and the existing Better Auth MCP OAuth config; this repo only adds the `mcp:operator` delegation scope it verifies.

## Data model

Tables in [`lib/db/live-access-schema.ts`](../lib/db/live-access-schema.ts), migration `drizzle/migrations/0004_live_access.sql` (additive: new tables only). Payment and access stay canonical in `orders` and `entitlements`.

## Consequences

- Every new paid surface reuses `authorize()` instead of adding another ad-hoc check.
- Live access never piggybacks on membership; a VIP still buys a seat (optionally discounted).
- Long-lived API keys of banned users are refused by `authorize()`; the key lifecycle itself remains #16.
