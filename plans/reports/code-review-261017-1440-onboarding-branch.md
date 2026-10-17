# Code review: `feat/2-post-checkout-onboarding` (HEAD 3c15480) vs `main`

Date: 2026-10-17 (Asia/Saigon) · Issue: nextlevelbuilder/nlb-web-v2#2 · Reviewer: independent code review

## Scope

- 87 files, about +13.8k/-0.2k lines. More than 5k of those are the generated `drizzle/migrations/meta/0002_snapshot.json`.
- Read in full: checkout and Polar webhook routes, `lib/membership/**`, `lib/onboarding/**`, `lib/community/**`, `lib/crypto/secret-box.ts`, every new API route, `worker.ts`, `wrangler.jsonc`, the migration, the onboarding page and components, the welcome email, analytics and the backfill scripts. Also read `plan.md`, `handover-phase1.md` and `docs/membership-onboarding.md`.
- Checks run:
  - `npx vitest run` on the 17 onboarding/webhook/policy test files: 190/190 pass.
  - `npm run type-check`: clean.
  - EN/VI parity for the `onboarding` (95 keys) and `accountMembership` (30 keys) namespaces: identical.
- Not run: `npm run lint`, `npm run build:worker`, the staging smoke test.

## Overall assessment

The foundation is careful work:
- Every job write is guarded by its lease.
- Out-of-order Polar deliveries cannot overwrite newer state (`polar_modified_at` plus a terminal `ended_at`).
- Nonces are single-use and stored hashed.
- PKCE is in place, tokens are sealed with AES-GCM, and the Telegram secret is compared in constant time.
- Analytics events carry tier and plan only, and stored job errors are redacted.

With the flag off, the email flow keeps the legacy behaviour: checkout is called with the original three arguments, and welcome + Form01 still go out only on `subscription.created`/active.

The main defects are in the ownership model:
- The server-set `nlb_user_id` is trusted more than the customer identity it gets attached to (H1).
- The one-customer-per-user unique index silently drops paid memberships (H2).
- Several revoke paths can leave access applied to an account NLB no longer tracks (M2, M3).

---

## High

### H1. `metadata.nlb_user_id` lets a buyer take over another person's existing Polar customer and its memberships

- **Where:**
  - `app/api/webhooks/polar/route.ts:329-341` (`linkCustomerFromEvent`)
  - `lib/onboarding/status.ts:158-165` (`checkoutBelongsTo`) and `:220-224` (`verifyCheckout`)
  - `app/api/checkout/route.ts:62-80`
- **Failure scenario:**
  1. Signed-in user A starts a Premium checkout. The body `customerEmail` is optional and not tied to the session; the Polar checkout email is editable anyway. A pays with victim B's email.
  2. B is an existing member, possibly VIP, whose `customers` row is still unlinked. That is the normal state for existing members; the docs call it shadow-safe.
  3. The webhook's `ensureCustomer` finds B's row by email. `linkCustomerFromEvent` then links it to A, because `nlb_user_id = A` is checked before any email check.
  4. `verifyCheckout` does the same. `checkoutBelongsTo` passes on metadata, and `ensureCheckoutCustomer` returns B's row by Polar customer id or email.
- **Impact:**
  - `getMemberTier(A)` now includes all of B's subscriptions: A gets B's VIP Discord and Telegram access.
  - A can also see B's plan and renewal date on `/account`, and can upgrade or affect B's subscription through `/api/onboarding/upgrade`.
  - B can never claim the row afterwards: `customers.user_id` is set, and `findLinkableCustomerForUser` requires it to be null or B's own.
  - Cost of the attack: one Premium payment.
- **Fix (any of):**
  1. Trust `nlb_user_id` only when the customer row did not exist before this checkout (no other subscriptions or orders), or when the user's verified email equals the customer email. Otherwise do not link: return `not_owner` and leave it to support.
  2. In `/api/checkout`, when a session exists, force `customerEmail` to the session's verified email and pass Polar `externalCustomerId = userId` so the buyer cannot change the email. Commit fa27c1b dropped this; reconsider it for new customers only.
  3. Never link a row that already has subscriptions to a user found only through metadata.
- **Test gap:** add a test where a pre-existing unlinked customer with an active VIP subscription receives an order or subscription carrying another user's `nlb_user_id`.

### H2. A second Polar customer for the same NLB user is never linked: the paid membership grants nothing and the page shows "verifying" forever

- **Where:**
  - `lib/db/schema.ts` and the migration: `customers.user_id` is unique (`CREATE UNIQUE INDEX customers_user_id_unique`)
  - `lib/membership/member-access.ts:60-75`: the unique violation is swallowed and the function returns false
  - `lib/onboarding/status.ts:224-228`: returns `"verifying"` when the row stays unlinked
  - `app/api/webhooks/polar/route.ts:336-341`
- **Failure scenario:**
  1. User A already owns customer row X. Two common ways this happens: `claimCustomerByVerifiedEmail` auto-links on every `/account` or status render, and `customers` also holds directory, toolkit and course buyers. So someone who once bought a directory listing with `a@x` gets X linked just by visiting `/account`.
  2. A then buys Premium while signed in, using a different Polar email (a work or invoice address). That creates row Y.
  3. `linkCustomerToUser(Y → A)` hits the unique index and returns false. No reconcile is queued.
  4. `verifyCheckout` returns `"verifying"`, and the UI spins until the "slow" message.
- **Impact:** A has paid and has no access. There is no self-service recovery; the only fix is manual DB work.
- **Fix:**
  - Let one user own several customers. Make `customers_user_id` a non-unique index. The migration has not reached production yet, so 0002 can change in place.
  - Drop the "user already owns another customer" refusal in `linkCustomerToUser` and in the backfill SQL. `getLinkedSubscriptions` already joins on `customers.user_id`, so the tier logic works unchanged.
  - If uniqueness is kept on purpose, `verifyCheckout` must at least return a distinct state (for example `needs_support`) and enqueue an `admin_notify`, rather than poll forever.

## Medium

### M1. Upgrade falls back to a new VIP checkout on 409 and creates a second subscription

- **Where:** `components/onboarding/membership-upgrade-button.tsx:42`, `lib/onboarding/status.ts:506-536`
- **Failure scenario:**
  1. A Premium member is `past_due` within grace, so the effective tier is still premium and the account page shows the upgrade button.
  2. `upgradeMembershipToVip` filters on `UPGRADEABLE_STATUSES = {active, trialing}` and returns `no_upgradeable_subscription` (409).
  3. The button then calls `/api/checkout` for VIP. The member ends up with a past_due Premium subscription plus a brand-new VIP subscription.
- **Impact:** a double subscription and double billing, which breaks acceptance criterion 8 ("in place, no double subscription").
- **Fix:**
  - Do not fall back to checkout when the user has any linked membership subscription. Only fall back when `getLinkedSubscriptions` holds no membership at all; the server can return a distinct code for that.
  - For `past_due`, show "update your payment method first".

### M2. Unlink deletes the Telegram link even when the member was not removed

- **Where:** `lib/onboarding/status.ts:593-599`, `lib/community/telegram-adapter.ts:28,39,49,58`
- **Failure scenario:**
  1. The Telegram adapter returns `{ status: "action_required", appliedTier: "none" }` for permanent failures: `telegram_bot_not_admin`, `telegram_unauthorized`, `telegram_admin_not_removed`, `telegram_chat_not_found`, or a ban rejected for missing rights.
  2. `unlinkCommunityConnection` checks only `result.retryable || result.appliedTier !== "none"`. It treats those failures as a successful revoke and deletes the `community_connections` row.
  3. The member stays in the group, and NLB no longer tracks the account, so reconcile can never remove it.
  4. The member can then link a second Telegram account and get it approved, so two accounts sit in the group on one membership.
- **Fix:** delete the row only when `result.status` is `"revoked"` (or `"not_connected"` for an unknown member). Return `revoke_failed` for `action_required`. The same rule protects Discord when `current` is null.

### M3. Unlink races an in-flight reconcile job and leaves roles on an untracked account

- **Where:** `lib/onboarding/status.ts:565-602` (the provider call runs inline in the request, outside the job lease) and `lib/community/discord-adapter.ts:68-89`
- **Failure scenario:**
  1. A `reconcile_access` job for the user is running, triggered by a webhook, Retry or the link callback. It has read the connection and a tier of `vip`.
  2. The member clicks Unlink. The unlink request removes the roles and deletes the connection.
  3. The job then runs `addRole`/`addMember` on the old Discord id.
  4. The follow-up reconcile finds no connection and records `not_connected`. Discord account D1 keeps Premium and VIP for good.
  5. The member links D2 and gets roles there too.
- **Impact:** the window is short, but a member can trigger it deliberately (Retry, then Unlink). That makes access shareable.
- **Fix (either):**
  - Run unlink through the queue under the same `reconcile_access:{user}:{target}` dedupe key, so the work is serialized. Mark the connection `unlinking` and delete it from the job.
  - After deleting, enqueue a `revoke_external` job keyed by `(provider, external_user_id)` that converges that account to `none`.
- In either case, have the adapter re-read the connection immediately before any grant mutation.

### M4. The Telegram bot declines every join request from accounts not linked through NLB

- **Where:** `lib/community/telegram-webhook.ts:122-145` (decline at `:132`)
- **Failure scenario:** any `chat_join_request` to the configured group from an account not linked through NLB is declined.
  - If the group already uses an approval-required invite link for legacy members, or admins approve requests by hand, the bot now auto-declines those people as soon as the flag is on.
  - This contradicts the documented shadow-safe rule ("a user who has not linked ... is never touched").
- **Fix:**
  - Act only on requests whose `chat_join_request.invite_link.name` starts with `nlb-` (the prefix the join-link route creates). Ignore the rest and leave them for admins.
  - Decline unlinked or unentitled requests only for NLB links.

### M5. A full refund of any order on a subscription ends entitlement for good, whatever Polar says

- **Where:** `app/api/webhooks/polar/route.ts:465-487`, `lib/membership/subscription-sync.ts:139-161`, `lib/membership/polar-resync.ts:55`
- **Failure scenario:**
  1. An admin fully refunds an earlier renewal order, or makes a goodwill refund, while the Polar subscription stays `active` and keeps billing.
  2. `markSubscriptionRefunded` sets `status = 'refunded'` and `ended_at`. The terminal rule in `newerState` then blocks every later Polar update.
  3. Resync skips `refunded` rows.
- **Impact:** the member keeps paying and has no access. Nothing restores it automatically.
- **Fix:** mark the subscription ended only when the refunded order is the one for the current period (`order.created_at` within `current_period_start..end`), or let Polar's own `subscription.revoked`/`canceled` decide. At minimum, let resync re-read refunded rows and clear the local refund when Polar still reports the subscription active.

### M6. A member who leaves (or is kicked from) Discord or Telegram stays "active" with no way to rejoin

- **Where:**
  - `lib/onboarding/status.ts:271-291`: `active` maps to `nextAction: "none"`
  - `components/onboarding/community-connection-card.tsx:144`: no Retry or Join for `none`
  - `scripts/telegram/set-webhook.ts`: `allowed_updates` has no `chat_member`
- **Failure scenario:** a VIP member leaves the Telegram group or the Discord guild, or a moderator removes them. The recorded state stays `active`. The card shows Active with no Join or Retry action, and drift only fires on tier changes.
- **Impact:** the member cannot self-recover, which goes against acceptance criteria 5 and 8 ("reconnect/retry").
- **Fix:**
  - Always offer Retry while a connection exists and the tier is not `none`. Retry is already rate-limited.
  - For Telegram, subscribe to `chat_member` updates and enqueue a reconcile when an entitled member leaves.

## Low

### L1. The upgrade endpoint does not check the effective tier
- **Where:** `lib/onboarding/status.ts:529-545`
- **Scenario:** a user with a separate active VIP subscription plus a Premium one can `POST /api/onboarding/upgrade` directly and convert the Premium one too, ending up with two VIP subscriptions. The UI hides the button, but the API does not refuse.
- **Fix:** return 409 when `getMemberTier(...).tier === "vip"`.

### L2. A job lease can expire before the job runs, so the job runs twice
- **Where:** `lib/onboarding/jobs.ts:108`, `lib/onboarding/runner.ts:106`, `lib/community/discord-api.ts:92`
- **Scenario:**
  - `claimDueJobs` stamps all 25 claimed jobs with one 60 s lease up front, then runs them one after another.
  - Discord and Telegram `fetch` calls have no timeout, so a slow provider lets the later leases expire while those jobs are still queued in the batch.
  - The next minute's cron reclaims them and they run twice at the same time. Reconcile is mostly idempotent, and the welcome email is protected only by Resend's 24 h idempotency key.
- **Fix:** add `AbortSignal.timeout(10_000)` to provider calls, and either claim one job at a time or extend the lease per job before dispatch.

### L3. Discord join race: roles not applied when the user joins the guild between the check and the PUT
- **Where:** `lib/community/discord-adapter.ts:74-78`, `lib/community/discord-api.ts:192-199`
- **Scenario:** Discord's "add guild member" call returns 204 and ignores `roles` when the user is already a member. The code still records `active` with the desired tier.
- **Fix:** on a 204, follow up with `addRole` for the wanted roles.

### L4. Flag-off production now writes D1 state the legacy flow never wrote (please confirm this is intended)
- **Where:** `lib/polar.ts:87`, `app/api/webhooks/polar/route.ts:367,420,465-475,522-528`
- **What changes with the flag off:**
  - Early-bird product events are no longer skipped.
  - `customers.user_id` gets linked by verified email.
  - `order.refunded` marks subscriptions refunded.
- The emails are unchanged, so this is not a regression of acceptance criterion 1. However, flag off is no longer a no-op on the D1 tables, and M5 applies in production right away.

### L5. `GET /api/onboarding/discord/start` returns raw JSON to a browser navigation
- **Where:** `app/api/onboarding/discord/start/route.ts:24,39`
- **Scenario:** the route is reached through an `<a href>`. A 403 `membership_required` (the membership lapsed between render and click) or a 404 (flag off) shows a raw JSON page.
- **Fix:** redirect to `onboardingRedirectUrl(locale, { error: "discord_failed" })`, or add a `membership_required` error code to the page's `DISCORD_ERROR_CODES`.

---

## Acceptance criteria check

| # | Verdict | Notes |
|---|---|---|
| 1 Checkout redirect / flag off | Pass | The success URL and locale are correct, and other products are unchanged. Flag off keeps the email flow; for D1 side effects see L4. |
| 2 Ownership | **Fail** | H1 (metadata outranks the existing customer identity) and H2. |
| 3 Form, no Form01, policy | Pass | Zod validation on the server, save/resume, Form01 skipped when the flag is on, EN/VI keys identical. |
| 4 Discord | Pass with issues | State + PKCE, uniqueness, and only the two managed roles are touched. See M3 and L3. |
| 5 Telegram | Pass with issues | Secret check, `/start` nonce, and ban+unban allows rejoining. See M2, M4 and M6. |
| 6 Resolver | Pass | VIP wins, cancel-at-period-end keeps access, the past_due grace is configurable, and ended means no access. See M5 for refunds. |
| 7 Outbox / cron | Pass with issues | Lease, backoff, dead-lettering, admin retry, hourly resync and dry-run backfill are all present. See L2. |
| 8 /account | **Fail** | M1 (double subscription) and M6 (no recovery after leaving). |
| 9 Privacy | Pass | Events carry tier/plan only, errors are redacted, tokens and nonce payloads are sealed, and the admin listing strips user ids. |

## Out-of-scope pre-existing issues (candidates for separate `ai-handle` issues)

1. **Customer email is logged.** `app/api/checkout/route.ts` runs `console.error("Checkout created but no URL returned:", checkout)` and logs the whole Polar checkout object, including the customer email, to Workers observability.
2. **Buyer email goes to Discord.** `lib/discord.ts:77`: the sales notification posts each buyer's email into a Discord channel.
3. **Customers keyed by email only.** `ensureCustomer` in `app/api/webhooks/polar/route.ts` ignores the Polar customer id. A Polar email change creates a duplicate local customer, and a different Polar customer with the same email collapses into one row. This is also the root that makes H1 reachable.
4. **`paidAt` keeps moving.** `handleOrderCreated` rewrites `orders.paidAt = new Date()` on every paid or updated redelivery, so the payment timestamp drifts.
5. **VIP course access never expires on a missed webhook.** `lib/courses/course-video-access.ts` trusts `subscriptions.status = 'active'` with no period-end check (already recorded as M1 in `plans/reports/code-reviewer-261013-2016-codebase-review.md`). It could now reuse `resolveEffectiveTier`.

## Recommended order

1. H1 and H2: rework the ownership/link rule (non-unique `customers.user_id` plus a stricter metadata trust rule), with tests.
2. M1, M2, M3: upgrade fallback guard; revoke success only on `status === "revoked"`; serialize unlink through the queue.
3. M4, M5, M6 before the staging smoke test, because the smoke test exercises each of them.
4. Low items as follow-ups.

## Unresolved questions

- Does the production Telegram group already use approval-required invite links? That decides how urgent M4 is.
- Is one NLB user owning several Polar customers an accepted product case? That decides which H2 fix to use.
- Were the flag-off D1 writes (L4) meant to ship to production before enablement?
