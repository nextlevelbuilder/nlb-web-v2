# NLB Builder League — implementation plan

Status: in progress · Issue: nextlevelbuilder/nlb-web-v2#3 · Brief: [brief.md](./brief.md) · Integration branch: `feat/3-builder-league` (PR into `dev`, then `dev` → `main`)

Depends on #2 (`feat/2-post-checkout-onboarding`) phase 1 for `getMemberTier` and `community_connections`. Until it lands, code imports them through one adapter file (`lib/builder-league/membership.ts`), so a rebase only has to touch that one file.

## Shared contracts (every piece follows these exactly)

### Product rules

- One RP ledger (`score_ledger`). Level is a pure function of lifetime RP. Rank comes from a separate eligibility gate. League Score is computed per period from ledger entries plus caps and weights. There is no second currency.
- Every award is tied to a `builder_events` row and a project (nullable for CONTRIBUTE). Corrections and reversals are new rows (`kind = reversal|correction|adjustment`); there are no UPDATE or DELETE statements on `builder_events` or `score_ledger`.
- Dedupe key = `sha256(source|externalEventId|subjectUserId|awardType)`, unique in both `builder_events.dedupe_key` and `score_ledger.dedupe_key`. Inserts use `onConflictDoNothing`, so retries and replays are no-ops.
- High-value events (RP ≥ 25, and every SHIP/payment/launch event) need `moderator_verified` or `system_verified`. API keys, MCP delegation and agents can only submit (`status = submitted`); they never approve, verify or award.
- Membership tier (Premium/VIP) never changes RP, rank or League Score. Access requires `getMemberTier(...) !== "none"` OR `users.role = 'admin'`.
- Feature flag: `BUILDER_LEAGUE_ENABLED` (wrangler var, `"false"` in production, `"true"` on staging). When it is off, `/builder-league/**`, `/api/v1/builder-*` and the builder tab on `/leaderboards` are only available to admins and to users in `builder_pilot_members`. Everyone else gets a 404 (pages) or a 404 JSON (API). The passport section on `/builders/[id]` renders only when the flag allows the viewer **and** the subject opted in.
- Public exposure always requires opt-in in `builder_privacy` (leaderboard, passport, wrapped, peer mentions, each separately). The default is private.
- Time: store UTC epoch ms. Period boundaries use the fixed zone `Asia/Ho_Chi_Minh` (UTC+7, no DST): week Mon 00:00 → Sun 23:59:59.999, calendar month, calendar year, season = 8 ISO weeks starting from `SEASON_EPOCH` in the ruleset. Use the helpers in `lib/builder-league/time-windows.ts` only.
- Ruleset `v2` (`lib/builder-league/ruleset/v2.ts`) is the effective policy from `effectiveFrom` = production deploy date. Each snapshot records `rulesetVersion`. Ruleset `v1` encodes the legacy RP table, so that pre-v2 backfill entries are scored by the rules that applied when they happened.

### Module layout (`lib/builder-league/`)

| File | Owner | Exports (stable names) |
|---|---|---|
| `types.ts` | F | `Stage = "validate"\|"build"\|"ship"\|"contribute"`, `EventTypeKey`, `Verification = "self_reported"\|"peer_confirmed"\|"moderator_verified"\|"system_verified"`, `Visibility = "private"\|"community"\|"public"`, `EvidenceStatus = "submitted"\|"needs_info"\|"approved"\|"rejected"\|"withdrawn"`, `EventSource = "member"\|"api"\|"agent"\|"moderator"\|"system"\|"backfill"\|"discord"\|"directory"`, `BoardKey = "overall"\|Stage\|"rising"\|"newcomers"`, `PeriodType = "week"\|"month"\|"year"\|"season"`, `RankKey = "apprentice"\|"builder"\|"architect"\|"master"\|"legend"` |
| `ruleset/types.ts`, `ruleset/v1.ts`, `ruleset/v2.ts`, `ruleset/index.ts` | F | `Ruleset` type; `RULESETS`; `getRuleset(version)`; `getEffectiveRuleset(at: Date)`; `rulesetChecksum(r)` |
| `time-windows.ts` | F | `periodKey(type, at)` → e.g. `2026-W42`, `2026-10`, `2026`, `S2026-5`; `periodRange(type, key)` → `{ start: Date, end: Date }`; `previousPeriodKey(type, key)`; `localDateKey(at)` |
| `scoring.ts` | F | pure: `levelForRp(rp, ruleset)`, `levelProgress(rp, ruleset)`, `applyCaps(candidate, priorEntriesInWindow, ruleset)`, `leagueScore(entries, ruleset)` → `{ total, components: Record<Stage, number> }`, `compareForRanking(a, b)` (tie-breakers), `rankEligibility(stats, ruleset)` → checklist |
| `ledger.ts` | F | `recordBuilderEvent(db, input)` → `{ event, created }`; `awardForEvent(db, eventId, { actorId, actorRole })` → ledger entry or null (cap reason); `reverseAward(db, entryId, { actorId, reason })`; `getLedger(db, userId, { from?, to?, limit, cursor })`; `getRpTotal(db, userId)`; `getStageTotals(db, userId, range?)` |
| `access.ts` | F | `isBuilderLeagueEnabled()`, `getViewerAccess(db, user\|null)` → `{ canUse, isAdmin, isPilot, tier }`, `requireBuilderLeagueUser(request)` for API routes (wraps `resolveCaller`), `requireBuilderLeagueAdmin(request)`, `builderNotFound()` |
| `membership.ts` | F | `getCommunityTier(db, userId)` (wraps #2 `getMemberTier`), `getDiscordIdentity(db, userId)` (reads #2 `community_connections`) |
| `privacy.ts` | F | `getPrivacy(db, userId)`, `updatePrivacy(db, userId, patch)`, `isPublic(privacy, surface)` |
| `audit.ts` | F | `recordModerationAction(db, { targetType, targetId, action, actorId, actorRole, reasonCodes, notes })` |
| `http.ts` | F | JSON envelope helpers (`ok(data, pagination?)`, `fail(status, code, details?)`), `parseCursor`, a per-user rate limiter (in-memory sliding window like `app/api/v1/votes/route.ts`) |
| `evidence.ts`, `moderation.ts`, `appeals.ts`, `evidence-storage.ts`, `peer-help.ts`, `backfill.ts` | B | see piece B |
| `leaderboards.ts`, `snapshots.ts`, `ranks.ts`, `passport.ts` | C | see piece C |
| `badges.ts`, `missions.ts`, `seasons.ts`, `rewards.ts`, `kill-board.ts`, `time-capsule.ts` | D | see piece D |
| `journey.ts`, `year-review.ts`, `community-wrapped.ts`, `share-links.ts`, `attribution.ts`, `render-jobs.ts`, `cron.ts` | E | see piece E |

Copy (EN and VI in one module, same pattern as `content/pages/*-copy.ts` + `toPageLocale`): `content/builder-league/<piece>-copy.ts`, one file per piece. No edits to `messages/*.json` except one `nav.builderLeague` key, which the orchestrator adds.

OpenAPI: each piece exports `xxxPaths` / `xxxSchemas` from `lib/builder-league/openapi/<piece>.ts`. Foundation creates all the files as empty exports and spreads them in `lib/openapi.ts`; pieces fill in only their own file.

UI: pages under `app/[locale]/builder-league/**`, components under `components/builder-league/<piece>/**`. Admin and moderation UI under `app/[locale]/studio/builder-league/**` (admin-gated server pages). Follow DESIGN.md: the star-atlas plate language, mono roman-numeral eyebrows, one accent per theme, static sky on inner pages, server-rendered facts, reduced-motion and no-JS fallbacks.

### Data model (`lib/db/builder-league-schema.ts`, re-exported from `lib/db/schema.ts`; migration `0003_builder_league.sql`)

All timestamps are integer epoch ms. JSON is drizzle json text. FKs reference `users.id` with `onDelete: "cascade"` except on audit/ledger tables, which keep the row (`set null` is not possible for a NOT NULL column, so ledger rows store `user_id` without an FK and deletion goes through the privacy-delete routine).

- `score_rulesets` (`version` PK, `effective_from`, `checksum`, `definition` json, `created_at`). Seeded by the migration with v1 and v2 checksums. The definition stays in code.
- `builder_projects` (`id`, `owner_user_id`, `name`, `slug` unique per owner, `summary`, `stage`, `product_id` → products nullable, `visibility`, `created_at`, `updated_at`, `archived_at`).
- `builder_privacy` (`user_id` PK, `leaderboard_public`, `passport_public`, `wrapped_public`, `peer_mentions_ok`, `backfill_opt_in`, `redact_financials` default 1, `updated_at`).
- `builder_pilot_members` (`user_id` PK, `added_by`, `note`, `added_at`).
- `activity_evidence` (`id`, `user_id`, `project_id`, `event_type`, `stage`, `title`, `summary`, `occurred_at`, `links` json, `private_object_keys` json, `counterparty_user_id`, `counterparty_confirmed_at`, `status`, `source`, `visibility`, `client_key` + unique(`user_id`, `client_key`), `decision_reason`, `decided_by`, `decided_at`, `event_id`, `created_at`, `updated_at`). Index (`status`, `created_at`) and (`user_id`, `occurred_at`).
- `builder_events` (`id`, `event_id` unique, `kind` `activity|reversal|correction|adjustment|rank|badge|backfill`, `subject_user_id`, `actor_user_id`, `actor_role`, `project_id`, `stage`, `event_type`, `source`, `external_event_id`, `dedupe_key` unique, `occurred_at`, `received_at`, `ruleset_version`, `verification`, `visibility`, `evidence_id`, `supersedes_event_id`, `payload` json, `provenance` json). Index (`subject_user_id`, `occurred_at`).
- `score_ledger` (`id`, `user_id`, `event_id`, `award_type`, `stage`, `rp` signed int, `ruleset_version`, `dedupe_key` unique, `reverses_entry_id`, `reason`, `occurred_at`, `created_at`). Index (`user_id`, `occurred_at`) and (`occurred_at`).
- `builder_moderation_actions` (`id`, `target_type`, `target_id`, `action`, `actor_id`, `actor_role`, `reason_codes` json, `notes`, `created_at`).
- `evidence_appeals` (`id`, `evidence_id`, `user_id`, `reason`, `status`, `resolution`, `resolved_by`, `created_at`, `resolved_at`).
- `league_snapshots` (`id`, `board`, `period_type`, `period_key`, `revision`, `status` `provisional|final`, `ruleset_version`, `watermark_at`, `event_hash`, `entries` json, `supersedes_id`, `created_at`); unique(`board`, `period_type`, `period_key`, `revision`).
- `rank_awards` (`id`, `user_id`, `rank`, `ruleset_version`, `checklist` json, `awarded_by`, `event_id`, `awarded_at`, `frozen_at`).
- `mentor_nominations` (`id`, `nominee_user_id`, `mentor_user_id`, `rank`, `year`, `note`, `created_at`); unique(`nominee_user_id`, `mentor_user_id`, `rank`, `year`).
- `badge_awards` (`id`, `user_id`, `badge_key`, `season_key` default `''`, `event_ids` json, `awarded_at`, `revoked_at`, `revoke_reason`); unique(`user_id`, `badge_key`, `season_key`).
- `season_enrollments` (`user_id`, `season_key`, `track`, `goal`, `joined_at`); PK(`user_id`, `season_key`).
- `reward_items` (`id`, `key` unique, `kind`, `title` json {en,vi}, `description` json, `eligibility` json, `inventory`, `budget_note`, `available_from`, `available_until`, `active`, `created_at`, `updated_at`).
- `reward_claims` (`id`, `reward_id`, `user_id`, `period_key`, `status` `requested|approved|rejected|redeemed|expired|cancelled`, `note`, `decided_by`, `decided_at`, `expires_at`, `created_at`, `updated_at`); unique(`reward_id`, `user_id`, `period_key`).
- `time_capsule_entries` (`id`, `user_id`, `year`, `kind` `intent|reflection`, `body`, `visibility`, `version`, `created_at`); unique(`user_id`, `year`, `kind`, `version`).
- `yearly_snapshots` (`id`, `user_id`, `year`, `version`, `status` `provisional|final`, `ruleset_version`, `data` json, `provenance` json, `hidden_scenes` json, `created_at`); unique(`user_id`, `year`, `version`).
- `community_wrapped_snapshots` (`id`, `year`, `version`, `status`, `data` json, `created_at`); unique(`year`, `version`).
- `builder_share_links` (`id`, `token_hash` unique, `user_id`, `kind` `passport|year_review`, `year`, `created_at`, `revoked_at`).
- `share_attributions` (`id`, `share_link_id`, `kind` `visit|signup|paid`, `user_id`, `utm` json, `visitor_hash`, `created_at`).
- `render_jobs` (`id`, `user_id`, `year`, `snapshot_id`, `format` `9x16|16x9`, `dedupe_key` unique, `status` `queued|claimed|done|failed|expired`, `attempts`, `locked_until`, `output_key`, `error`, `expires_at`, `created_at`, `updated_at`).

Private evidence files go in R2 binding `BUILDER_EVIDENCE` (buckets `nlb-builder-evidence` / `nlb-builder-evidence-staging`, no public access) under the key `evidence/{userId}/{evidenceId}/{uuid}.{ext}`. They are read only through an authorised route. Render outputs are stored under `renders/{userId}/{year}/{jobId}.mp4` in the same bucket.

### API (`/api/v1/builder-*`, additive, documented in OpenAPI)

Auth uses `resolveCaller` with scopes `builder:read` / `builder:write` (session cookie, API key, or MCP delegation). Admin routes require a session with `role = admin`.

| Route | Piece |
|---|---|
| `GET/PATCH /api/v1/builder-me` (profile, level, rank, privacy) | C |
| `GET/POST /api/v1/builder-evidence`, `GET/PATCH /api/v1/builder-evidence/{id}` (withdraw/edit while submitted), `POST /api/v1/builder-evidence/{id}/appeal`, `POST /api/v1/builder-evidence/{id}/confirm` (counterparty), `GET /api/v1/builder-evidence/{id}/files/{key}` | B |
| `GET /api/v1/builder-admin/queue`, `POST /api/v1/builder-admin/evidence/{id}/decision`, `POST /api/v1/builder-admin/ledger/{entryId}/reverse`, `GET/POST /api/v1/builder-admin/pilot`, `POST /api/v1/builder-admin/backfill` | B |
| `GET /api/v1/builder-projects`, `POST /api/v1/builder-projects` | B |
| `GET /api/v1/builder-rankings?board&period&key` | C |
| `GET /api/v1/builder-passport/{userId}` (public, consent-filtered) | C |
| `POST /api/v1/builder-admin/nominations`, `POST /api/v1/builder-admin/snapshots/finalize` | C |
| `GET /api/v1/builder-badges`, `GET /api/v1/builder-missions`, `GET/POST /api/v1/builder-seasons`, `GET /api/v1/builder-rewards`, `POST /api/v1/builder-rewards/{id}/claim`, `GET/POST /api/v1/builder-time-capsule`, admin `.../builder-admin/rewards/**` | D |
| `GET /api/v1/builder-journey`, `GET /api/v1/builder-year/{year}`, `POST /api/v1/builder-year/{year}/share`, `GET /api/v1/builder-wrapped/{year}` (community), `POST /api/v1/builder-year/{year}/render`, renderer `GET/POST /api/v1/builder-admin/render-jobs/**` | E |

## Pieces

| Piece | Depends on | Exclusive files |
|---|---|---|
| **F Foundation** | — | `lib/db/builder-league-schema.ts`, one re-export line in `lib/db/schema.ts`, `drizzle.config.ts`, `drizzle/migrations/0003_*` (provisional number until #2 lands), `lib/builder-league/{types,ruleset/**,time-windows,scoring,ledger,access,membership,privacy,audit,http}.ts`, `lib/builder-league/openapi/*.ts` (empty stubs) + spread in `lib/openapi.ts`, `content/builder-league/*-copy.ts` (empty stubs), `lib/env.ts` + `cloudflare-env.d.ts` + `wrangler.jsonc` + `.dev.vars.example` (flag, R2 binding), policy reconciliation in `content/policies/{community-overview,membership-tiers,ship-policy,contributor-policy}.ts`, `docs/builder-league-adr.md`, tests `tests/builder-league/{scoring,time-windows,ledger,ruleset,access}.test.ts` |
| **B Evidence & moderation** | F | `lib/builder-league/{evidence,moderation,appeals,evidence-storage,peer-help,backfill,projects}.ts`, `app/api/v1/builder-evidence/**`, `app/api/v1/builder-projects/**`, `app/api/v1/builder-admin/{queue,evidence,ledger,pilot,backfill}/**`, `app/[locale]/builder-league/evidence/**`, `app/[locale]/studio/builder-league/{page.tsx,moderation/**}`, `components/builder-league/evidence/**`, `components/builder-league/moderation/**`, `content/builder-league/evidence-copy.ts`, `lib/builder-league/openapi/evidence.ts`, `scripts/builder-league/backfill-*.ts`, `tests/builder-league/{evidence,moderation,peer-help,backfill}*.test.ts` |
| **C Rankings & passport** | F | `lib/builder-league/{leaderboards,snapshots,ranks,passport}.ts`, `app/api/v1/{builder-me,builder-rankings,builder-passport}/**`, `app/api/v1/builder-admin/{nominations,snapshots}/**`, `app/[locale]/builder-league/{page.tsx,opengraph-image.tsx,leaderboards/**,settings/**}`, builder tab in `app/[locale]/leaderboards/**`, passport section in `app/[locale]/builders/[id]/**`, `components/builder-league/{home,leaderboard,passport}/**`, `content/builder-league/{home,leaderboard,passport}-copy.ts`, `lib/builder-league/openapi/rankings.ts`, `tests/builder-league/{leaderboards,snapshots,ranks,passport}*.test.ts` |
| **D Badges, missions, seasons, rewards** | F | `lib/builder-league/{badges,missions,seasons,rewards,kill-board,time-capsule}.ts`, `app/api/v1/builder-{badges,missions,seasons,rewards,time-capsule}/**`, `app/api/v1/builder-admin/rewards/**`, `app/[locale]/builder-league/{badges,missions,seasons,rewards,kill-board,ship-relay,time-capsule}/**`, `app/[locale]/studio/builder-league/rewards/**`, `components/builder-league/{badges,missions,seasons,rewards,relay}/**`, `content/builder-league/{badges,missions,seasons,rewards}-copy.ts`, `lib/builder-league/openapi/progression.ts`, tests for these |
| **E Journey, Year in Review, Wrapped, video** | F (+ reads C/D through exported functions after they land) | `lib/builder-league/{journey,year-review,community-wrapped,share-links,attribution,render-jobs,cron}.ts`, `app/api/v1/builder-{journey,year,wrapped}/**`, `app/api/v1/builder-admin/render-jobs/**`, `app/[locale]/builder-league/{journey,year}/**`, `app/[locale]/wrapped/**` (public Community Wrapped + shared Year pages), `components/builder-league/{journey,year-review,wrapped}/**`, `content/builder-league/{journey,year-review,wrapped}-copy.ts`, `lib/builder-league/openapi/journey.ts`, `scripts/builder-league/render-year-video.ts` + its HyperFrames template under `scripts/builder-league/render-template/**`, `.github/workflows/builder-league-render.yml`, tests for these |
| **I Integration** (orchestrator) | B–E | `lib/db/schema.ts` rebase, `worker.ts` cron hook, `messages/*.json` nav key, `components/site/**` nav entry, `app/sitemap.ts`, `app/robots.ts`, `app/llms*.txt`, `lib/markdown/page-paths.ts`, `lib/discovery/**`, `lib/structured-data.ts`, `docs/**`, Playwright E2E `tests/e2e/**` + `playwright.config.ts` |

## Validation

Each piece runs `npm run type-check`, `npm run lint` and `npx vitest run tests/builder-league`. The integration step runs the full `npm test`, `npm run build:worker`, Playwright at 1440×900, 768×1024, 375×812 and 320 px in EN/VI and light/dark, and the discovery check script from REVIEW.md.

## Rollback

`BUILDER_LEAGUE_ENABLED=false` hides every surface. The migration is additive (new tables only); leaving it in place is safe. Policy copy reverts with a code revert.
