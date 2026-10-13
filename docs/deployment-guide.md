# Deployment guide

nextlevelbuilder.io runs as two Cloudflare Workers on the **hi@nextlevelbuilder.io** account (`7ac87c90789159ae1b10b7d78f5dcc08`). Both are built with `@opennextjs/cloudflare`.

| Environment | Worker | Branch | workers.dev | Final domain |
|---|---|---|---|---|
| production | `nextlevelbuilder-web` | `main` | https://nextlevelbuilder-web.hi-7ac.workers.dev | nextlevelbuilder.io, www |
| staging | `nextlevelbuilder-web-staging` | `dev` | https://nextlevelbuilder-web-staging.hi-7ac.workers.dev | staging.nextlevelbuilder.io |

Bindings and resource ids live in [`wrangler.jsonc`](../wrangler.jsonc): D1 `DB`, KV `GO_REDIRECTS`, R2 `MEDIA_STAGING`/`MEDIA_PUBLIC`, Queue `POLAR_WEBHOOK_QUEUE`, Workers AI `AI`.

> Always pin the account: the shared wrangler OAuth login can also see the Digitop account, which must never be written to.
> Wrangler auto-loads `CLOUDFLARE_API_TOKEN` from `./.env`. That token only covers R2 and zones, so run OAuth commands with the token unset:
> `env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08 npx wrangler ...`. Run them from outside the repo, or pass `--config <repo>/wrangler.jsonc`.

## CI/CD

[`.github/workflows/ci-deploy.yml`](../.github/workflows/ci-deploy.yml) runs these steps:
1. On every push and PR: typecheck, lint and test.
2. On a push to `dev`, it applies D1 migrations and deploys to staging. On a push to `main`, it does the same for production.

Repository secrets:
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- The build-time `NEXT_PUBLIC_*` values: Polar product ids, early-bird deadline and Discord URL.

The deploy job needs `CLOUDFLARE_API_TOKEN` with these permissions on the hi@ account: **Workers Scripts: Edit, D1: Edit, Workers KV Storage: Edit, Queues: Edit, Workers R2 Storage: Edit, Account Settings: Read**. The token currently in `.env` only has R2 and zone access, so CI deploys fail until it is expanded or replaced.

## Provisioning (idempotent)

```bash
scripts/provision-cloudflare.sh resources        # D1, KV, Queues, R2, Turnstile; writes ids into wrangler.jsonc
scripts/provision-cloudflare.sh secrets staging  # worker secrets piped from .env (never echoed)
scripts/provision-cloudflare.sh secrets production
```

`BETTER_AUTH_URL` is set to the environment's final URL. Sign-in through OAuth providers therefore works only on the final domains, whose callback URLs are registered with GitHub and Google.

Course video secrets are set manually once Stream is enabled. See [Courses](#courses-cloudflare-stream).

## Database

- Schema: [`lib/db/schema.ts`](../lib/db/schema.ts). Migrations live in `drizzle/migrations` (`npm run db:generate`).
- Apply migrations with `npm run db:migrate:local`, `npm run db:migrate:staging` or `npm run db:migrate:production`. CI applies them on deploy.
- Neon → D1 data migration: see [`scripts/migrate/README.md`](../scripts/migrate/README.md).

## Manual deploy

```bash
npm run build:worker
env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08 npx wrangler deploy --env staging   # or no --env for production
```

## Courses (Cloudflare Stream)

Stream cannot be reached with the current API token or OAuth scopes, so it is a one-time manual step:
1. Enable Stream on the hi@ dashboard. Note the customer subdomain (`customer-<code>.cloudflarestream.com`).
2. Create a signing key with a token that has Stream: Edit:
   `curl -X POST -H "Authorization: Bearer <token>" https://api.cloudflare.com/client/v4/accounts/7ac87c90789159ae1b10b7d78f5dcc08/stream/keys`
   Keep `result.id` and `result.jwk`; they are shown once.
3. Set the worker secrets for each environment (add `--env staging` for staging): `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_JWK`, `CF_STREAM_CUSTOMER_SUBDOMAIN`.
4. Upload videos with `requireSignedURLs: true`.
5. As an admin, call `POST /api/courses/videos` and then `POST /api/courses/videos/<slug>/publish`. Publishing creates the Polar product, so `POLAR_ACCESS_TOKEN` needs `products:write`.

Access policy: `COURSES_ACCESS_PLANS` (wrangler var, default `vip`) with the fallback constant in [`lib/courses/course-access-policy.ts`](../lib/courses/course-access-policy.ts).

## Domain cutover

The zone is still on the Digitop account. The records to recreate are captured in [`scripts/dns/nextlevelbuilder-io-records.json`](../scripts/dns/nextlevelbuilder-io-records.json): Google MX, SPF, site verification, Resend `send.` MX/SPF, DKIM, and the `go` CNAME.

1. Create a token with **Zone: Edit (create)** and **DNS: Edit** on the hi@ account. Then run `CF_ZONE_TOKEN=<token> scripts/dns/setup-zone-on-hi-account.sh`. It adds the zone with `jump_start=false`, imports the records and prints the new nameservers.
2. Change the nameservers at the registrar (Spaceship) to the ones printed.
3. After the zone is active on hi@:
   - Attach the Workers custom domains: `nextlevelbuilder.io` and `www` to `nextlevelbuilder-web`, and `staging` to `nextlevelbuilder-web-staging`.
   - Redeploy `nlb-directory-mcp` (`mcp.`) and `ui-ux-pro-max-skill-redirect` on hi@. Both currently live on the Digitop account and stop resolving once the zone moves.
   - Connect `cdn.` to the `nlb-media-public` R2 bucket after copying the old objects.
4. Run the final data sync: `run-migration.ts dump`, then `import`, `verify` and `rekey-jwks` against production (see the migration README).
5. Switch the Polar webhook to `https://nextlevelbuilder.io/api/webhooks/polar`.
