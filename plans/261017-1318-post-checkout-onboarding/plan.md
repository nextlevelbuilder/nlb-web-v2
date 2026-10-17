# Post-checkout onboarding with Discord/Telegram automation

Status: in progress · Issue: nextlevelbuilder/nlb-web-v2#2 · Integration branch: `feat/2-post-checkout-onboarding` (from `main`)

## Outcome (confirmed with the owner)

After a verified Polar payment for a Premium or VIP membership, the buyer signs in (Better Auth email OTP or social), lands on a first-party `/{locale}/onboarding` page, fills a minimal form, links Discord (OAuth2) and Telegram (bot deep link + join request), and gets the right community access automatically. Access follows the effective Polar subscription state for its whole lifecycle. Membership validity never depends on Discord, Telegram or email succeeding.

Owner decisions:
- Auto-grant after payment plus form plus commitment checkbox. No admin review gate. Policy copy in `content/policies/onboarding.ts` (EN and VI) changes to match.
- Form fields: required `goal` (what you want to build) and `commitmentAccepted`; optional `profileLinks` (up to 3 URLs), `skills` (short text), `phone`.
- `past_due` keeps access for `MEMBERSHIP_PAST_DUE_GRACE_DAYS` (default 7) counted from when the subscription first became past_due.
- Existing members are self-service: a banner on `/account`. No mass email. Reconcile never touches users who have not linked an account through NLB (shadow-safe by construction).
- Delivery: PR into `dev` (CI deploys staging with flag ON), smoke test on staging with Polar sandbox, test guild "NLB Test" and test supergroup "NLB Test", then `dev` into `main` (production, flag OFF).

## Non-goals

Production enablement, a VIP-only Telegram group, an admin review UI, mass emails, redesign changes, a separate service.

## Done means

See issue #2 checklist plus the brief: items 1–12 in the orchestrator's handoff brief (checkout redirect, ownership checks, form, Discord, Telegram, resolver, outbox and cron, account page, analytics and redaction, tests and CI, staging smoke and production flag OFF, isolated review).

## Shared contracts (every phase must follow these exactly)

### Environment and flags (`lib/env.ts`, `.dev.vars.example`, `cloudflare-env.d.ts`)

| Name | Kind | Notes |
|---|---|---|
| `ONBOARDING_V2_ENABLED` | wrangler var | `"true"` on staging, `"false"` on production. Off means the legacy flow is byte-for-byte unchanged. |
| `POLAR_SERVER` | var/secret | `"sandbox"` or `"production"` (default production). Passed to `new Polar({ server })`. |
| `MEMBERSHIP_PAST_DUE_GRACE_DAYS` | var | integer, default 7 |
| `ONBOARDING_ENCRYPTION_KEY` | secret | base64 32 bytes, AES-GCM key for provider tokens at rest |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_PREMIUM_ROLE_ID`, `DISCORD_VIP_ROLE_ID` | secrets | |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_GROUP_CHAT_ID` | secrets | |
| `LARK_ADMIN_WEBHOOK_URL` | secret, optional | internal admin notification only |
| `POLAR_PRODUCT_PREMIUM_EARLYBIRD_ANNUAL`, `POLAR_PRODUCT_VIP_EARLYBIRD_ANNUAL` | secrets (already set) | counted for entitlement mapping, not offered at checkout |

Helper: `lib/onboarding/flags.ts` exports `isOnboardingV2Enabled(): boolean`.

### Data model (migration `drizzle/migrations/0002_onboarding_community.sql`, generated with `npm run db:generate` from `lib/db/schema.ts`)

Additive only. Existing tables gain nullable columns; no row is deleted or rewritten.

- `customers.user_id` text, nullable, unique: the verified NLB user who owns this Polar customer.
- `subscriptions.past_due_since` integer ms, nullable: set when status first becomes `past_due`, cleared when it leaves.
- `subscriptions.ended_at` integer ms, nullable.
- `onboarding_profiles` (`user_id` PK → users.id, `goal`, `profile_links` JSON text, `skills`, `phone`, `commitment_accepted_at`, `completed_at`, `created_at`, `updated_at`).
- `community_connections` (`id`, `user_id`, `provider` `discord|telegram`, `external_user_id`, `display_name`, `access_token_enc`, `refresh_token_enc`, `token_expires_at`, `linked_at`, `created_at`, `updated_at`). Unique `(provider, external_user_id)` and unique `(user_id, provider)`. Unlink deletes the row only after access was revoked.
- `community_access_state` (`id`, `user_id`, `target` `discord_guild|telegram_group`, `desired_tier` `none|premium|vip`, `applied_tier`, `status`, `error_code`, `updated_at`, `created_at`). Unique `(user_id, target)`. `status` ∈ `not_connected|waiting_for_join|processing|active|retrying|action_required|revoked`.
- `onboarding_jobs` (`id`, `kind` `reconcile_access|welcome_email|admin_notify`, `dedupe_key` unique, `payload` JSON, `status` `pending|running|done|dead`, `attempts`, `next_run_at`, `locked_until`, `last_error` (redacted), `created_at`, `updated_at`).
- `onboarding_nonces` (`nonce_hash` PK, `kind` `discord_oauth|telegram_link`, `user_id`, `payload_enc`, `expires_at`, `used_at`, `created_at`).

### Modules

| Module | Owner phase | Exports |
|---|---|---|
| `lib/membership/tiers.ts` | 1 | `tierForProductId(id): "premium"|"vip"|null` (server env mapping incl. early-bird ids) |
| `lib/membership/effective-tier.ts` | 1 | `resolveEffectiveTier(subs, now, graceDays): { tier, validUntil, reason }` pure; VIP wins; active/trialing grant; `cancel_at_period_end` grants until `current_period_end`; `past_due` grants within grace; everything else none |
| `lib/membership/member-access.ts` | 1 | `getMemberTier(db, userId, now?)`, `linkCustomerToUser(db, {customerId, userId})`, `findLinkableCustomerForUser(db, user)` (verified email equality after trim+lowercase only; aliases are not merged) |
| `lib/crypto/secret-box.ts` | 1 | `encryptSecret(plain)`, `decryptSecret(enc)` (AES-GCM, WebCrypto) and `hashToken(s)` (SHA-256 hex) |
| `lib/onboarding/nonces.ts` | 1 | `issueNonce(db, {kind, userId, payload?, ttlMs}) → raw`, `consumeNonce(db, {kind, raw}) → {userId, payload} | null` (one-time, expiry checked, atomic) |
| `lib/onboarding/jobs.ts` | 1 | `enqueueJob(db, {kind, dedupeKey, payload, runAt?})` (upsert, resets pending), `enqueueAccessReconcile(db, userId, targets?)`, `claimDueJobs(db, limit, leaseMs)`, `completeJob`, `failJob` (exponential backoff 30s·2^n capped 1h, dead after 10), `retryJob(db, id)`, `jobStats(db)` |
| `lib/onboarding/runner.ts` | 1 | `runDueJobs(db, {limit})` used by cron and by `waitUntil` after enqueue |
| `lib/community/types.ts` | 1 | `CommunityTarget`, `MembershipTier`, `AccessStatus`, `CommunityAdapter { target; provider; apply(input): Promise<ApplyResult> }`, `ApplyResult { status, appliedTier, errorCode?, retryable?, retryAfterMs? }`, `ProviderError` |
| `lib/community/reconcile.ts` | 1 | `reconcileCommunityAccess(db, userId, target)` derives desired tier only from `getMemberTier`, calls the adapter, writes `community_access_state`, returns result; throws retryable errors so the job backs off |
| `lib/community/registry.ts` | 1 | maps target → adapter, importing `discordAdapter` from `lib/community/discord-adapter.ts` and `telegramAdapter` from `lib/community/telegram-adapter.ts` |
| `lib/community/discord-*.ts` | 2 | Phase 1 creates `discord-adapter.ts` as a stub returning `not_connected`; phase 2 owns and replaces it |
| `lib/community/telegram-*.ts` | 3 | same pattern as Discord |
| `lib/onboarding/status.ts` | 4 | `getOnboardingStatus(db, user, {checkoutId?})` |

### Routes

| Route | Phase | Contract |
|---|---|---|
| `POST /api/checkout` (existing) | 1 | membership + flag on → `successUrl = {APP_URL}/{locale}/onboarding?checkout_id={CHECKOUT_ID}`; adds `metadata.nlb_user_id` and `externalCustomerId` only when a session exists. Directory/toolkit/course URLs unchanged. |
| `POST /api/webhooks/polar` (existing) | 1 | also handles `subscription.active|canceled|uncanceled|revoked|past_due`, `order.refunded`; persists, links customer→user (metadata/external id → user; else verified email match), enqueues `reconcile_access` for both targets, enqueues `welcome_email` (flag on) instead of sending inline; never sends Form01 when flag on. Returns after durable writes. |
| `GET /api/onboarding/status?checkout_id=` | 4 | session required (401 otherwise). Uses Polar `checkouts.get` + subscription lookup server-side when webhook data is missing; binds only if the checkout's customer email equals the session's verified email or `metadata.nlb_user_id` equals the session user. Never treats the checkout id as authorization. Response: `{ payment: "pending"|"verifying"|"verified"|"failed"|"not_owner"|"none", membership: { tier, plan, term, status, renewsAt, cancelAtPeriodEnd } | null, profile: {...prefill, completed}, connections: { discord: { status, displayName?, nextAction }, telegram: {...} } }` |
| `POST /api/onboarding/profile` | 4 | session + effective tier ≠ none; zod validation; upsert |
| `POST /api/onboarding/retry` `{ target }` | 4 | session; enqueue reconcile; rate-limited per user (1/30s) |
| `DELETE /api/onboarding/connections/:provider` | 4 | session; marks unlink, enqueues revoke, deletes connection after revoke |
| `GET /api/onboarding/discord/start` | 2 | session + tier ≠ none; state + PKCE nonce (10 min) → Discord authorize, scopes `identify guilds.join` |
| `GET /api/onboarding/discord/callback` | 2 | verify state belongs to session user, exchange code, fetch `@me`, uniqueness, store encrypted tokens, enqueue reconcile, redirect `/{locale}/onboarding?discord=linked|error=<code>` |
| `POST /api/onboarding/telegram/link` | 3 | session + tier ≠ none; nonce (10 min) → `{ url: https://t.me/<bot>?start=<nonce> }` |
| `POST /api/onboarding/telegram/join-link` | 3 | session + linked + tier ≠ none; per-user invite link with `creates_join_request`, expires in 24h |
| `POST /api/telegram/webhook` | 3 | `X-Telegram-Bot-Api-Secret-Token` check; `/start <nonce>` links account; `chat_join_request` approved only for linked + entitled user, otherwise declined |
| `GET/POST /api/admin/onboarding/jobs` | 4 | admin role only; list stats/dead jobs; retry |

Cron: custom worker entry `worker.ts` wraps `.open-next/worker.js`, adds `scheduled()`: `* * * * *` runs `runDueJobs`; `17 * * * *` reconciles active subscriptions against Polar (recover dropped webhooks). Both no-op when the flag is off.

## Phases

| Phase | Owner | Depends on | Files (exclusive) |
|---|---|---|---|
| 1 Foundation | sub-session A | — | `lib/db/schema.ts`, `drizzle/**`, `lib/membership/**`, `lib/crypto/**`, `lib/onboarding/{flags,nonces,jobs,runner}.ts`, `lib/community/{types,reconcile,registry}.ts` + adapter stubs, `lib/polar.ts`, `lib/env.ts`, `app/api/checkout/route.ts`, `app/api/webhooks/polar/route.ts`, `lib/resend.ts`, `lib/email-*.ts`, `worker.ts`, `wrangler.jsonc`, `open-next.config.ts`, `.dev.vars.example`, `cloudflare-env.d.ts`, tests for these |
| 2 Discord | sub-session B | 1 | `lib/community/discord-*.ts`, `app/api/onboarding/discord/**`, `tests/onboarding-discord*.test.ts` |
| 3 Telegram | sub-session C | 1 | `lib/community/telegram-*.ts`, `app/api/onboarding/telegram/**`, `app/api/telegram/**`, `scripts/telegram/**`, `tests/onboarding-telegram*.test.ts` |
| 4 Member UI and APIs | sub-session D | 1 | `lib/onboarding/status.ts`, `app/api/onboarding/{status,profile,retry,connections}/**`, `app/api/admin/onboarding/**`, `app/[locale]/onboarding/**`, `components/onboarding/**`, account page section, `messages/*.json`, `content/policies/onboarding.ts`, `app/robots.ts`, analytics helpers, `tests/onboarding-{status,profile,ui}*.test.ts` |
| 5 Ops | orchestrator | 2–4 | `scripts/onboarding/backfill-*.ts`, `docs/**`, staging secrets, Telegram `setWebhook` |

## Validation

`npm run type-check && npm run lint && npm test`, `npm run build:worker` once per integration, plus the staging smoke script in phase 5.

## Rollback

Flag `ONBOARDING_V2_ENABLED=false` restores the legacy flow. The migration is additive; leaving it in place is safe.
