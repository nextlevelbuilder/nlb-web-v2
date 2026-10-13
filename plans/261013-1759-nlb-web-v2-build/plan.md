# Plan — nlb-web-v2 build (M1 + M2)

Contract: `../reports/bootstrap-261013-1759-brainstorm-contract.md` (outcome, constraints, non-goals, acceptance).
Status: in progress · Mode: cook --auto

| # | Phase | Owner files | Depends | Status |
|---|-------|-------------|---------|--------|
| 1 | Scaffold from nlb-web (Next 16 + OpenNext + wrangler.jsonc D1/R2/KV/AI/Queue) | root config, `app/`, `lib/`, `components/` | — | pending |
| 2 | D1 schema (sqlite-core) + drizzle migrations + `db.batch()` port + tests | `lib/db/*`, `lib/domain/*`, `drizzle/`, `tests/` | 1 | pending |
| 3 | Constellation design system, theme (system/light/dark, no flash), i18n EN default + VI detect | `app/globals.css`, `components/`, `messages/` | 1 | pending |
| 4 | Port every page with new design + harvested content + policies | `app/[locale]/*`, `components/sections/*` | 2,3, harvest | pending |
| 5 | Blog: widget blocks + registry + `/api/v1/blog/*` + OpenAPI (additive) | `lib/blog/*`, `app/api/v1/blog/*`, `app/[locale]/blog/*` | 2 | pending |
| 6 | Toolkits: blog CLI commands + MCP tools (branch `feat/blog-management`) | `nlb-directory-toolkits/packages/*` | 5 contract | pending |
| 7 | Courses (M2): videos + entitlements, Stream signed tokens, Polar product per video | `lib/courses/*`, `app/[locale]/courses/*`, `app/api/courses/*` | 2 | pending |
| 8 | Neon→D1 migration (dump→convert→batch import→verify 36 tables) | `scripts/migrate/*` | 2 | pending |
| 9 | Provisioning script + GH Actions + CF resources/secrets/deploy (workers.dev), zone add + DNS import | `scripts/provision-cloudflare.sh`, `.github/workflows/*`, `wrangler.jsonc` | 1 | pending |
| 10 | Verify: typecheck, lint, tests, opennext build; report | — | all | pending |

Acceptance: see contract. Non-goals: custom domains, Polar webhook switch, NS change (after user changes NS).
