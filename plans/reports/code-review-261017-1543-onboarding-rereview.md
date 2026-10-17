# Re-review: `feat/2-post-checkout-onboarding` after the review fixes (3c15480..198e39f)

Date: 2026-10-17 (Asia/Saigon) · Issue: nextlevelbuilder/nlb-web-v2#2 · Reviewer: independent code review (read-only)

## Scope

- **Diff reviewed:** `git diff 3c15480..198e39f`, 42 files, +934/-258. All non-test changes were read in full.
- **Context files read:**
  - `lib/onboarding/{status,jobs,runner}.ts`
  - `lib/community/{reconcile,discord-adapter,telegram-adapter,telegram-webhook,telegram-onboarding,discord-oauth}.ts`
  - The Discord start and callback routes
  - `lib/membership/{member-access,subscription-sync,polar-resync}.ts`
  - The Polar webhook handlers, `lib/polar.ts` (`createCheckoutSession`) and the account and onboarding components
- **Checks run:**
  - **Focused tests:** `npx vitest run` with `--maxWorkers=1` on 5 files (`onboarding-foundation-membership`, `onboarding-status-actions`, `onboarding-foundation-queue`, `onboarding-upgrade`, `onboarding-discord-adapter`): 81/81 pass.
  - **Migration drift:** `drizzle-kit generate` ran against a scratch copy of `drizzle/migrations` with the current `lib/db/schema.ts`. It reported "No schema changes, nothing to migrate", so the regenerated 0002 SQL, `0002_snapshot.json` and `_journal.json` match the schema. The worktree was left untouched.
  - **i18n:** EN/VI key parity for the `onboarding` and `accountMembership` namespaces: identical.
- **Not run:** the full suite, lint, type-check and build. The fix report says all four pass at 198e39f; I did not repeat them.

## Verdict on previous findings

| ID | Verdict | Evidence |
|---|---|---|
| H1 metadata takeover of an existing customer | **Fixed** for the reported scenario | `lib/membership/member-access.ts:101-114`: `canLinkFromMetadata` trusts `nlb_user_id` only when the email equals the user's verified email or the customer has no other purchase. `hasOtherPurchases` at `:82-91` excludes only this purchase's ids; both id columns are `NOT NULL`, so the `NOT IN` is sound. The webhook (`app/api/webhooks/polar/route.ts:357,406,523`) and `verifyCheckout` (`lib/onboarding/status.ts:232-238`) both use it. The session email is used at `app/api/checkout/route.ts:75-87`. **See N1** for a remaining variant and for the email "lock" not being enforced by Polar. |
| H2 several customers per user | **Fixed** | Non-unique index at `lib/db/schema.ts:32` and `drizzle/migrations/0002_onboarding_community.sql:75`. The unique-swallow is gone in `linkCustomerToUser` (`member-access.ts:60-70`). The backfill no longer refuses users who already own a customer (`scripts/onboarding/backfill-customer-links-sql.ts`). `getLinkedSubscriptions` joins every owned customer. No other code assumes one customer per user (grep for `customers.userId`). |
| M1 upgrade 409 fallback double subscription | **Fixed** | `status.ts:560-577` returns `no_membership` / `already_vip` / `past_due` / `no_upgradeable_subscription`. The client starts a checkout only on `no_membership` (`components/onboarding/membership-upgrade-button.tsx:53`). |
| M2 unlink deletes the link on a failed revoke | **Fixed** | The row is deleted only on `revoked`/`not_connected` while `unlink_requested_at` is still set (`lib/community/reconcile.ts:90-95`). `action_required` keeps the row. |
| M3 unlink races reconcile | **Fixed** for Discord; **Telegram residual, see N2** | Unlink only marks the row and enqueues on the same dedupe key (`status.ts:607-621`). `enqueueJob` keeps a running job's lease (`lib/onboarding/jobs.ts:29-60`), so the unlink run waits for any in-flight reconcile. `assertConnectionGrantable` runs before Discord grants (`lib/community/discord-adapter.ts:78,87`). The Telegram approval runs in the webhook, outside the job. |
| M4 Telegram declines unlinked join requests | **Fixed** (owner decision) | `lib/community/telegram-webhook.ts:129` returns `ignored` when no connection exists. Linked accounts with a pending unlink are declined (`:130`). |
| M5 refund of any order ends access for good | **Fixed** | `subscription_update` charges and orders without `created_at` are skipped (`route.ts:470-475`). The current-period guard is at `lib/membership/subscription-sync.ts:178-183`. A refunded row is restored only by a newer Polar `active`/`trialing` state (`:41-49,62`). See the unresolved question on the restore trigger. |
| M6 no recovery after leaving | **Fixed** (Telegram leave is noticed only on re-check, accepted) | `nextActionFor` maps `active` to `retry` (`status.ts:295`). The button reads "Rejoin or re-check" (`community-connection-card.tsx:186`). |
| L1 API upgrade with an effective VIP | **Fixed** | `status.ts:563-565` |
| L2 lease expiry and unbounded provider calls | **Partially fixed** | Lease renewal per job is at `jobs.ts:134-146` and `lib/onboarding/runner.ts:127-133`. The lease is 120 s. Discord, Telegram and admin-notify fetches use `AbortSignal.timeout(10_000)`. The Polar resync passes `timeoutMs`. **Not bounded:** the welcome-email job's `resend.emails.send` (`lib/email-onboarding-welcome.ts:61`) has no timeout. See N4. |
| L3 Discord 204 already-member | **Fixed** | `lib/community/discord-api.ts:203`, `discord-adapter.ts:80-82` |
| L4 flag-off D1 writes | **Accepted and documented** | `docs/membership-onboarding.md:5`. Flag-off checkout arguments are unchanged: `caller ? caller.user.email : customerEmail` with no options (`route.ts:75,87-91`). |
| L5 Discord start returns raw JSON | **Fixed** | `app/api/onboarding/discord/start/route.ts:40` redirects with `membership_required`. The code is in `DISCORD_ERROR_CODES` and in EN/VI copy, and is rendered in the no-membership panel. The flag-off 404 is still JSON, but no link is rendered when the flag is off. |

## New or remaining findings

### N1 (Medium): `nlb_user_id` still takes over a fresh customer whose email belongs to another verified NLB user, and the email lock is not enforced by Polar

This is a worse variant of the accepted pre-squatting risk. The accepted risk covers emails that are *not* verified on NLB. This one targets an email that is already a verified NLB account.

- **Where:**
  - `lib/membership/member-access.ts:110-114`
  - `lib/polar.ts:174-185` (`customerEmail` passed as a prefill only)
  - `app/api/checkout/route.ts:83`
- **Why the lock does not hold:** the server now sends the session email as `customerEmail`. Polar documents a locked email field only when the checkout carries `customer_id` or `external_customer_id`. A plain `customer_email` is a prefill that the buyer can edit on the Polar page ([Polar: disable email editing in checkout](https://polar.sh/docs/guides/disable-email-editing-in-checkout)).
- **Failure scenario:**
  1. Attacker A is signed in. A knows that B has a verified NLB account but has never bought anything.
  2. A starts a Premium checkout, changes the email on the Polar page to B's address, and pays.
  3. `ensureCustomer` creates a new row keyed by B's email. `canLinkFromMetadata(A)` finds that the email is not A's, but `hasOtherPurchases` is false, so it returns true. The row is linked to A.
     - The verified-email fallback (`findVerifiedUserIdByEmail`, which would return B) is never consulted, because the metadata branch wins first (`linkCustomerFromPurchase`, `member-access.ts:122-133`).
  4. B later buys a membership with their own email. Polar reuses the customer for that email, and locally it is the same email-keyed row, already owned by A.
- **Impact:**
  - B's subscription grants A. B's `verifyCheckout` returns `not_owner`.
  - B cannot self-recover: `findLinkableCustomerForUser` requires the row to be unlinked or already B's.
  - Cost to A: one Premium payment.
- **Fix:**
  - In `canLinkFromMetadata`, return false when `findVerifiedUserIdByEmail(customer.email)` resolves to a user other than `userId`. The fallback then links B. This narrows the residual to the accepted case.
  - To make the decision "signed-in membership checkout locks the email" true, pass `externalCustomerId: userId` only when no local customer row is linked to the user. Alternatively, record the decision as prefill-only.
- **Test gap:** a new customer row whose email is another user's verified email, receiving a purchase that carries `nlb_user_id = A`.

### N2 (Low): a Telegram approval can land after an unlink completed, leaving an untracked account in the group

- **Where:** `lib/community/telegram-webhook.ts:128-135`, `lib/community/reconcile.ts:90-95`
- **Failure scenario:**
  1. `handleJoinRequest` reads the connection before `unlink_requested_at` is set, then calls `approveChatJoinRequest`.
  2. In between, the unlink job runs. The account is not yet in the chat, so the adapter returns `revoked`, and the row is deleted.
  3. The approval then admits the account.
  4. The follow-up reconcile finds no connection and records `not_connected`. Nothing ever removes the account. The member can then link a second Telegram account.
- **Likelihood:** the window is one D1 read plus one Bot API call, so it is hard to hit by hand. It is the Telegram counterpart of M3, which the job serialization closes only for Discord.
- **Fix:** after a successful approve, re-read the connection by Telegram id. If it is gone or unlinking, ban and unban immediately (or enqueue a revoke keyed by Telegram user id). Alternatively, have the unlink job keep the row as a tombstone until no approval for that account is in flight.

### N3 (Low): an unlink requested while the access state is already `action_required` reports failure immediately and stops polling

- **Where:**
  - `lib/onboarding/status.ts:328-332`
  - `components/onboarding/community-connection-card.tsx:153,174`
  - `components/onboarding/account-community-panel.tsx:30-31`
- **Failure scenario:**
  1. A member's Discord state is `action_required`, for example `discord_reauth` after the authorization expired.
  2. They press Unlink, the common way out of that state.
  3. The summary keeps the stale `action_required` status. The card immediately shows "Could not remove your Discord access (discord_reauth)", although the job has not run yet. The Discord revoke uses the bot token and would succeed.
  4. `pendingUnlink` excludes `action_required`, so the 3-second polling never starts. If the single 4-second refresh happens before the job finishes, the error stays on screen until a manual reload.
- **Fix:** when marking the unlink, reset `community_access_state.status` for that target to `processing` and clear `error_code` (same transaction as the mark). Alternatively, treat `action_required` as an unlink failure only when `state.updatedAt > unlinkRequestedAt`.

### N4 (Low): the welcome-email job still has no time bound

- **Where:** `lib/email-onboarding-welcome.ts:61`
- **Problem:** `resend.emails.send` has no abort or timeout. The fix report says "each provider call is capped at 10 s", but this call is not.
- **Effect:**
  - A stalled call holds the batch until the Worker limit.
  - Later claims in the batch are then re-taken and reported as `lost`. That part is handled correctly.
  - A duplicate welcome send would rely only on Resend's 24-hour idempotency key, as before.
- **Fix:** wrap the call in `Promise.race` with a 10 s timer that throws a retryable `ProviderError("resend_timeout")`, or use a fetch-based send with `AbortSignal.timeout`.

## Fix diff: other checks with no defect found

- **Migration 0002:**
  - It is additive only: `CREATE TABLE`, `ALTER TABLE ... ADD` and a non-unique `CREATE INDEX`.
  - The snapshot `id` changed and `prevId` still chains to 0001. The journal `when` was updated.
  - No drift against the schema.
  - The branch has not reached `dev`/staging yet (plan.md:14), so editing 0002 in place is safe. Note that a developer's local D1 that already applied the old 0002 will lack `unlink_requested_at`; they need to reset their local state.
- **Job lease:**
  - `renewJobLease` is conditional on the claim's `locked_until`. A re-taken job is skipped and counted as `lost`.
  - `completeJob`/`failJob` use the renewed lease.
  - Re-enqueue during a run keeps the lease and releases it on completion, so the next run follows the current one serially.
  - The 120 s lease covers the worst-case Discord converge (about 8 calls of at most 10 s each).
- **Reconcile with unlink:**
  - Desired tier `none` while unlinking.
  - The delete is guarded by `unlink_requested_at IS NOT NULL`.
  - The retryable grant-guard error re-queues correctly.
  - Same-account re-link during an unlink does not clear the flag, so the unlink still completes. A different account is refused with `discord_in_use`.
- **Flag off:** checkout arguments are unchanged, and `/api/onboarding/*` and the cron remain no-ops.
- **i18n:** all 8 new keys exist in both EN and VI.

## Accepted residuals (not re-reported)

- Pre-squatting with an email that is not on NLB (issue #12).
- Telegram leave detection only on re-check.
- Unlinked accounts' join requests, including those through a still-valid `nlb-` invite link (24 h, no member limit), are left to the group admins (owner decision).

## Unresolved questions

1. **Refund restore trigger.** After a full current-period refund, any later Polar `subscription.updated` with an `active` status and a newer `modified_at` restores access (`resumedAfterRefund`). If Polar emits such an update as part of the refund itself (for example when it records the refund on the subscription), access would come back at once. Can someone confirm this against a sandbox refund during the staging smoke test?
2. **Legitimate buyer marked `not_owner`.** A signed-in buyer who edits the Polar email to a work address that already has local purchase history (an older toolkit or directory order) now gets `not_owner`. The paid membership stays unlinked, and no `admin_notify` is sent. This follows the owner's trust rule, but should it page support instead of silently showing "not owner"?
3. **Email lock vs prefill.** Should the "email locked to session" decision become a real lock (`external_customer_id`), or be recorded as prefill-only (see N1)?
