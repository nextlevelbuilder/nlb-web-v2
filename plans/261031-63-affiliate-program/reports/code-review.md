# Code review — affiliate program (branch `claude/brave-brown-o01o76` vs `origin/dev`)

The review ran in a separate agent context. It focused on 8 referral test files (58 tests), all of which pass. Throwaway probes reproduced C1, C2 and H1 against an in-memory D1.

## Passing

- Authorization:
  - Member routes are owner-scoped.
  - Payout-method routes and mark-paid are session-only.
  - Operator routes are restricted to the `affiliate` domain.
  - Sensitive actions require a two-person approval bound to the arguments hash.
- MCP surface: there are no tools for payout details, mark-paid, rules publish, adjustments or approvals.
- Privacy:
  - Payout details are sealed with AES-GCM.
  - Redirects honour DNT and GPC.
  - Destinations are allowlisted.
- Flag gating covers all public surfaces, and OpenAPI changes are additive only.

## Findings

### Critical

| ID | Finding | Location |
|---|---|---|
| C1 | A full refund of a taxed order leaves part of the commission in place. The code subtracts `refunded_tax_amount` from `refunded_amount`, but Polar's `refunded_amount` is already pre-tax. | `affiliate-conversions.ts:165` |
| C2 | Concurrent refund events with different cumulative targets both insert a reversal, because they get different idempotency keys. The result over-reverses. | `affiliate-conversions.ts:166-186` |

### High

| ID | Finding | Location |
|---|---|---|
| H1 | Two batches created in parallel for different periods both lock the same `available` balance, so it is paid twice. | `affiliate-payouts.ts:239-289` |
| H2 | The payout item insert and its ledger lock are separate statements, so a partial failure can lead to double payment. | `affiliate-payouts.ts:261-288` |
| H3 | Maturation can race a refund and leave `pending` negative while `available` keeps the refunded commission. | `affiliate-conversions.ts:207-225` |
| H4 | The cron can issue about 3000 queries per run, over D1's limit of 1000 queries per invocation. Its claim-then-move ordering can strand funds in `pending`. | `referral-cron.ts`, `affiliate-conversions.ts` |

### Medium

| ID | Finding | Location |
|---|---|---|
| M1 | A Polar discount or DB error during attribution blocks the purchase. | `affiliate-checkout.ts`, `app/api/checkout/route.ts` |
| M2 | Mark-paid and cancel do not write the item state and its ledger entry atomically. | `affiliate-payouts.ts` |
| M3 | The operator's hold reason leaks to the affiliate through the member ledger view. | `affiliate-read-models.ts:140` |
| M4 | An unknown explicit `?ref=` overrides a valid attribution cookie. | `affiliate-checkout.ts:144-146` |
| M5 | A cancelled batch permanently blocks its period, because the unique index covers every status. | migration 0005 |
| M6 | Operator reads (affiliate list, payout preview) issue N+1 queries. | `affiliate-read-models.ts`, `affiliate-payouts.ts` |
| M7 | Affiliate wording in terms, privacy, cookies and refund is published while the flag is off. | `content/policies/*` |

### Low

| ID | Finding |
|---|---|
| L1 | The policy sidebar is rendered at build time. |
| L2 | Payout preview runs maturation, so a GET request writes data. |
| L3 | The approval is consumed before the batch state is checked. |
| L4 | Cancel can race mark-paid. |
| L5 | The AES-GCM ciphertext is not bound to its row with AAD. |
| L6 | Agents can accept the Agreement through MCP. |

## Triage by the controller

- **Fixed in this PR:** C1, C2, H1, H2, H3, H4, M1, M2, M3, M4, M5, M6, L2, L3, L4 and L5 (see the fix commit).
- **Rejected:**
  - L1. The build output marks `/[locale]/policies` and `/[locale]/policies/[slug]` as `ƒ` (server-rendered on demand), so `publishedPolicySlugs()` runs per request.
  - M7. Launch gate 1 in the ADR requires legal review before `AFFILIATES_ENABLED` is turned on, not before the notices are published. The notices describe a program and disclose cookies that are not active yet. All of these policies already carry "legal review pending".
- **Deferred to the launch gates (#65):** L6. Accepting the Agreement through an agent is a product and legal decision. MCP `affiliate_join` requires an explicit `termsVersion`.
