# Review fixes: feat/2-post-checkout-onboarding

Source review: [code-review-261017-1440-onboarding-branch.md](./code-review-261017-1440-onboarding-branch.md). Every in-scope finding is fixed as the owner decided. The five pre-existing out-of-scope issues were left alone. Nothing was pushed.

## Finding to commit and test

| Finding | Commit | Tests |
|---|---|---|
| H1: trusted ownership | `72762af` fix(onboarding): bind Polar customers to users only from trusted ownership | `tests/onboarding-foundation-membership.test.ts`: "never links an existing customer with its own memberships to another user's nlb_user_id" (the attacker case), "trusts nlb_user_id for a customer with history when the email is that user's verified email", "links through nlb_user_id on checkout and order payloads…". `tests/onboarding-status.test.ts`: takeover gives `not_owner`. `tests/onboarding-foundation-checkout.test.ts`: the session email is used and the body email ignored. |
| H2: several customers per user | `72762af` (same commit; migration `0002_onboarding_community` regenerated, now a non-unique `customers_user_id_idx`) | `onboarding-foundation-membership`: "links a second customer of a user who already owns one", "counts every customer a user owns towards the tier". `onboarding-backfill-customer-links`: several customers per user; a customer matched by two users is skipped. `onboarding-status`: binds a second customer. |
| M1: upgrade never starts a second subscription | `d07f84b` fix(onboarding): never start a second subscription from the VIP upgrade | `tests/onboarding-upgrade.test.ts`: `no_membership`, `already_vip` (VIP plus a Premium customer), `past_due`, `no_upgradeable_subscription`. EN and VI copy added. |
| L1: 409 `already_vip` | `d07f84b` | `tests/onboarding-upgrade.test.ts` (`already_vip`) |
| M2: delete the link only on a confirmed revoke | `80180a8` fix(onboarding): serialize unlink with access reconcile and confirm the revoke | `tests/onboarding-status-actions.test.ts`: "keeps the link and surfaces the code when the provider did not confirm the removal", "revokes in the reconcile job before deleting the link" |
| M3: unlink serialized with reconcile; grant guard | `80180a8` (`unlink_requested_at` column; same reconcile dedupe key; `lib/community/grant-guard.ts`; DELETE returns 202 `{unlinking:true}`; the UI polls) | `onboarding-status-actions`: "marks the unlink and queues it on the reconcile key…". `onboarding-discord-adapter`: "never grants to a connection the member unlinked or replaced after it was read". |
| M4: unlinked join requests left alone | `ebc3ab8` fix(onboarding): leave Telegram join requests from unlinked accounts to admins | `tests/onboarding-telegram.test.ts`: "leaves join requests from accounts not linked through NLB to the group admins", "declines join requests only from linked users without a tier" |
| M5: refund rule | `33d1b1e` fix(onboarding): end membership access only on a full refund of the current period | `onboarding-foundation-membership`: "ends access on a full refund of the current period's order…", "restores access when Polar later reports the refunded subscription running again", "keeps access when the refunded order paid for an earlier period or the period is unknown". "tracks past_due, revocation and refunds…" now covers partial, earlier-period, plan-change and no-`created_at` refunds over the webhook. |
| M6: Retry/Rejoin for active members | `f49a9e3` fix(onboarding): let active members rejoin a community they left | `onboarding-status`: `nextActionFor(..., "active")` is `retry`. `onboarding-status-actions`: "lets an active member re-check access to rejoin a community they left". The existing adapter tests cover detection: the Discord re-join on an unknown member, and the Telegram `waiting_for_join` when not in the chat. |
| L2: timeouts and lease renewal | `b040ef2` fix(onboarding): bound provider calls and keep job leases alive across a batch | `onboarding-foundation-queue`: "renews the lease as each job of a batch starts and skips a job another runner re-took", "extends only its own lease". `onboarding-discord-adapter` and `onboarding-telegram`: the `*_timeout` codes and an `AbortSignal` on every call. `onboarding-foundation-membership`: the resync passes `{ timeoutMs: 10_000 }`. |
| L3: 204 already a member | `10a73b6` fix(onboarding): apply Discord roles when the member was already in the guild | `onboarding-discord-adapter`: "adds the roles itself when the member joined on their own before the join call" |
| L4: flag-off D1 writes | `198e39f` docs(onboarding): describe ownership, upgrade, unlink and flag-off behaviour | Documentation only; behaviour unchanged. |
| L5: Discord start redirect | `11d8a2b` fix(onboarding): send non-members back to onboarding from the Discord start link | `onboarding-discord-routes`: "sends users without an effective membership tier back to onboarding with a reason". `onboarding-ui`: the EN/VI key for every Discord error code. |

The docs in `docs/membership-onboarding.md` were updated alongside the M4, M5, M6 and L2 commits and in `198e39f`. That last commit covers ownership, several customers per user, the upgrade refusals, the queued unlink and the flag-off writes.

## Decisions worth knowing

- **Unlink and reconcile are serialized** through a flag on the connection row (`unlink_requested_at`) plus the existing `reconcile_access:{user}:{target}` job. Re-enqueueing overwrites the job payload, so a payload flag would get lost. The row flag is honoured by whichever reconcile runs next. Grants re-check the row right before they mutate anything.
- **Current-period refunds:** a refund counts when the order was created at or after the stored `current_period_start`, less a one-hour clock tolerance. Orders billed with `subscription_update` (mid-period plan-change charges) never end access. So does an order without `created_at`, or a row whose period start is unknown.
- **Clearing `endedAt` after a refund** is limited to rows ended by a local refund (`status = 'refunded'`). It requires a newer `active` or `trialing` Polar state. An ended state reported by Polar itself (revoked or expired) stays terminal, as before.
- The default job lease is now 120 s. It is renewed before each job, and each provider call is capped at 10 s.

## Verification

All four checks were run on `198e39f`:

- `npm run type-check` is clean.
- `npm run lint` reports 0 errors and 80 warnings; all the warnings were there before these changes.
- `npx vitest run --maxWorkers=2`: 97 files passed and 1 was skipped; 990 tests passed and 2 were skipped.
- `npm run build:worker` succeeds (OpenNext worker built).

## Unresolved questions

- One pre-squatting risk remains. Someone could pay first with an email that has never been used and is unverified on NLB; the rule then trusts the new customer's `nlb_user_id`. This depends on email-keyed customer rows, which is out-of-scope pre-existing issue 3.
- The Telegram bot does not subscribe to `chat_member` updates. A member leaving the group is noticed on the next reconcile for that member (Retry/Rejoin or a tier change), not instantly. Subscribing would mean changing the `set-webhook` allowed updates and adding a handler.

## Re-review fixes

Source: [code-review-261017-1543-onboarding-rereview.md](./code-review-261017-1543-onboarding-rereview.md). These commits build on `6a53df1`.

| Finding | Commit | Tests |
|---|---|---|
| N1 (medium): `nlb_user_id` claimed a new customer whose email is another user's verified email | `3ec5425` fix(onboarding): never link a customer to the payer when its email is another user's | `onboarding-foundation-membership`: "links a purchase made with another user's verified email to that user, not the payer". `onboarding-status`: "never binds a checkout paid with another user's verified email to the payer" (the payer gets `not_owner`; the email owner gets the link). |
| N2 (low): a Telegram approval could race an unlink | `6b23b33` fix(onboarding): remove a Telegram account approved while its unlink completed | `onboarding-telegram`: "removes the account again when an unlink lands while the approval is in flight". Covers a deleted link (ban and unban), a pending unlink on an admin (never removed) and an unchanged link (no extra calls). |
| N3 (low): an unlink from an error state showed the stale error and did not poll | `1d9f420` fix(onboarding): show an unlink from an error state as pending until it runs | `onboarding-status`: "shows a pending unlink as processing until a state recorded after the request reports a failure" (tests the `summarizeConnection` mapping). `onboarding-status-actions`: "shows an unlink from an error state as processing until its job reports". |
| N4 (low): the welcome-email send had no time bound | `283b444` fix(onboarding): bound the welcome email send like other provider calls | `onboarding-welcome-email`: "gives up after 10 seconds with a retryable timeout" and "sends once with the idempotency key" |

Docs: `9cdf572` and the N1/N4 commits update `docs/membership-onboarding.md`.

- **N1:** the checkout email is a prefill only. Ownership is enforced when the customer is linked, and another user's verified email always wins.
- **N2 and N3:** the Telegram approval re-check and the display of a pending unlink are described.
- **N4:** Resend is now in the timeout list.

Decisions:

- **N1:** `externalCustomerId` was not added, as the coordinator decided. `customerEmail` stays a prefill.
- **N2:**
  - The removal reuses the adapter's ban-then-unban helper (`removeFromTelegramGroup`) and never touches admins.
  - If the removal fails, it is logged and the webhook still answers 200. Telegram would redeliver the join request, not the removal, and on redelivery the link no longer exists.
- **N3:**
  - No extra write is made. An `action_required` state counts as a failed unlink only when it was recorded at or after `unlink_requested_at`.
  - The polling moved into a shared hook, `components/onboarding/use-unlink-polling.ts`, used by both the account page and the onboarding page; the onboarding page also offers Unlink.
- **N4:**
  - The Resend SDK takes no abort signal, so the send races a 10 s timer.
  - The job runner rethrows the `ProviderError` and keeps its code, `resend_timeout`.

Verification at `9cdf572`:

- `npm run type-check` is clean.
- `npm run lint` reports 0 errors and 80 warnings, the same count as before.
- `npx vitest run --maxWorkers=2`: 98 files passed and 1 was skipped; 997 tests passed and 2 were skipped.
- `npm run build:worker` succeeds.
- The untracked `.claude/agent-memory/` directory was deleted (not committed).

Update to the unresolved questions above: N1 shrinks the pre-squatting residual. What remains is an email that is not a verified NLB account (issue #12). The re-review's own open questions are left for the owner: whether a refund restore can be triggered by Polar's own update, whether support should be paged on `not_owner`, and whether to use a real email lock.
