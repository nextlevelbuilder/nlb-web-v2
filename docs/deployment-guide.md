# Deployment guide

nextlevelbuilder.io runs as two Cloudflare Workers on the **hi@nextlevelbuilder.io** account (`7ac87c90789159ae1b10b7d78f5dcc08`). Both are built with `@opennextjs/cloudflare`.

| Environment | Worker | Branch | workers.dev | Final domain |
|---|---|---|---|---|
| production | `nextlevelbuilder-web` | `main` | https://nextlevelbuilder-web.hi-7ac.workers.dev | nextlevelbuilder.io, www |
| staging | `nextlevelbuilder-web-staging` | `dev` | https://nextlevelbuilder-web-staging.hi-7ac.workers.dev | staging.nextlevelbuilder.io |

Until the [cutover](./cutover-runbook.md), the final domains still serve the old site from the Digitop account.

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
- Every push and PR to `dev` or `main` runs type-check, lint and test.
- A push to `dev` applies D1 migrations to staging, builds and deploys staging.
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

- The script owns the list of secrets it copies (`SECRET_KEYS`). It also derives `BETTER_AUTH_URL` (the environment's final URL), `TURNSTILE_SECRET_KEY` (from the widget) and copies `MCP_DELEGATION_SECRET` from `.env` like the other secrets; the same value must be on the MCP worker ([cutover-runbook.md](./cutover-runbook.md)).
- Because `BETTER_AUTH_URL` is the final domain, OAuth sign-in works only there.
- Course video secrets (`CF_STREAM_API_TOKEN`, signing key, customer subdomain) are set by hand once Stream is enabled: [courses.md](./courses.md#one-time-setup-cloudflare-stream).
- Staging currently uses the production Polar token. Provide a Polar sandbox token in the staging secrets if staging must not touch live Polar data.

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

## Domain cutover

The full procedure (zone, nameservers, final sync, custom domains, Polar, OAuth, Turnstile, rollback) is in [cutover-runbook.md](./cutover-runbook.md).
