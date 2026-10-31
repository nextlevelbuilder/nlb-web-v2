# Deployment guide

nextlevelbuilder.io runs as two Cloudflare Workers on the **hi@nextlevelbuilder.io** account (`7ac87c90789159ae1b10b7d78f5dcc08`). Both are built with `@opennextjs/cloudflare`.

| Environment | Worker | Branch | workers.dev | Final domain |
|---|---|---|---|---|
| production | `nextlevelbuilder-web` | `main` | https://nextlevelbuilder-web.hi-7ac.workers.dev | nextlevelbuilder.io, www |
| staging | `nextlevelbuilder-web-staging` | `dev` | https://nextlevelbuilder-web-staging.hi-7ac.workers.dev | staging.nextlevelbuilder.io |

Each web Worker also serves the MCP server from [`packages/mcp`](../packages/mcp) at `/mcp`: https://nextlevelbuilder.io/mcp in production and https://staging.nextlevelbuilder.io/mcp on staging ([MCP server](#mcp-server)).

Bindings and resource ids live in [`wrangler.jsonc`](../wrangler.jsonc). Production is the top-level config, and staging is `env.staging`. What each binding is for: [system-architecture.md](./system-architecture.md#cloudflare-bindings).

## Wrangler access

Rules:
- **Always pin the account.** The shared wrangler OAuth login can also see the Digitop account, which must never be written to.
- **Unset the repo token.** Wrangler auto-loads `CLOUDFLARE_API_TOKEN` from `./.env`, and that token only covers R2 and zones. Run OAuth commands with the token unset, from outside the repo, passing the config explicitly.
- **Name the environment explicitly.** Use `--env=""` for production (wrangler's top-level environment) and `--env staging` for staging. Omitting `--env` is ambiguous when environments are defined.

Helper, the same pattern as `wr_project` in [`scripts/provision-cloudflare.sh`](../scripts/provision-cloudflare.sh):

```bash
REPO="$PWD"   # run from the repo root once
wr() { (cd "$(mktemp -d)" && env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08 \
  "$REPO/node_modules/.bin/wrangler" --config "$REPO/wrangler.jsonc" "$@"); }

wr whoami
wr secret list --env staging
```

## CI/CD

[`.github/workflows/ci-deploy.yml`](../.github/workflows/ci-deploy.yml):
- Every push and PR to `dev` or `main` runs type-check, lint and test for the web app, then builds, type-checks and tests the `packages/*` workspaces (`npm run build:packages`, `type-check:packages`, `test:packages`).
- A push to `dev` applies D1 migrations to staging, builds the packages and the staging web Worker (which includes the MCP server) and deploys it.
- A push to `main` does the same for production. The workflow file owns the env selection and the build-time `NEXT_PUBLIC_*` values.
- PR runs get no secrets.

Repository secrets:
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- The build-time `NEXT_PUBLIC_*` values the workflow reads: Polar product ids, the early-bird deadline, the Discord URL.

The deploy token needs these permissions on the hi@ account: **Workers Scripts: Edit, D1: Edit, Workers KV Storage: Edit, Workers R2 Storage: Edit, Account Settings: Read**. Set it without echoing: `gh secret set CLOUDFLARE_API_TOKEN -R nextlevelbuilder/nlb-web-v2`, then paste at the prompt. Until a token with D1 permission is set, the deploy job fails at the migrate step, and deploys are manual.

## Provisioning (idempotent)

```bash
scripts/provision-cloudflare.sh resources           # D1, KV, R2, Turnstile; writes ids and site keys into wrangler.jsonc
scripts/provision-cloudflare.sh secrets staging     # Worker secrets piped from .env (never echoed)
scripts/provision-cloudflare.sh secrets production
```

- The script owns the list of secrets it copies (`SECRET_KEYS`). It also derives `BETTER_AUTH_URL` (the environment's final URL), `TURNSTILE_SECRET_KEY` (from the widget) and copies `MCP_DELEGATION_SECRET` from `.env` like the other secrets. The in-worker MCP server signs its delegation assertions with it and the API verifies them with the same binding.
- Because `BETTER_AUTH_URL` is the final domain, OAuth sign-in works only there.
- Course video secrets (`CF_STREAM_API_TOKEN`, signing key, customer subdomain) are set by hand once Stream is enabled: [courses.md](./courses.md#one-time-setup-cloudflare-stream).
- Affiliate program: the `AFFILIATES_ENABLED` and `AFFILIATE_PAYOUTS_ENABLED` vars live in `wrangler.jsonc` (production `false`/`false`, staging `true`/`false`). Migration `0005_affiliate_program` must be applied before the deploy that ships it. Payout details are sealed with the existing `ONBOARDING_ENCRYPTION_KEY`; the click hash uses `TRAFFIC_HASH_SECRET`. Do not enable either flag in production before the launch gates in [affiliate-program-adr.md](./affiliate-program-adr.md#launch-gates) pass.
- Builder League: the `BUILDER_LEAGUE_ENABLED` var lives in `wrangler.jsonc` (`false` in production). The optional `BUILDER_INGEST_SECRET` (32+ characters, shared with the Discord bot) is set by hand with `wr secret put BUILDER_INGEST_SECRET --env <env>`; without it the bot uses an admin API key minted with the `builder:ingest` scope. The private evidence buckets `nlb-builder-evidence` and `nlb-builder-evidence-staging` are not in the provisioning script; create them once with `wr r2 bucket create <name>`. The render workflow ([`builder-league-render.yml`](../.github/workflows/builder-league-render.yml)) needs the repository secrets `NLB_API_BASE` and `NLB_RENDER_API_KEY` (an admin API key minted with the `builder:render` scope; full keys are refused, see the runbook). Operations: [builder-league-runbook.md](./builder-league-runbook.md).
- Staging runs Polar in sandbox (`POLAR_SERVER=sandbox` in `wrangler.jsonc`), so its Polar token, webhook secret and product ids must be sandbox values.
- Membership onboarding secrets (Discord, Telegram, `ONBOARDING_ENCRYPTION_KEY`) and the Telegram webhook registration: [membership-onboarding.md](./membership-onboarding.md#configuration).

## Database

- Schema: [`lib/db/schema.ts`](../lib/db/schema.ts). Migrations live in `drizzle/migrations` and are generated with `npm run db:generate`.
- Apply them with `npm run db:migrate:local`, `npm run db:migrate:staging` or `npm run db:migrate:production`. CI applies them on deploy, before the build, so migrations must be additive ([code-standards.md](./code-standards.md#database-d1)).
  - The staging and production npm scripts pin `--env=staging` and `--env=""` but call wrangler directly. Locally, prefer `wr d1 migrations apply DB --remote --env staging` or `--env=""` so the account pin and token rules above also apply.
- D1 rollback: `wr d1 time-travel restore DB --env=<env> --timestamp=<RFC3339>` (within 30 days).
- Neon → D1 data copy: [data-migration-neon-to-d1.md](./data-migration-neon-to-d1.md).

## Manual deploy

Use this while CI cannot deploy. `NEXT_PUBLIC_*` values are inlined at build time, so build with the target environment's values. They match the deploy job in the workflow and the `vars` in `wrangler.jsonc`:

```bash
# staging
NEXT_PUBLIC_APP_URL=https://staging.nextlevelbuilder.io NEXT_PUBLIC_TURNSTILE_SITE_KEY=<staging site key from wrangler.jsonc> \
  npm run build:worker
wr deploy --env staging

# production
NEXT_PUBLIC_APP_URL=https://nextlevelbuilder.io NEXT_PUBLIC_TURNSTILE_SITE_KEY=<production site key from wrangler.jsonc> \
  npm run build:worker
wr deploy --env=""
```

Also export the other `NEXT_PUBLIC_*` values the workflow sets (Polar product ids, early-bird deadline, Discord URL). `next build` also reads `.env*` files in the repo, so check that no stale `NEXT_PUBLIC_*` value there overrides your intent.

`npm run deploy:staging` (`--env=staging`) and `npm run deploy:production` (`--env=""`) build and deploy in one step with the environment pinned, but they do not apply the account pin, the token rule or the build-time values above.

Roll back a bad deploy with `wr deployments list --env=<env>`, then `wr rollback <version-id> --env=<env>`.

## MCP server

[`worker.ts`](../worker.ts) hands `/mcp`, `/sse`, `/message` and `/.well-known/oauth-protected-resource[/mcp]` to [`lib/mcp-worker-mount.ts`](../lib/mcp-worker-mount.ts), which runs `@nextlevelbuilder/mcp/http` before Next.js. Its calls back to this site (JWKS, delegated `/api/v1` requests) go to the Next.js handler in-process, because a Worker cannot reliably fetch its own hostname. It ships with every web deploy; `npm run build:worker` builds the packages first.

Configuration lives in the web Worker:
- `MCP_OAUTH_RESOURCE` (var): the canonical endpoint, `<site>/mcp`.
- `MCP_OAUTH_LEGACY_RESOURCES` (var, comma-separated): older resources that tokens are still issued and accepted for. Production lists `https://mcp.nextlevelbuilder.io/mcp`. A request on a legacy resource's host is served as that resource.
- `MCP_DELEGATION_SECRET` (secret): signs and verifies the `x-nlb-mcp-assertion` the MCP server sends to `/api/v1`. To rotate it, pipe a new value without printing it: `openssl rand -base64 48 | tr -d '\n' | wr secret put MCP_DELEGATION_SECRET --env staging`.

### `mcp.nextlevelbuilder.io` on the web Worker

Since 2026-10-29 the `mcp.nextlevelbuilder.io` custom domain is attached to `nextlevelbuilder-web`. Requests on that host are served as the legacy resource (`MCP_OAUTH_LEGACY_RESOURCES`), so existing tokens and discovery keep working. The domain was moved in one step with the Workers custom-domain API (`PUT /accounts/{account}/workers/domains` with `override_existing_origin: true`), which reassigns the hostname without a gap. To move it back, run the same call with `"service": "nlb-directory-mcp"`.

The old standalone Worker `nlb-directory-mcp` still exists with no domain attached, as a fallback. Delete it once authorized clients have been seen working on the new Worker.

The standalone entry ([`packages/mcp/wrangler.jsonc`](../packages/mcp/wrangler.jsonc)) remains for self-hosting; CI no longer deploys it. Protocol and OAuth details: [blog-and-agent-management.md](./blog-and-agent-management.md#mcp-server).

## npm packages

`@nextlevelbuilder/contracts`, `@nextlevelbuilder/cli` and `@nextlevelbuilder/mcp` are published by [`release-packages.yml`](../.github/workflows/release-packages.yml):
1. Bump `version` in all three `packages/*/package.json` to the same value and merge to `main`.
2. Push a tag `packages-v<version>` on that `main` commit.
3. The workflow builds, tests, packs and runs `npm publish --provenance` through npm trusted publishing (OIDC, no token).

Each package's trusted publisher on npmjs.com must name repository `nextlevelbuilder/nlb-web-v2` and workflow `release-packages.yml`. `workflow_dispatch` builds and packs without publishing.

## Media

Public media (product logos, screenshots, uploads) lives in the `MEDIA_PUBLIC` bucket under `public/`. Neither bucket has a custom domain or an r2.dev URL, so the app serves it at `/media/<key>` ([`app/media/[...key]/route.ts`](../app/media/[...key]/route.ts)). Uploads return a URL on the origin that received them.

## Seeding ecosystem listings

[`scripts/seed-ecosystem-products/`](../scripts/seed-ecosystem-products) publishes the NLB ecosystem tools through the normal path: draft, revision, submission, automated checks and an admin approval. It uploads the committed assets to R2 under content-hashed keys and skips a product whose approved document is unchanged. Take a D1 export first.

```bash
wr d1 export DB --remote --env staging --output <outside-the-repo>.sql
env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=<pinned account> \
  node_modules/.bin/tsx scripts/seed-ecosystem-products/seed-ecosystem-products.ts --env staging [--dry-run]
```

Use `--env production` for production. Media and avatar URLs use the environment's workers.dev origin by default; after the domain cutover, re-run with `--media-origin https://nextlevelbuilder.io` (or the staging domain) to publish revisions pointing at the domain.

## Domain cutover

The full procedure (zone, nameservers, final sync, custom domains, Polar, OAuth, Turnstile, rollback) is in [cutover-runbook.md](./cutover-runbook.md).
