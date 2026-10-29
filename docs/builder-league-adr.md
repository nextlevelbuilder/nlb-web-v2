# ADR: Builder League scoring foundation

Status: accepted · Date: 2026-10-17 · Issue: nextlevelbuilder/nlb-web-v2#3

## Context

The legacy RP table (`content/policies/membership-tiers.ts` up to 2026-10-13) counted posts and activity, never checked evidence, and disagreed with itself between the overview and the tiers page. The Builder League scores real progress (validated problems, working software, shipped products, help to others) and shows it on leaderboards, a passport, seasons and a yearly review. Scores must be explainable, fair to people who joined late, and impossible to farm with an API key or an agent.

The runtime is a Cloudflare Worker on D1 (SQLite). D1 has no interactive transactions: `db.batch([...])` is the only atomic unit, and every query is a network round trip.

## Decision

### Three independent axes

| Axis | Source | Changes |
|---|---|---|
| **Level** (1–100) | lifetime RP, curve `round(50·n^1.6)` | only goes up |
| **Rank** (Apprentice → Legend) | RP plus rank gates (tenure, SHIP count or Contributor weeks, feedback, help, nominations) | never downgraded automatically |
| **League Score** (per week / month / season / year) | weighted stage components: VALIDATE 35, BUILD 20, SHIP 35, CONTRIBUTE 10 | recomputed per period |

Membership type (Premium / VIP, from Polar) only gates access. It never changes RP, rank or League Score.

League components are normalised to 0–100 against per-period caps before weighting, so a single huge SHIP week cannot hide an empty VALIDATE stage. Stage boards rank the raw capped component, so specialists still top their own board. Ties break on verified event count, then the earlier time the score was reached, then `userId`.

### Append-only ledger

- `builder_events` records what happened; `score_ledger` records RP. Neither is updated or deleted.
- Corrections are new rows: a reversal is a negative ledger entry linked to the original (`reverses_entry_id`), plus a moderation audit row in the same batch.
- Every ledger row stores its `ruleset_version`, so history is explained by the rules that applied when it happened.

Owner: [`lib/builder-league/ledger.ts`](../lib/builder-league/ledger.ts).

### Dedupe and caps

- Event and ledger dedupe keys are `sha256(source | external id | subject | award type)` with a unique index. Inserts use `onConflictDoNothing`, so replaying a webhook, a backfill or a retried request is a no-op.
- Once-per-project events dedupe on the project instead of the event.
- Caps (per week / month / year / lifetime, per user / project / counterparty) are enforced with deterministic slot keys in `score_cap_slots`: slot `n` of a window is a unique row inserted in the same batch as the ledger entry. Two concurrent awards cannot both take the last slot; the loser retries and is refused once the window is full. A reversal frees its slots.
- Residual race: two different awards may read the same free slot and both retry; the loop is bounded (8 attempts) and then answers `409 award_contention`. No over-award is possible, only a retry.

### Verification levels

`self_reported` < `peer_confirmed` < `moderator_verified` = `system_verified`. Each event type declares the level it needs; every SHIP event and every award of 25 RP or more needs a moderator or the system. API keys and MCP agents may only submit `self_reported` activity, and only moderators, admins and the system may award RP.

### Time zone

All windows use fixed UTC+7 (`Asia/Ho_Chi_Minh`, no DST): ISO weeks starting Monday 00:00 local, calendar months and years in local time, and 8-week seasons counted from Monday 2026-10-19. Owner: [`lib/builder-league/time-windows.ts`](../lib/builder-league/time-windows.ts).

### Versioned rulesets

- Rulesets live in code ([`lib/builder-league/ruleset/`](../lib/builder-league/ruleset/)). `v1` is the legacy table, used to score pre-v2 backfill; `v2` is the current contract.
- `v2` is effective from `2026-10-17T00:00:00+07:00` (`V2_EFFECTIVE_FROM` in [`ruleset/v2.ts`](../lib/builder-league/ruleset/v2.ts)), the merge date of PR #17. The owner fixed this date on purpose, and it does not follow later deploys: moving it would change which ruleset scores events already in the ledger, which means rescoring history. `tests/builder-league/ruleset.test.ts` pins the value and the v1/v2 boundary.
- A published ruleset is never edited; a change ships as `v3`. The migration seeds `score_rulesets` with each version's checksum (sha256 of the canonical definition, excluding `effectiveFrom`), and tests fail if code and seed disagree.
- Policy copy (RP table, rank conditions, effective-date notice) is generated from the ruleset by [`ruleset/policy-text.ts`](../lib/builder-league/ruleset/policy-text.ts). RP earned before the effective date is kept; history is never rewritten.

### Privacy defaults

Everything is private by default: leaderboard, passport, wrapped and peer mentions are opt-in, and financial details are redacted unless the member turns that off. Owner: [`lib/builder-league/privacy.ts`](../lib/builder-league/privacy.ts).

### Flag and pilot

`BUILDER_LEAGUE_ENABLED` (wrangler var: `"false"` in production, `"true"` on staging). While it is off, only admins and paid members on `builder_pilot_members` can use the league, and everyone else gets 404. Evidence files go to the private R2 bucket bound as `BUILDER_EVIDENCE`. Owner: [`lib/builder-league/access.ts`](../lib/builder-league/access.ts).

### D1 constraints

- Multi-row changes go through `db.batch`; idempotency comes from unique keys, not from read-then-write.
- Totals are SQL aggregates over indexed `(user_id, occurred_at)`; leaderboards read periodic snapshots (`league_snapshots`) instead of scanning the ledger per request.
- The migration is additive (new tables plus the ruleset seed), so rolling back the code leaves a safe, unused schema.

## Rejected alternatives

- **Mutable RP balance column.** Fast to read, but impossible to audit or recompute when a rule changes, and racy without transactions.
- **One blended score for everything.** Mixes lifetime status with competition: late joiners could never compete, and ranks would fall with inactivity.
- **Rank from membership tier.** Paying more would buy status, which contradicts "No Ship, No Seat".
- **Server-local time zone or UTC windows.** Weeks would close at 07:00 Vietnam time on Monday; members would see their Sunday-night ship land in the wrong week.
- **Cap checks by counting rows before insert.** Two concurrent requests both see room and both award. Slot rows make the database enforce the cap.

## Consequences

- Every scoring change needs a new ruleset version, a seed row and an effective date.
- Reading a member's total costs an aggregate query; snapshots keep public pages cheap.
- Moderation is required for most RP, so the moderation queue is on the critical path for a good member experience.
- Membership tier (`getMemberTier`, customers linked through `customers.user_id`) and the Discord identity (`community_connections`) are read through one read-only adapter ([`lib/builder-league/membership.ts`](../lib/builder-league/membership.ts)).
