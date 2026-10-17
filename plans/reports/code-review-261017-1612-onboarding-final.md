# Final review: `feat/2-post-checkout-onboarding` re-review fixes (6a53df1..70531a9)

Date: 2026-10-17 (Asia/Saigon) · Issue: nextlevelbuilder/nlb-web-v2#2 · Reviewer: independent code review (read-only)

## Scope

- **Diff reviewed:** `git diff 6a53df1..70531a9`. It has 6 commits and 17 files (+368/-56). I read every non-test change in full, and read the test changes for N1–N4.
- **Context files read:**
  - `lib/membership/member-access.ts`
  - `lib/community/{reconcile,telegram-webhook,telegram-adapter,telegram-api,types}.ts`
  - `lib/onboarding/{status,runner}.ts`
  - `app/api/onboarding/{status,retry}/route.ts`
  - `components/onboarding/{onboarding-flow,account-community-panel,community-connection-card,use-unlink-polling,onboarding-api}.tsx/ts`
  - `docs/membership-onboarding.md`
- **Checks run:** `npx vitest run --maxWorkers=1` on `onboarding-status`, `onboarding-telegram`, `onboarding-welcome-email`, `onboarding-foundation-membership` and `onboarding-status-actions`: 5 files, 80/80 pass.
- **Not run:** the full suite, lint, type-check and build. The fix report says they pass at `9cdf572`. The diff after that commit is docs only.
- **Owner decisions applied:**
  - `customerEmail` is a prefill only.
  - Ownership is checked at link time.
  - Another user's verified email always wins.
  - Join requests from unlinked Telegram accounts are left to the group admins.

## Verdict on N1–N4

| ID | Verdict | Evidence |
|---|---|---|
| N1 `nlb_user_id` taking over a new customer whose email is another user's verified email | **Fixed** | `lib/membership/member-access.ts:116-117`: `canLinkFromMetadata` returns false when `findVerifiedUserIdByEmail(customer.email)` is a different user. `linkCustomerFromPurchase` (`:132-139`) then falls through to the verified-email owner. Both entry points share it: the webhook (`app/api/webhooks/polar/route.ts:334`) and `verifyCheckout` (`lib/onboarding/status.ts:233-238`, which returns `not_owner` to the payer). The checkout comment (`app/api/checkout/route.ts:71-75`) and the docs (`docs/membership-onboarding.md:10-11`) now say "prefill". Tests: `tests/onboarding-foundation-membership.test.ts:432-445` (owner linked, payer gets nothing, no payer reconcile job) and the `onboarding-status` not_owner case. The payer's own verified email is still checked first (`:115`), so a legitimate buyer is not affected. |
| N2 Telegram approval racing an unlink | **Fixed** (residual noted in I2) | `lib/community/telegram-webhook.ts:145,152-172`: after an approve, the code re-reads the connection by id. If the row is gone, now holds a different Telegram id, or has `unlink_requested_at` set, `removeFromTelegramGroup` (`lib/community/telegram-adapter.ts:27-43`) checks membership, skips admins, and bans then unbans. Every interleaving I traced ends with the account removed: unlink before or after the re-read, and the unlink job deleting the row before or after the approve. In the last cases the job's own `getChatMember` sees the account in the chat and removes it. Test: `tests/onboarding-telegram.test.ts:305-345` covers a deleted link, a pending unlink on an admin, and an unchanged link with no extra calls. |
| N3 unlink from an `action_required` state showing a stale failure and not polling | **Fixed** | `lib/onboarding/status.ts:310-333`: `summarizeConnection` treats `action_required` as an unlink failure only when `state.updatedAt >= unlinkRequestedAt`. Otherwise the status is `processing` with `nextAction: "none"` and no `errorCode`. Both timestamps are `timestamp_ms` (`lib/db/schema.ts:780,802`). Only `reconcile.ts:28` writes `community_access_state`. `unlink_requested_at` is set with `coalesce` (`status.ts:639`), so a repeated request keeps the first timestamp. `useUnlinkPolling` (`components/onboarding/use-unlink-polling.ts:18-30`) now polls on both the account page and the onboarding page (`onboarding-flow.tsx:157`). The `load` callback is stable (`useCallback([checkoutId])`, `onboarding-flow.tsx:73-83`), so the effect does not reset its 40-poll cap on each render. The interval is cleared on unmount and when the unlink is no longer pending. Test: `tests/onboarding-status-actions.test.ts:144-158`. |
| N4 welcome email with no time bound | **Fixed** | `lib/email-onboarding-welcome.ts:64-84`: `Promise.race` against a 10 s timer that rejects with a retryable `ProviderError("resend_timeout")`. The timer is cleared in `finally`. `lib/onboarding/runner.ts:54-56` rethrows a `ProviderError` as is, so the job keeps the code and backs off. Duplicate delivery is still covered by the Resend idempotency key (`nlb-onboarding-welcome-${subscriptionId}`). Test: `tests/onboarding-welcome-email.test.ts:31-39`, using fake timers. |

## New defects introduced by this diff

No new Critical, High or Medium defects. No new Low defects that need a fix before merge. The items below are informational (Info): edge cases with low likelihood, or cases that recover on their own. None is a regression from 6a53df1.

### I1 (Info): the Telegram post-approval check is keyed by connection id, so a re-link in the same window removes an entitled account once

- **Where:** `lib/community/telegram-webhook.ts:159-164`
- **Scenario:**
  1. The unlink job deletes the row.
  2. The same Telegram account is re-linked (a new row and a new id) while an approval for that account is in flight.
  3. `current` is then `undefined`, and the account is removed although the new link is entitled.
- **Recovery:** the follow-up reconcile records `waiting_for_join`, and the card offers the join link again.
- **Likelihood:** this needs an unlink to complete, a fresh `/start` link and a pending join request, all within one Bot API round trip. Accept as is. A stricter check would re-read by Telegram id (`findTelegramConnectionByTelegramId`) and keep the member when that row is entitled and not unlinking.

### I2 (Info): if the post-approval removal itself fails, the original N2 outcome remains, with only a log line

- **Where:** `lib/community/telegram-webhook.ts:165-171`
- **Scenario:**
  1. The approve races an unlink, and the row is gone.
  2. `removeFromTelegramGroup` then hits a Telegram timeout or 5xx.
  3. The error is logged and the webhook answers 200.
- **Why it is not recovered:** the code comment is correct that a retry would not help. The redelivered join request finds no connection and returns `ignored`. Nothing durable records the account, so it stays in the group untracked.
- **Likelihood:** this is a double fault (the race plus a Telegram failure). It is acceptable for launch.
- **Durable fix, if wanted later:** enqueue an `admin_notify` with the Telegram id when the removal fails, so a human removes the account.

### I3 (Info): an unlink run that started before the request can hide its own failure until the re-armed run

- **Where:** `lib/community/reconcile.ts:48-60,97` together with `lib/onboarding/status.ts:320-321`
- **Scenario:**
  1. `reconcileCommunityAccess` captures `now` before it reads the connection.
  2. A reconcile that was already running at T0 reads the row after the unlink at T1, so it acts as the unlink and gets `action_required`.
  3. It records `updatedAt = T0 < T1`, so the card shows "processing" with no Retry button.
- **Recovery:** the unlink re-armed the same dedupe key while that job was running, so the next run writes a fresh state at or after T1. The failure then appears. The only cost is a short delay.
- **Optional fix:** take `now` after the connection read, or compare against the connection's `updatedAt`.

### I4 (Info): Retry on a failed unlink keeps showing the old failure and does not start polling

- **Where:** `components/onboarding/community-connection-card.tsx:89-94,153` and `use-unlink-polling.ts:18-20`
- **Behaviour:** after a failed unlink (state at or after `unlinkRequestedAt`), Retry enqueues the job, but the state row is unchanged. The card keeps the failure text and refreshes only through `refreshSoon` (once immediately, once at 4 s).
- **Why it is not counted as new:** this matches the generic Retry behaviour and existed before the diff. N3's fix covers the first unlink, not the retry.

### I5 (Info): when the timeout wins in the welcome email, the losing Resend promise is left without a handler

- **Where:** `lib/email-onboarding-welcome.ts:71-77`
- **Behaviour:** if the stalled `resend.emails.send` later rejects (the SDK normally resolves with `{ error }`), the Worker logs an unhandled rejection. Nothing breaks.
- **Optional fix:** attach `.catch(() => {})` to the send promise before the race.

### Test gap (non-blocking)

The fix report says the runner keeps `resend_timeout` as the stored job error code (`runner.ts:54-56`). No test runs `runDueJobs` with a timed-out send to show this. The unit test covers only `sendOnboardingWelcomeEmail`.

## Other checks with no defect found

- **Authorization:** no new route or action. `summarizeConnection` is pure, and it runs on rows already filtered by `userId` (`status.ts:345-357`). `undoApprovalIfUnlinked` only removes accounts, never grants, and never touches admins.
- **Idempotency:** a repeated unlink keeps the first `unlink_requested_at` (`coalesce`). A double removal (the webhook undo plus the unlink job) is harmless: the second sees `not_in_chat`/`revoked`. Welcome-email retries share the idempotency key.
- **Polling:**
  - The hook stops after 40 polls (about 2 minutes), when the unlink completes or fails, and on unmount. Nothing leaks.
  - On the onboarding page it runs alongside the Telegram polling. Both call the same stable `load`, which is harmless.
  - Each poll also calls `scheduleOnboardingJobRun`. This was already the case for the account panel, and the claim lease keeps it safe.
  - With a `checkout_id` and tier `none`, each poll also calls Polar `checkouts.get`. That is bounded by the cap, and this path already existed.
- **Flag off:** `/api/onboarding/*` returns 404. The checkout options and emails are unchanged (`route.ts:76-77`, comment-only change). The Telegram webhook path is only reached with v2 on. The welcome email is sent only by the onboarding job.
- **i18n:** the diff adds or uses no copy keys. The keys the changed UI paths use (`status.unlinking`, `actions.unlinkFailedCode`, `actions.unlinked`) already exist in EN and VI, as verified in the 1543 re-review.
- **Docs:** `docs/membership-onboarding.md` matches the code for N1, N2, N3 and N4.
- **Module graph:**
  - `telegram-webhook` imports `telegram-adapter`.
  - `email-onboarding-welcome` imports `lib/community/types`.
  - Neither import creates a cycle.

## Accepted residuals (not re-reported)

- Pre-squatting with an email that is not a verified NLB account (issue #12).
- Telegram leave detection only on re-check.
- Join requests from unlinked accounts are left to the admins.
- Open owner questions from the 1543 report:
  - the refund-restore trigger;
  - paging support on `not_owner`;
  - a real email lock.

## Unresolved questions

1. **I2:** should a failed post-approval removal page support through `admin_notify`, or is a log line enough for launch?
2. **I1:** is it acceptable, as the owner's call, that a re-link during an in-flight approval removes the account once?

Status: DONE
Summary: N1–N4 are all Fixed. New findings from this diff: 0 Critical, 0 High, 0 Medium, 0 Low, 5 Info (I1–I5) and 1 non-blocking test gap. Focused tests: 80/80 pass.
Concerns/Blockers: none blocking. I2 is the only path where an untracked Telegram member can remain, and it needs a race plus a Telegram failure.
