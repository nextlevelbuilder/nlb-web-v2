# Onboarding foundation — hand-over for Discord / Telegram / member UI

Branch: `claude/onb-foundation-01af21`.

## What exists (import from here, do not re-create)

- Schema (`lib/db/schema.ts`, migration `drizzle/migrations/0002_onboarding_community.sql`):
  `onboarding_profiles`, `community_connections`, `community_access_state`, `onboarding_jobs`,
  `onboarding_nonces`; `customers.user_id` (unique), `subscriptions.past_due_since`, `ended_at`,
  **`polar_modified_at` (extra column, not in the plan; used for out-of-order ordering)**.
- Targets are `discord_guild` / `telegram_group`; providers `discord` / `telegram`.
- `lib/community/types.ts`: `CommunityAdapter { target, provider, apply(input: ApplyInput): Promise<ApplyResult> }`,
  `ApplyInput { db, userId, target, desiredTier, connection, current }`, `ApplyResult { status, appliedTier, errorCode?, retryable?, retryAfterMs? }`,
  `ProviderError(code, { retryable?, retryAfterMs?, message? })`.
  Throw `ProviderError` with `retryable: true` (and `retryAfterMs` from 429) for transient failures;
  return `{ status: "action_required", errorCode }` for permanent ones.
- Stubs to REPLACE: `lib/community/discord-adapter.ts` (export `discordAdapter`), `lib/community/telegram-adapter.ts` (export `telegramAdapter`). Keep export names; registry imports them.
- `reconcileCommunityAccess(db, userId, target)` writes `community_access_state`; never call providers inline from routes — call `enqueueAccessReconcile(db, userId, targets?)` (`lib/onboarding/jobs.ts`).
- Tier: `getMemberTier(db, userId)` (`lib/membership/member-access.ts`) — counts ONLY customers linked via `customers.user_id`.
  Member UI should call `findLinkableCustomerForUser(db, user)` + `linkCustomerToUser(db, {customerId, userId})` for a signed-in verified user, then `enqueueAccessReconcile`.
- Secrets: `encryptSecret/decryptSecret/hashToken/randomToken` (`lib/crypto/secret-box.ts`), key `ONBOARDING_ENCRYPTION_KEY` (base64 32 bytes).
- Nonces: `issueNonce(db, {kind: "discord_oauth"|"telegram_link", userId, payload?, ttlMs})` → raw; `consumeNonce(db, {kind, raw})` → `{userId, payload}|null`, single-use, atomic.
- Env: `getOnboardingEnv()`, `isOnboardingV2Enabled()`, `onboardingPath(locale)` (`lib/onboarding/flags.ts`). English path is `/onboarding` (unprefixed, `localePrefix: "as-needed"`), Vietnamese `/vi/onboarding`.
- Checkout success URL (flag on, membership only): `${APP_URL}{onboardingPath}?checkout_id={CHECKOUT_ID}`; metadata `nlb_user_id` (session user id, server-side only) and `nlb_locale`. No Polar `externalCustomerId` is sent.
- Webhook linking: `metadata.nlb_user_id` on checkout, subscription or order payloads, else a verified email (trim + lowercase). Polar external customer ids are ignored.
- Jobs runner: `runDueJobs(db)`; Worker `scheduled()` in `worker.ts` (cron `* * * * *` jobs, `17 * * * *` Polar resync + tier drift + nonce purge). Admin listing helpers: `jobStats`, `listJobs`, `retryJob`.

## Known gaps / deviations

- Refund delivered before any subscription row exists is not persisted for entitlement (resync later corrects status but not refund).
- Staging uses `POLAR_SERVER=sandbox`: needs sandbox token, webhook secret and product ids.
- Wrangler `vars` added (`ONBOARDING_V2_ENABLED`, `MEMBERSHIP_PAST_DUE_GRACE_DAYS`, `POLAR_SERVER`): if a secret of the same name exists, deploy will conflict.
