# Membership onboarding

After a verified Polar payment for Premium or VIP, the buyer signs in, lands on `/onboarding` (`/vi/onboarding`), fills a short form, links Discord and Telegram, and gets community access automatically. Access follows the Polar subscription for its whole lifecycle. Membership never depends on Discord, Telegram or email succeeding.

The whole flow sits behind `ONBOARDING_V2_ENABLED`. Off means the legacy flow (welcome email + Form01, manual community access) is unchanged for buyers. The Polar webhook still keeps D1 current with the flag off, on purpose, so enabling the flag later starts from correct data: it records early-bird membership events, links `customers.user_id` by verified email, and marks a subscription refunded under the refund rule below. With the flag off nothing reads these rows to grant access, and no jobs or provider calls run. Design record: [plans/261017-1318-post-checkout-onboarding/plan.md](../plans/261017-1318-post-checkout-onboarding/plan.md).

## How access is decided

- **Who owns a membership:** a Polar customer is linked to an NLB user (`customers.user_id`) only from server-trusted signals ([`linkCustomerFromPurchase`](../lib/membership/member-access.ts), shared by the webhook and checkout verification). A checkout id is never authorization.
  - For a signed-in membership checkout, `/api/checkout` sets `metadata.nlb_user_id` and prefills the checkout email with the session user's, ignoring any email in the request body. The buyer can still edit the email on Polar's page, so ownership is enforced when the customer is linked, not at checkout.
  - `nlb_user_id` is never trusted when the customer email is another user's verified NLB email; that user gets the link. Otherwise it is trusted only when the Polar customer is new to NLB (no subscriptions or orders besides the ones this checkout or event carries) or its email equals that user's verified email. In every other case only the verified-email rule applies: the customer email, trimmed and lowercased, equals a verified NLB email.
  - A user may own several customers (for example two purchase emails); the tier counts all of them. A customer already linked to a user is never moved to another.
- **Tier:** [`getMemberTier`](../lib/membership/member-access.ts) over the linked subscriptions ([`resolveEffectiveTier`](../lib/membership/effective-tier.ts)). VIP wins over Premium. `active` and `trialing` grant access, `cancel_at_period_end` keeps it until the period ends, `past_due` keeps it for `MEMBERSHIP_PAST_DUE_GRACE_DAYS` (default 7) from when it first became past due, and anything else (expired, revoked, refunded) grants nothing.
- **Refunds:** only a full refund of the order that paid for the subscription's current period ends it ([`markSubscriptionRefunded`](../lib/membership/subscription-sync.ts)). Partial refunds, refunds of an earlier period's order and refunds of a mid-period plan-change charge keep access. If Polar later reports the subscription `active` or `trialing` with a `modified_at` newer than the refund, access follows Polar again.
- **Communities:** [`reconcileCommunityAccess`](../lib/community/reconcile.ts) applies the tier to each target and records it in `community_access_state`.
  - Discord ([adapter](../lib/community/discord-adapter.ts)): Premium role, or Premium + VIP roles. Revocation removes only those two roles and never kicks.
  - Telegram ([adapter](../lib/community/telegram-adapter.ts)): one shared group. The bot acts only on join requests from accounts linked through NLB: it approves a linked, entitled account and declines a linked account without a tier. Requests from accounts not linked through NLB are left untouched for the group admins. Revocation removes the member with a short ban followed by an unban, so they can rejoin after renewing. Admins and the owner are never touched.
- **Rejoin:** an active member still sees Retry ("Rejoin or re-check") on each linked community. It re-runs reconcile, which re-adds a Discord member who left the server (`guilds.join`) and marks a Telegram member who left the group `waiting_for_join`, so the card offers the join link again. The bot does not subscribe to Telegram `chat_member` updates, so leaving is noticed on the next reconcile, not instantly.
- **Upgrade:** `POST /api/onboarding/upgrade` moves a Premium subscription to VIP in place. It never starts a second subscription while the user has a linked membership. It refuses with 409: `no_membership` (only then does the page fall back to a new checkout), `already_vip`, `past_due` (update the payment method first) or `no_upgradeable_subscription`.
- **Unlink:** `DELETE /api/onboarding/connections/{provider}` answers 202 `{ "unlinking": true }` and marks the connection. The reconcile job for that target, the same queue entry that grants access, then removes access and deletes the link only when the provider confirms it (`revoked` or `not_connected`). Otherwise the link stays, the card shows the error code and Retry runs it again. Adapters re-read the connection before any grant, so a grant never lands on an account being unlinked or replaced. The Telegram join approval runs in the webhook instead, so it re-reads the link after approving and removes the account again if the link is gone or unlinking. Until the job answers, the card shows the unlink as processing and the page polls; an error recorded before the unlink request is not shown as an unlink failure.
- **Shadow-safe:** a user who has not linked Discord or Telegram through NLB is never touched by reconcile, so existing members keep their current access until they connect.

## Jobs and cron

Provider calls never run inline in a request. Routes and webhooks enqueue rows in `onboarding_jobs` ([`lib/onboarding/jobs.ts`](../lib/onboarding/jobs.ts)): `reconcile_access`, `welcome_email`, `admin_notify`. Each row has a dedupe key and a two-minute lease, renewed as each job of a claimed batch starts; a job another runner re-took after its lease expired is skipped. Every Discord, Telegram, Polar, Resend (welcome email) and admin-webhook call a job makes times out after 10 s and is retried as a transient failure. A failed job backs off for 30 s·2^n, capped at 1 h, and is marked dead after 10 attempts. Stored errors are redacted codes.

The worker entry [`worker.ts`](../worker.ts) adds `scheduled()` (crons in [`wrangler.jsonc`](../wrangler.jsonc)). Both no-op while the flag is off:
- `* * * * *` runs due jobs.
- `17 * * * *` re-reads active subscriptions from Polar to recover dropped webhooks, re-queues tier drift and purges expired nonces.

Admins inspect and retry jobs at `GET/POST /api/admin/onboarding/jobs`.

## Configuration

Vars in `wrangler.jsonc`, per environment: `ONBOARDING_V2_ENABLED` (`"true"` on staging, `"false"` on production), `MEMBERSHIP_PAST_DUE_GRACE_DAYS`, `POLAR_SERVER` (`sandbox` on staging). Never create a secret with one of these names; the deploy fails when a var and a secret collide.

Worker secrets (names in [`.dev.vars.example`](../.dev.vars.example)):

| Secret | Purpose |
|---|---|
| `ONBOARDING_ENCRYPTION_KEY` | base64 of 32 random bytes; AES-GCM key for Discord tokens and nonce payloads at rest. Rotating it invalidates stored Discord tokens (members reconnect). |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | OAuth app; register the redirect URI `<NEXT_PUBLIC_APP_URL>/api/onboarding/discord/callback` per environment. |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_PREMIUM_ROLE_ID`, `DISCORD_VIP_ROLE_ID` | Bot in the guild with Manage Roles and Create Instant Invite; its role must sit above both member roles. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_GROUP_CHAT_ID` | Bot is an admin of the group with "Invite users" and "Ban users". Use the supergroup id (`-100…`); a group migrates to a new id when it becomes a supergroup. |
| `LARK_ADMIN_WEBHOOK_URL` | optional internal admin notification. |
| Polar token, webhook secret, product ids | staging uses Polar sandbox values. |

Set secrets without echoing them, for example `wr secret bulk <file> --env staging` from a file outside the repo, using the `wr` helper in [deployment-guide.md](./deployment-guide.md#wrangler-access).

Register the Telegram webhook once per environment (prints only `ok` and the description):

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... npx tsx scripts/telegram/set-webhook.ts --url https://staging.nextlevelbuilder.io/api/telegram/webhook
```

## Existing members

Existing members are self-service: `/account` shows a banner that links their membership and offers Discord and Telegram. Signing in with the purchase email links the customer on the fly. To link everyone up front, run the backfill (dry run by default, prints counts only):

```bash
npx tsx scripts/onboarding/backfill-customer-links.ts --target staging
npx tsx scripts/onboarding/backfill-customer-links.ts --target staging --apply
npx tsx scripts/onboarding/backfill-customer-links.ts --target production --apply --confirm-production
```

`--apply` exports a D1 backup first. Linking grants nothing by itself.

## Rollout and rollback

1. Staging: flag on, Polar sandbox, test guild and test supergroup. Smoke test Premium and VIP: checkout, onboarding form, Discord consent and roles, Telegram `/start` and join request, then cancel/revoke in the Polar sandbox and confirm removal.
2. Production: deploy with the flag off. Enabling it is a separate decision: set the secrets above, register the production Telegram webhook, then flip `ONBOARDING_V2_ENABLED` in `wrangler.jsonc`.

Rollback: set `ONBOARDING_V2_ENABLED` to `"false"` and deploy. The legacy flow returns, cron jobs stop, and the additive migration can stay in place.
