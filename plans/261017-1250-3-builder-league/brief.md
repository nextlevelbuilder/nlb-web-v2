# Builder League — confirmed handoff brief (issue #3)

Confirmed by the user on 2026-10-17. This brief is the delivery contract; do not shrink, swap or extend it silently.

## Objective

Deliver all of P0→P4 from issue #3 in nlb-web-v2 and deploy to production with the Builder League feature flag OFF (admins and opted-in pilot members only).

## Done means

1. ADR plus child issues for P0..P4 (and API) linked to #3; #3 stays the parent checklist.
2. Versioned ruleset v2 applied as effective policy: reconciled EN/VI policy copy with an effective date and migration notice.
3. D1 schema: append-only `builder_events`, `activity_evidence`, `score_ledger`, `score_rulesets`, `builder_projects`, identity mappings, privacy preferences, moderator audit trail; idempotency keys; migration tests.
4. Community membership entitlement derived from commerce (never from org membership); Discord OAuth account linking coordinated with #2.
5. Evidence form, moderation queue and appeal path; API/agents cannot self-approve; private evidence in protected R2.
6. RP, level and rank gate; builder leaderboards weekly/monthly/yearly (Asia/Ho_Chi_Minh boundaries) for each stage, overall, Rising Builders and newcomers; provisional/final snapshots with revisions.
7. `/builder-league`, consented Builder Passport on `/builders/[id]`, OG cards.
8. Badges, missions, 8-week seasons, reward catalogue and claims, Ship Relay, Kill Board, Time Capsule.
9. Journey timeline plus constellation (no-JS and reduced-motion fallbacks); immutable yearly snapshot.
10. Year in Review with share/OG, Community Wrapped (small-cohort suppression), Dec 31 finalize, UTM/referral attribution.
11. Video: idempotent render job queue plus a renderer CLI that runs outside the Worker.
12. Additive `/api/v1/builder-*` with OpenAPI, additive MCP/CLI contracts, sitemap/llms/markdown twins/SEO surfaces.
13. Opt-in 2026 backfill from records already migrated to D1 (products, revisions, moderation decisions), labelled with source `legacy-d1-import`, original date and import date. (User clarified 2026-10-17: the new site already runs on D1; Neon is not a source.)
14. Unit, integration and E2E tests at 1440×900, 768×1024, 375×812 and 320 px, EN/VI, light/dark; typecheck, lint and build green.
15. Operations runbook; clean isolated review; PR merged; D1 backup → remote migration → production deploy; issue labelled `shipped`.

## Out of scope

Turning on public ranking; cash or cash-convertible RP; new paid infrastructure; writes to the legacy Neon database; Polar→Telegram onboarding (#2).

## Constraints

D1/Drizzle, Workers + OpenNext, hi@ account pin; Cloudflare credentials from `nlb-web-v2/.env`; follow DESIGN.md and REVIEW.md; never print or commit secrets; back up D1 before any remote migration.

## Defaults decided on the user's behalf (overridable)

- Video renderer: job queue in D1/R2 plus a Node renderer CLI run from GitHub Actions or an admin machine (the video question was left unanswered).
- Private evidence storage: a new private R2 bucket `nlb-builder-evidence` (prod) and `nlb-builder-evidence-staging`.
- Policy effective date: the production deploy date; prior RP balances carry over unchanged.
- Pilot access: `users.role = admin` plus an allowlist table managed by admins; members opt in to public visibility separately.
