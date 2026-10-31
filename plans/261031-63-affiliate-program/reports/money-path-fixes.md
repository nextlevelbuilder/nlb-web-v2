# Affiliate money-path fixes

Date: 2026-10-31
Branch: `claude/brave-brown-o01o76`
Scope: every item in the "Fixed in this PR" list of `code-review.md` (C1, C2, H1, H2, H3, H4, M1, M2, M3, M4, M5, M6, L2, L3, L4, L5). The finding codes appear only in this report, not in code, comments or tests.

Nothing was committed or pushed. No dev server was started.

## Outcome

Every listed defect is fixed with single guarded statements or atomic `db.batch` calls. There are no interactive transactions. The ledger is still append-only and keyed by `idempotency_key`, and balances are still sums of ledger entries. Public REST and MCP response shapes are unchanged; the only changes to them are additive.

Verification:

- `npx tsc --noEmit` is clean.
- eslint reports 0 errors.
- The listed vitest suites all pass: 12 files and 156 tests.

## Fixes mapped to invariants

| Finding | Invariant now enforced | Where |
|---|---|---|
| C1 | Refunds are measured against pre-tax net. If an order is fully refunded, the whole commission is reversed even when the refund includes tax. | `refundedNetOf` in `lib/referrals/affiliate-conversions.ts` |
| C2 / H1 | Concurrent partial refunds reverse exactly the target total. One `db.batch` claims the new `refunded_net_minor` with a `<` guard. It then inserts reversal entries per bucket (pending, then held, then available). Each amount is computed in SQL as `max(target - already_reversed, 0)` and capped by the live bucket balance. Keys are `reversal:<conversion>:<target>:<bucket>`, so a retry is a no-op. | `syncRefund` in `affiliate-conversions.ts`, plus `ledgerInsertSelect`, `bucketBalanceSql` and `reversedTotalSql` in `commission-ledger.ts` |
| H2 | Maturation cannot race a refund. A single batch inserts a ledger move of the live pending balance (computed in SQL) and flips the status. Both statements use the same ordered `due` subquery. Hold and release use the same pattern (`transitionWithMove`). | `matureConversions`, `matureDueConversions` and `transitionWithMove` in `affiliate-conversions.ts` |
| H3 | A payout item never exists without its lock. The item insert is guarded by available ≥ gross and by the batch still being a draft. The lock entry selects from the inserted item row in the same batch. A batch that ends up empty is deleted (`nothing_to_pay`), including on error. | `lockPayeeStatements` and `createPayoutBatch` in `lib/referrals/affiliate-payouts.ts` |
| H4 | Mark-paid is atomic. One batch updates the item only while the batch is approved (EXISTS guard), writes `payout_paid` only for a paid item, and closes the batch when no pending items remain. A unique violation returns 409 `conflict`. | `markPayoutItemPaid` |
| M1 | Cancel is atomic. One batch cancels the batch only if no item is paid, bulk-inserts `payout_unlock` for the pending items of the cancelled batch, and then cancels those items. | `cancelPayoutBatch` |
| M2 | Approval rejects a non-draft batch with 409 `invalid_transition` before the approval record is consumed. | `assertBatchApprovable` and `app/api/v1/affiliate-admin/payouts/batches/[id]/approve/route.ts` |
| M3 | An attribution failure never blocks a purchase. `attributeCheckout` catches the error, logs it and returns `{applied:false, reason:"unavailable"}`. A failure in `attachCheckoutId` is caught and logged in the route. | `lib/referrals/affiliate-checkout.ts` and `app/api/checkout/route.ts` |
| M4 | If the explicit code is unknown, inactive or a self-referral, attribution falls back to a valid cookie. Only `ReferralError` is treated as a fallback; other errors propagate to the outer guard. | `resolveCandidate` in `affiliate-checkout.ts` |
| M5 | A period can be recreated after its batch is cancelled. The unique index on period is now partial (`WHERE status != 'cancelled'`). Migration 0005, the schema and the snapshot were edited in place, and `drizzle-kit generate` in a scratch copy reports "No schema changes". An open batch for the same period gets 409 `conflict` from a pre-check. | `drizzle/migrations/0005_affiliate_program.sql`, `meta/0005_snapshot.json` and `lib/db/affiliate-schema.ts` |
| M6 | Preview is read-only and uses grouped queries. Maturation now runs only in cron and in batch creation. | `previewPayouts` |
| L2 | The cron run has a bounded query budget. It runs at most 5 rounds of 200 conversions, each round being one batch of two statements. | `matureDueConversions` and `lib/referrals/referral-cron.ts` |
| L3 | The member ledger hides reasons written by operators (`reason` is null when `actor_user_id` is set). | `listLedger` in `lib/referrals/affiliate-read-models.ts` |
| L4 | Sealed payout details are bound to their affiliate through AES-GCM associated data (`affiliate_payout_method:<id>`). `secret-box` takes an optional third parameter, so this is backward compatible. | `lib/crypto/secret-box.ts` and `affiliate-payouts.ts` |
| L5 | The operator affiliate list uses a fixed number of grouped queries for each chunk of 90 affiliates, not N+1 queries. | `affiliateStandings` in `lib/referrals/affiliates.ts`, plus `affiliateBalancesMany` and `listAffiliatesForOperators` |

Reconciliation gained these checks:

- `negativeBuckets` / `bucketsNonNegative` flags a negative pending, held or payout_locked balance.
- `strandedPending` / `noPendingAfterTransition` flags a non-pending conversion that still holds pending money.

## Design decisions

- **Guarded lock instead of "one open batch".** Locks are guarded per item: available ≥ gross, and the batch must still be a draft. A global single open batch would serialise every period. The per-item guard gives the same no-double-pay guarantee, and the partial index allows one open batch per period. The rationale is recorded in the ADR.
- **Read-only preview.** Preview no longer writes to the ledger, so a GET cannot change balances. Batch creation runs `matureDueConversions` before it snapshots balances.
- **Drizzle on D1 workaround.** `db.run(sql)` with parameters fails inside `db.batch` on the D1 driver. Ledger inserts that compute amounts in SQL therefore use `db.insert(table).select(sql)` through `ledgerInsertSelect`. That function lists every column in definition order and uses an SQL-generated UUID.

## Files modified

- `lib/referrals/commission-ledger.ts`
- `lib/referrals/affiliate-conversions.ts`
- `lib/referrals/referral-cron.ts`
- `lib/referrals/affiliate-payouts.ts`
- `lib/referrals/affiliate-read-models.ts`
- `lib/referrals/affiliates.ts`
- `lib/referrals/affiliate-checkout.ts`
- `lib/crypto/secret-box.ts`
- `lib/db/affiliate-schema.ts`
- `app/api/checkout/route.ts`
- `app/api/v1/affiliate-admin/payouts/batches/[id]/approve/route.ts`
- `drizzle/migrations/0005_affiliate_program.sql`
- `drizzle/migrations/meta/0005_snapshot.json`
- `docs/affiliate-program-adr.md`
- `tests/referrals/affiliate-money-paths.test.ts` (new, 18 tests)
- `tests/referrals/affiliate-ledger.test.ts`
- `tests/referrals/referral-checkout-webhook.test.ts`
- `tests/referrals-api/affiliate-operator-routes.test.ts`
- `tests/referrals-api/affiliate-member-routes.test.ts`
- `tests/referrals-api/referral-api-fixtures.ts` (comment only)

## Tests

All required scenarios are covered:

- a full refund with tax reverses all the commission;
- parallel partial refunds with different targets reverse exactly the right total;
- maturation racing a refund;
- parallel batch creation for two periods locks once;
- an item is never without its lock;
- mark-paid and cancel are atomic;
- cancel, then recreate the same period;
- a checkout attribution error returns 200 with `reason:"unavailable"` (route test);
- an unknown explicit code falls back to the cookie;
- the member ledger omits the operator's reason.

Additional tests:

- reconciliation detects negative buckets and stranded pending money;
- maturing 450 conversions takes at most 10 statements, measured with a counting proxy;
- an AAD mismatch fails to decrypt;
- the operator listing uses grouped queries;
- preview is read-only;
- a second approval of an approved batch gets 409 and is not consumed.

Command:

```
npx vitest run tests/referrals tests/referrals-api tests/mcp-delegation.test.ts \
  tests/onboarding-foundation-checkout.test.ts tests/onboarding-foundation-queue.test.ts
```

Result: 12 files and 156 tests passed. The money-path file was also run 3 times in a row and passed each time.

`build:packages` was not run because `packages/contracts` did not change. The ledger `reason` field was already nullable, and the reconciliation response is an open object.

## Concerns

1. **Payout batch creation at scale.** Each payee costs 2 statements, sent in chunks of 25 payees per batch. At more than about 450 payees, one invocation could approach D1's limit of 1000 queries. Splitting creation across invocations would need a resumable draft state.
2. **System hold reasons are still visible to members.** Only reasons written by an actor are hidden. System codes such as `discount_mismatch` still appear in the member ledger. This is intentional (they are codes, not operator notes), but it is a product decision.
3. **Approval TOCTOU.** The draft check runs in the approval `prepare` step. A cancel that lands between `prepare` and `run` could still consume an approval. Money stays safe, because mark-paid requires an approved batch and cancel refuses once any item is paid. The cost is a wasted approval record.
4. **AAD and existing data.** Binding with AAD assumes that no sealed payout details exist yet. That holds because migration 0005 has never been deployed.

## Unresolved questions

- Should system hold-reason codes also be hidden from members, or mapped to member-friendly text?
- Is a resumable, multi-invocation batch creation needed before payee counts approach about 450 per period?

Status: DONE_WITH_CONCERNS
Summary: All listed money-path defects are fixed with atomic D1 batches and SQL-computed ledger amounts, with tests covering every required scenario; tsc, eslint and the 156 affected tests pass. The remaining concerns are payout-creation scaling beyond about 450 payees, system hold codes that members can still see, and a benign approval TOCTOU.
