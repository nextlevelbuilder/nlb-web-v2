# Getting started

## Prerequisites

- Node.js 22 (CI uses 22, see [`.github/workflows/ci-deploy.yml`](../.github/workflows/ci-deploy.yml)) and npm 10. The lockfile is generated with npm 10, so `npm ci` can fail with other major versions.
- Access to the GitHub repo `nextlevelbuilder/nlb-web-v2`. You only need Cloudflare access (the hi@nextlevelbuilder.io account) to deploy or provision.

## Install

```bash
git clone https://github.com/nextlevelbuilder/nlb-web-v2.git
cd nlb-web-v2
npm ci
```

## Local configuration

There are two sources of configuration, and the source depends on how the code reads a value:

| Read through | Local source | Used by |
|---|---|---|
| `getCloudflareContext().env` (bindings, Worker vars, secrets) | `.dev.vars` (gitignored), plus the `vars` in [`wrangler.jsonc`](../wrangler.jsonc) | Auth providers ([`lib/auth.ts`](../lib/auth.ts)), courses ([`lib/courses/course-runtime-env.ts`](../lib/courses/course-runtime-env.ts)), MCP delegation, media upload, markdown twins |
| `process.env` | Next.js `.env*` loading during `next dev`. In the deployed Worker, OpenNext fills it from the Worker env. | [`lib/env.ts`](../lib/env.ts) (zod schema with defaults), Polar, Resend, Turnstile |

Variable names:
- [`cloudflare-env.d.ts`](../cloudflare-env.d.ts) types the Worker env. Regenerate it with `npm run cf-typegen` after you change `wrangler.jsonc` or `.dev.vars`.
- [`lib/env.ts`](../lib/env.ts) holds the `process.env` schema.

No `.dev.vars.example` is committed yet. Ask a maintainer for the values. Never commit `.dev.vars` or `.env`. Both are gitignored.

Nothing is required just to boot the site. D1, KV and R2 run locally in Miniflare, and `BETTER_AUTH_SECRET` falls back to a dev-only value outside production (see [`lib/auth.ts`](../lib/auth.ts)). Checkout, email, OAuth sign-in and course playback need their real keys.

> The repo `.env` also holds a `CLOUDFLARE_API_TOKEN` that wrangler loads automatically. It is scoped to R2 and zones only. See [deployment-guide.md](./deployment-guide.md) before you run any remote wrangler command.

## Local database

```bash
npm run db:migrate:local   # applies drizzle/migrations to the local D1 in .wrangler/state
```

`npm run db:seed:local` refers to `drizzle/seed/dev-seed.sql`, which does not exist yet. To work with realistic data, import a migration snapshot into the local D1. See [data-migration-neon-to-d1.md](./data-migration-neon-to-d1.md).

## Run

```bash
npm run dev       # next dev; D1/KV/R2 bindings come from wrangler.jsonc via initOpenNextCloudflareForDev (next.config.ts)
npm run preview   # full OpenNext Worker build served by wrangler (closest to production)
```

Open `http://localhost:3000` for English and `http://localhost:3000/vi` for Vietnamese.

OAuth sign-in (GitHub, Google) only works on domains whose callback URLs are registered with those providers. Use email OTP when you work locally.

## Checks

These are the same checks the CI `test` job runs:

```bash
npm run type-check
npm run lint
npm test          # vitest; every test file gets an in-memory Miniflare D1 (tests/setup/local-d1-setup.ts)
```

Run one file with `npx vitest run tests/<file>.test.ts`. Test locations are configured in [`vitest.config.ts`](../vitest.config.ts).

## Branches and deploys

| Branch | Deploys to | How |
|---|---|---|
| feature branch → PR | nothing (checks only) | PR into `dev` |
| `dev` | staging worker `nextlevelbuilder-web-staging` | push, after the checks pass |
| `main` | production worker `nextlevelbuilder-web` | merge `dev` → `main` through a PR |

- Never push to `main` directly.
- A deploy applies D1 migrations before building, so migrations must stay additive. Read [code-standards.md](./code-standards.md#database-d1).
- CI deploy currently fails until the CI Cloudflare token gets D1 permissions ([project-roadmap.md](./project-roadmap.md)). Until then, use the manual deploy path in [deployment-guide.md](./deployment-guide.md#manual-deploy).

## Changing the schema

1. Edit [`lib/db/schema.ts`](../lib/db/schema.ts).
2. `npm run db:generate` writes a new SQL file to `drizzle/migrations/`. Review it and commit it.
3. `npm run db:migrate:local`, then `npm test`.
4. CI applies the migration to staging and production on deploy.
