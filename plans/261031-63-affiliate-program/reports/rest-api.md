# REST API (phase 2) report

Status: done. Contract table implemented as written; additive extras are listed under
"Contract changes" in ../plan.md (affiliate-admin approval request/read/decision routes).

## Files
- Member routes: `app/api/v1/affiliates/{program,me,preview,links,links/[id],conversions,commissions,payouts,payout-method}/route.ts`
- Operator routes: `app/api/v1/affiliate-admin/{rules,rules/preview,affiliates,affiliates/[id]/{suspend,reinstate},conversions,conversions/[id]/{hold,release},payouts/preview,payouts/batches,payouts/batches/[id],payouts/batches/[id]/{approve,cancel},payouts/items/[id]/{mark-paid,details},ledger/adjustments,reconciliation,approvals,approvals/[id],approvals/[id]/decision}/route.ts`
- HTTP plumbing: `lib/referrals/http/referral-http-errors.ts` (`withReferralErrors`, `session_required`),
  `referral-request-context.ts` (flag gate, caller, session-only check, origin), `affiliate-operator-route.ts`
  (`runAffiliateOperatorRoute`, domain `affiliate`, optional `sessionOnly`), `affiliate-operator-schemas.ts`,
  `affiliate-member-schemas.ts`, `affiliate-sensitive-targets.ts` (approval-bound resource/args).
- OpenAPI: `lib/referrals/openapi.ts`; `lib/openapi.ts` merges it behind `PUBLISH_AFFILIATE_OPENAPI = false`.
- Domain additions: `listAffiliates`, `setAffiliateStatus` (affiliates.ts); operator views, batch views and
  `findPayoutItemWithMethod` (affiliate-read-models.ts).
- Tests: `tests/referrals-api/{referral-api-fixtures.ts,affiliate-member-routes.test.ts,affiliate-operator-routes.test.ts,affiliate-openapi.test.ts}`.

## Verification
- `vitest run tests/referrals tests/referrals-api tests/live-api tests/api-docs.test.ts`: 12 files, 88 tests pass.
- `eslint` on the owned paths: clean.
- `tsc --noEmit`: one error, in `tests/referrals/referral-redirect.test.ts:41` from commit 30d86ec (not
  owned by this phase); fix is typing the header list as `Record<string, string>[]`.
