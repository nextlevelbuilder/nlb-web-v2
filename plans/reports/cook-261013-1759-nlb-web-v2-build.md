# Cook report: nlb-web-v2 build (M1 + M2)

Date: 2026-10-13 (Asia/Saigon). Contract: `bootstrap-261013-1759-brainstorm-contract.md`. Plan: `../261013-1759-nlb-web-v2-build/plan.md`.

## Outcome

nlb-web-v2 is live on the hi@ Cloudflare account (`7ac87c90789159ae1b10b7d78f5dcc08`) at the workers.dev URLs. Both environments run on D1 with the Neon data migrated and verified.
- Production: https://nextlevelbuilder-web.hi-7ac.workers.dev
- Staging: https://nextlevelbuilder-web-staging.hi-7ac.workers.dev

The real domains still point at the old site on the Digitop account. Three things are blocked on Cloudflare permissions only the account owner can grant: adding the zone, deploying from CI, and Stream.

## Done

| Area | State |
|---|---|
| Site port, Constellation design | All pages restyled. Home follows `mockups/06-constellation.html` and `content-spec-v2.md` with harvested content. 6 community policies plus Terms/Privacy/Refund/Cookies in EN and VI. The T&C modal is now a checkbox. |
| i18n | EN unprefixed by default; VI under `/vi`, detected from the cookie, then Accept-Language. Canonicals, hreflang, sitemap and markdown twins all follow EN-default. |
| Theme / motion | System, light and dark modes with no flash (`next-themes`, key `nlb-theme`), plus a reduced-motion fallback. |
| FOMO / CTA | Seats come from real active subscriptions against caps of 30/10. The countdown comes from config. Toasts are real or not shown. The primary CTA opens Polar checkout. |
| Analytics | GA4 `G-MJ62DM021G` loads only without DNT/GPC (`components/analytics/google-analytics-consent-aware.tsx`). |
| Blog | Widget page-builder posts. `/api/v1/blog/*` uses API keys (SHA-256) and is versioned with optimistic concurrency, idempotency keys and a 200 KB cap. OpenAPI was extended additively. **Verified on staging:** one post created via REST and one via the toolkits MCP (`blog_create_post` + `blog_publish_post`), both rendering widgets at `/blog/<slug>`. Both smoke posts were archived afterwards, and the temporary API key was deleted (it now returns 401). |
| Toolkits | Branch `feat/blog-management` pushed (5 commits): contracts, 11 `nlb blog` CLI commands, 11 MCP tools, tests and docs. Not merged to main. |
| Courses (M2) | Videos, entitlements, a Polar product per video, Stream RS256 signed tokens, and VIP-only access via a constant. Unpaid → 403, purchaser or VIP → 200 (tests). Unauthenticated → 401 on staging. Stream itself is a documented manual step. |
| Migration | `scripts/migrate/run-migration.ts`: Neon read-only snapshot → D1, with a backup before every import and verification by count plus PK hash. 43/43 tables verified on local, staging and production. `jwks_keys` were re-keyed on both environments. |
| Infra | `scripts/provision-cloudflare.sh` (idempotent resources and secrets). D1, KV, queues, R2 and Turnstile were created on hi@. Secrets are set for staging (as before) and production (21). Production and staging are deployed. |
| CI | `.github/workflows/ci-deploy.yml` runs test → D1 migrate → deploy (`dev`→staging, `main`→prod). The lockfile was regenerated with npm 10 so `npm ci` passes on Node 22. Run 38402974830: the test job passes; the deploy job fails at D1 migrate with `code: 7403` (token lacks D1), as expected until the token is expanded. |
| Quality | tsc clean. ESLint: 0 errors (94 warnings). Vitest: 626 passed, 2 skipped. `opennextjs-cloudflare build` succeeds. Lighthouse a11y on production: 100 on `/`, `/build-with-us`, `/vi/build-with-us`, `/policies/terms`, `/blog`, `/courses` and a blog post. No horizontal scroll at 320 or 375 px on 11 key routes. |

Fixes found during live verification (this session):
- **Markdown twins and `/llms-full.txt` were served from the old site.** Service-binding requests carry no `Host`, so OpenNext treated next-intl's absolute rewrite as external and fetched the page over the public internet. The fix pins `Host` in `lib/markdown/page-markdown.ts`. All 10 policy `.md` pages and `/llms-full.txt` now return 200 with v2 content.
- **CTA text colour was dropped.** tailwind-merge was removing the CTA button's text colour (contrast 1.34). The custom font sizes are now registered in `lib/utils.ts`.
- **Accessible names didn't match visible labels** on the vote buttons and product cards.
- **Production secrets step targeted no environment.** `provision-cloudflare.sh secrets production` now passes `--env=""`, wrangler's explicit top-level environment.

Commits on `dev` (pushed): 894d9e1, 851306d, 9b2fbe9, acc62ce, 2f205c7, a7780eb, 7ef747c, 72af432, eef8dbd, 73cebfc, 8572e96, 999fb53, 6137373, 6dc192d, 892ab51, 9927c0a, d497636, f0e6e94.

## Needs Cloudflare permissions (owner action)

1. **CI deploy token.** Set the GitHub secret `CLOUDFLARE_API_TOKEN` on hi@ with: Workers Scripts Edit, D1 Edit, Workers KV Storage Edit, Queues Edit, Workers R2 Storage Edit, Account Settings Read. Then set it non-echo:
   `gh secret set CLOUDFLARE_API_TOKEN -R nextlevelbuilder/nlb-web-v2` (paste at the prompt). Also set `CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08`.
   Until then, the deploy job in CI fails. Deploys work manually (see below).
2. **Zone.** The token needs Account › Zone: Edit (`zone.create`) plus Zone › DNS: Edit. Without these, the zone add was refused, so **no nameservers exist yet**.
3. **Stream.** Enable it on the dashboard, then create a signing key with a Stream: Edit token (see `docs/deployment-guide.md#courses-cloudflare-stream`).

## Exact commands

All wrangler calls: `env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08 npx wrangler --config <repo>/wrangler.jsonc ...`, run from outside the repo, because wrangler auto-loads `.env`.

```bash
# Provisioning (idempotent)
scripts/provision-cloudflare.sh resources
scripts/provision-cloudflare.sh secrets staging
scripts/provision-cloudflare.sh secrets production

# Manual deploy (from repo; deploy from a neutral dir)
NEXT_PUBLIC_APP_URL=https://staging.nextlevelbuilder.io NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFVjUpt2OL12upHT npx opennextjs-cloudflare build
#   ... wrangler deploy --env staging
NEXT_PUBLIC_APP_URL=https://nextlevelbuilder.io NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFVjTy75wVNVWXvG npx opennextjs-cloudflare build
#   ... wrangler deploy --env=""

# Migration (Neon read-only -> D1). Final cutover sync: stop writes on old site, then:
npx tsx scripts/migrate/run-migration.ts dump
npx tsx scripts/migrate/run-migration.ts convert
npx tsx scripts/migrate/run-migration.ts import --target production --confirm-production
npx tsx scripts/migrate/run-migration.ts verify --target production --confirm-production
npx tsx scripts/migrate/run-migration.ts rekey-jwks --target production --confirm-production

# Zone (after token in Needs Cloudflare permissions item 2)
CF_ZONE_TOKEN=<token> scripts/dns/setup-zone-on-hi-account.sh   # jump_start=false, imports 13 records, prints NS
```

### Cutover after the nameserver change

These steps are in `docs/deployment-guide.md#domain-cutover`. They were not done, per the constraints.
1. Change the nameservers at Spaceship.
2. Attach the custom domains: `nextlevelbuilder.io` and `www` to `nextlevelbuilder-web`, `staging` to `nextlevelbuilder-web-staging`.
3. Redeploy the `mcp.` and `ui-ux-pro-max-skill` workers on hi@.
4. Connect `cdn.` to `nlb-media-public`.
5. Run the final data sync.
6. Switch the Polar webhook.

## Flags for review

- **Socials:** the X handle `nextlevelbuilders` is unverified. Confirm it is the right account.
- **Legal:** the four legal pages and six policies are dated 2026-10-13 and need legal review (jurisdiction and contracting entity unspecified; refund is 30 days with Polar as MoR). The VI translations for AgentKit and DIGITOP copy are drafts.
- **Re-login:** `jwks_keys` were re-keyed because the old auth secret was unavailable, so existing sessions and tokens must sign in again after cutover.
- **Table count:** the contract said 36 tables, but the real Neon schema has 43. All 43 were migrated and verified.
- **Staging uses the production Polar token** because `.env` holds only one. Provide a sandbox token for staging if desired.
- **Digitop-hosted pieces:** the `mcp.` and `ui-ux-pro-max-skill` workers and the `cdn.` R2 bucket live on Digitop. Old R2 objects were not copied because the token cannot read them. Old KV was empty.
- **OAuth sign-in** (GitHub/Google) works only on the final domains, where the callbacks are registered. Email sign-in works on workers.dev.
- **Discord:** the secrets `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` and `DISCORD_PREMIUM_ROLE_ID` are not in `.env`, so role sync is inactive.
- **Courses behaviour (decisions taken):**
  - Archived videos stay playable for existing buyers, but the archived detail page returns 404.
  - `trialing` subscriptions do not grant access.
  - The price is locked once the Polar product exists.
  - After a refund, the user buys again through a new paid order.
- **FOMO seats** count only `active` subscriptions.
- **Toolkits:** the root CLI uses positional options. `nlb <cmd> --version` after a subcommand no longer prints the CLI version; `nlb --version` still does.
- **MCP allowlist:** the MCP server only allows `nextlevelbuilder.io`, `staging.nextlevelbuilder.io` and loopback, so it cannot reach workers.dev. The acceptance check ran through a temporary loopback proxy.
- **Upstream bug:** OpenNext `isExternal` treats a missing `Host` as external. Worth reporting upstream; the local fix stands regardless.

## Unresolved questions

- Who will create the expanded CI token and the zone token, and when will the nameservers change?
- Is the X handle `nextlevelbuilders` correct?
- Should staging get a Polar sandbox token?
