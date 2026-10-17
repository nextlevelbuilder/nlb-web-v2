# Bootstrap contract — nextlevelbuilder.io v2

Mode: `ak:bootstrap --auto`. Source of truth for scope: advisor report §11a (`advisor-261013-1240-nlb-web-v2-redesign.md`) plus the decisions below, which supersede it where they differ.

## Outcome
A public repo `nextlevelbuilder/nlb-web-v2` that reproduces every feature of the old site (`/Volumes/GOON/www/nlb/nlb-web`) with the chosen "Constellation" design, runs fully on the Cloudflare account hi@nextlevelbuilder.io with D1 instead of Neon, deploys through GitHub Actions, and adds Blog (widget page-builder, manageable by API/CLI/MCP) and Courses (per-video purchase).

## Inputs
- Old app (read-only source): `/Volumes/GOON/www/nlb/nlb-web`
- Design: `plans/reports/mockups/06-constellation.html` + `content-spec-v2.md` (prices, FOMO rules, i18n, theme, motion, AX rules)
- Content harvest: `plans/reports/researcher-261013-1800-v2-content-harvest.md` + `v2-content-harvest.json` (AgentKit, Dewee, ReelCrew, founders, partners, toolkits, featured Build-with-Us products, policies, socials, page-builder reference)
- Toolkits (contract consumer): `/Volumes/GOON/www/nlb/nlb-directory-toolkits`

## Scope
1. Port all routes, APIs, auth flows, Polar checkout/webhook queue, R2 media, `/go` KV redirects, Workers AI, Resend, Turnstile, Discord, `llms.txt`, OpenAPI.
2. Drizzle schema re-targeted to D1 (sqlite-core): uuid→text, timestamp→integer ms, jsonb→text JSON; replace `db.transaction()` with `db.batch()`.
3. `/api/v1` paths, payloads and OpenAPI document unchanged; API keys stay SHA-256 so existing keys keep working.
4. Constellation design on every page; EN default with VI auto-detect (next-intl); system/light/dark theme without flash; reduced-motion fallback.
5. Content: AgentKit (ex-ClaudeKit), Dewee (ex-GoClaw), ReelCrew, 3 founders, partners DIGITOP.AI / 200LAB.IO / EGANY.COM, reworked "Launch from your terminal" from the real toolkits plus featured member products, full Terms/Privacy/Refund/Cookie policies, social links.
6. Blog: posts stored as typed widget blocks (page-builder style) rendered by a widget registry; managed via `/api/v1/blog/*` (API key auth), documented in OpenAPI, plus CLI commands and MCP tools added to the toolkits contract surface.
7. Courses (M2): Cloudflare Stream with signed URLs, one Polar product per video, entitlement per purchase, active VIP sees all.
8. Neon→D1 migration script: dump, convert, batched import, verify row counts + id hash for all 36 tables, rerunnable, backup first.
9. CI/CD: GitHub Actions test → D1 migrations → deploy; `dev`→staging, `main`→production.
10. Cutover prep only: workers.dev deploys, zone added (pending) with DNS imported. Nameserver change at Spaceship is done by the user; custom domains, final sync and Polar webhook switch happen after that.

## Decisions and assumptions
- `BETTER_AUTH_SECRET` was lost; a new one was generated and saved to `.env`. Every user signs in again once after cutover. API keys are unaffected.
- Courses access: VIP only, not Premium (advisor open question; changeable in one constant).
- Primary CTA goes to Polar checkout for the selected plan, not only to `#pricing`.
- FOMO seat counts come from real active subscription counts against plan caps (30 / 10); the countdown date is a config value; activity toasts use real recent events or are disabled when none exist (no fabricated activity in production).
- `cf` CLI for one-off operations, wrangler in CI.

## Non-goals
Changing payment provider or auth provider, rewriting the toolkits, hard DRM, mobile apps, deleting anything in the Digitop Cloudflare account or Neon.

## Acceptance criteria
- Typecheck, lint, unit tests and build pass in CI.
- Staging and production workers on hi@ respond on workers.dev; every old public route returns 200 with the new design; `/api/v1` contract tests pass with an existing API key.
- Migration verify reports equal row counts and id hashes for 36/36 tables.
- Blog post created via API and via MCP renders with widgets on `/blog/<slug>`.
- Courses: unpaid user gets 403 on a video token; purchaser or active VIP gets a playable signed URL.
- Lighthouse a11y ≥ 95 on home; no horizontal scroll from 320 px.

## Definition of done
M1 and M2 deployed to staging and production workers.dev on hi@, verified as a real user would reach them; zone prepared; user handed exact nameserver instructions. Domain cutover completes after the user changes nameservers.

## Stop and ask
Verify mismatch after two runs; missing Cloudflare token permissions; any deletion on Digitop or Neon; any change to the `/api/v1` contract.
