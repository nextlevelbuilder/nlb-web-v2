# Affiliate program P1 (issue #63)

Status: in progress · Branch `claude/brave-brown-o01o76` · Companion: nlb-directory-toolkits `claude/stoic-gates-o01o76`

## Outcome
Members join a tiered affiliate program, create links with a buyer discount inside an incentive
budget, earn commission on first membership purchases, and get paid through audited batches.
Member and finance-operator reads/previews are available through REST, MCP and CLI.

## Constraints
- Additive `/api/v1` and OpenAPI only. Flags: `AFFILIATES_ENABLED` (member/public surfaces 404 when
  off; prod false, staging true) and `AFFILIATE_PAYOUTS_ENABLED` (mark-paid; false everywhere until
  legal+finance sign-off).
- Money integer minor units; rates integer bps. Ledger append-only.
- MCP/API keys never see or set payout details, never mark paid, never publish rules, adjust
  balances or approve batches (sensitive two-person actions are session-only for the second step).

## Done (phase 1: domain) — commit 241aa7b
`lib/referrals/*`, `lib/db/affiliate-schema.ts`, migration 0005, checkout + webhook integration,
`/r/[code]`, cron maturation, `tests/referrals/*` (30 tests).

## Phase 2 contract: REST (owner: REST agent)
Envelope: `{ data }` via `ok()`, errors `{ error: { code, message } }` via `fail()` (lib/builder-league/http.ts).
`ReferralError` keeps status+code.

Member — `/api/v1/affiliates` (404 `not_found` while flag off, except nothing). Caller = session,
API key, or MCP delegation (`mcp:read` for GET, `mcp:write` for writes). Session writes need the
same-site check. Owner-only: every query is bound to the caller's affiliate.

| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | /api/v1/affiliates/program | – (public) | programView |
| GET | /api/v1/affiliates/me | – | affiliateSummary; 404 `not_enrolled` |
| POST | /api/v1/affiliates/me | `{ termsVersion }` | 201 affiliateSummary |
| GET | /api/v1/affiliates/preview | `discountBps`, `priceMinor?` | `{ budgetBps, discountBps, commissionBps, withinBudget, example? }` |
| GET | /api/v1/affiliates/links | – | `{ links: linkView[] }` |
| POST | /api/v1/affiliates/links | `{ code?, label?, discountBps?, destinationPath?, utmCampaign? }` | 201 linkView |
| PATCH | /api/v1/affiliates/links/{id} | `{ label?, discountBps?, destinationPath?, utmCampaign?, status?, expectedVersion? }` | linkView |
| GET | /api/v1/affiliates/conversions | `limit?` | `{ conversions }` |
| GET | /api/v1/affiliates/commissions | `limit?` | `{ balances, ledger }` |
| GET | /api/v1/affiliates/payouts | – | `{ payouts }` |
| GET/PUT | /api/v1/affiliates/payout-method | PayoutMethodInput | payoutMethodView — **session only** (403 `session_required` for API key/MCP) |

Operator — `/api/v1/affiliate-admin` via the `runOperatorRoute` pattern, domain `affiliate`
(works whatever the flag says; MCP needs `mcp:operator`).

| Method | Path | Notes |
|---|---|---|
| GET | rules | active version + rules |
| POST | rules/preview | validate a rules doc, return levels/budget table; no write |
| POST | rules | publish (sensitive `affiliate.rules.publish`, approvalId) |
| GET | affiliates | list with summary (status filter) |
| POST | affiliates/{id}/suspend, affiliates/{id}/reinstate | reason required |
| GET | conversions | `status?` filter |
| POST | conversions/{id}/hold, conversions/{id}/release | |
| GET | payouts/preview | `period=YYYY-MM` |
| GET/POST | payouts/batches | create = lock funds |
| GET | payouts/batches/{id} | batch + items |
| POST | payouts/batches/{id}/approve | sensitive `affiliate.payout.approve` |
| POST | payouts/batches/{id}/cancel | |
| POST | payouts/items/{id}/mark-paid | session only; flag-gated |
| GET | payouts/items/{id}/details | reveal payee details; session only; audited |
| POST | ledger/adjustments | sensitive `affiliate.ledger.adjust` |
| GET | reconciliation | `since?`, `until?` |
| GET | approvals | pending approvals for affiliate actions |

## Phase 3: MCP / CLI / contracts (owner: MCP agent)
Member tools (`affiliate_*`) mirror member GET/POST/PATCH except payout-method. Operator tools
(`affiliate_admin_*`, `mcp:operator`): reads, previews, hold/release, create/cancel batch,
reconciliation. No tool takes bank/ID data, marks paid, reveals details, publishes rules, adjusts or approves.

## Phase 4: UI, policies, discovery (owner: UI agent)
`/[locale]/account/referrals`, public `/[locale]/affiliates`, Affiliate Agreement policy (EN/VI,
version 2026-10-31, pending legal review), terms/privacy/refund/cookies mentions, checkout passes `?ref`.

## Phase 5: docs, review, ship (controller)
ADR `docs/affiliate-program-adr.md`, docs updates, isolated review, PR to `dev`.

## Acceptance
Unit+route tests green; tsc/lint/build green; screenshots at 1440/768/375/320; review findings fixed.

## Contract changes (REST agent)
Additive only; no listed path or field was renamed.
- Operators need to request and decide the two-person approvals the sensitive routes consume, so the
  affiliate-admin approvals surface mirrors Live: `POST approvals` (`{ action, target, reason, ttlMinutes? }`;
  targets: `affiliate.rules.publish` → `{ rules, note? }`, `affiliate.payout.approve` → `{ batchId }`,
  `affiliate.ledger.adjust` → `{ affiliateId, amountMinor, reason }`), `GET approvals/{id}`,
  `POST approvals/{id}/decision` (`{ decision: "approve" | "reject" }`). `GET approvals` takes `status?`
  (default `pending`), `cursor?`, `limit?`.
- Sensitive bodies: rules publish `{ rules, note?, approvalId }`; batch approve `{ approvalId }`;
  ledger adjustment `{ affiliateId, amountMinor, reason, approvalId }` (ledger key `adjustment:<approvalId>`).
- Operator list reads wrap arrays: `{ affiliates }`, `{ conversions }`, `{ batches }`; batch create/read
  return the batch with `totals` and `items`. Suspend/reinstate/hold take `{ reason }` (3-300 chars).
- `GET /affiliates/preview` returns `example` only when `priceMinor` is given and the discount is within budget.
