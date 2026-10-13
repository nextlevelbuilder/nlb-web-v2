# Code standards

These are the project-specific rules. Tooling enforces formatting and generic style (ESLint flat config in [`eslint.config.mjs`](../eslint.config.mjs), TypeScript `strict` in [`tsconfig.json`](../tsconfig.json)).

## General

- File names are kebab-case and descriptive (`course-webhook-entitlements.ts`). Import from the repo root with `@/` (configured in `tsconfig.json` and [`vitest.config.ts`](../vitest.config.ts)).
- Validate input at every boundary with zod (route bodies, query strings, webhook payloads, env).
- New code must not add `any`. The existing `no-explicit-any` warnings are inherited from the old app at the Better Auth and Polar SDK boundaries.
- Comments explain invariants and reasons. Never put plan ids, phase numbers or audit labels in code, tests or commit messages.
- Commits use Conventional Commits. Branch from `dev`, open a PR into `dev`, and promote `dev` → `main` by PR.

## Runtime (Cloudflare Workers)

- Code runs in workerd with `nodejs_compat` (see [`wrangler.jsonc`](../wrangler.jsonc)). Do not rely on the filesystem or long-lived process state. Per-isolate caches (such as the Drizzle client cache in [`lib/db/index.ts`](../lib/db/index.ts)) are fine.
- Read bindings and secrets through `getCloudflareContext().env`, or through a module that already wraps it. Keep a `process.env` fallback only where local Node, scripts or tests need it (pattern: [`lib/courses/course-runtime-env.ts`](../lib/courses/course-runtime-env.ts)).
- `NEXT_PUBLIC_*` values are inlined at build time. Changing one needs a rebuild, not just a secret update. CI sets them per branch in the deploy job.
- Outbound fetches to user-supplied URLs need SSRF protection (no private or loopback targets). Follow the existing guards in [`lib/moderation/safe-fetch.ts`](../lib/moderation/safe-fetch.ts) and [`lib/moderation/pulse-probe.ts`](../lib/moderation/pulse-probe.ts). The `global_fetch_strictly_public` compatibility flag adds a runtime backstop.

## Database (D1)

- Schema: [`lib/db/schema.ts`](../lib/db/schema.ts) (`drizzle-orm/sqlite-core`). Migrations come from `npm run db:generate`. Never hand-edit a migration that has already been applied.
- Types:
  - ids are `text` (UUID strings);
  - timestamps are `integer` in `timestamp_ms` mode;
  - JSON is stored as text through drizzle `json` mode;
  - booleans are 0/1.
  - When you interpolate a Date into raw `sql`, use `.getTime()`.
- Use `db.batch([...])` for multi-statement atomic writes. There is no `db.transaction()` on D1. Reads that happen before a batch can race. When correctness depends on a read, guard the write in SQL (`WHERE ... AND version = ?`, `EXISTS`, `changes()`).
- CI applies migrations **before** it builds and deploys. A failed build therefore leaves the schema ahead of the code, so every migration must be additive and safe for the previous code version.
- Postgres-isms (`::int`, `jsonb` operators, `FOR UPDATE`, `RETURNING *` assumptions about multiple rows) do not belong here.

## Public API contract

- `/api/v1` paths, request and response shapes, and the OpenAPI document must stay backward compatible. Additions are fine. A change to an existing shape is a stop-and-ask decision, because the CLI and MCP server in the toolkits repo depend on it.
- Register new endpoints in the OpenAPI document. The blog does this in [`lib/blog/blog-openapi.ts`](../lib/blog/blog-openapi.ts), which is merged into [`lib/openapi.ts`](../lib/openapi.ts).
- Authorization uses `resolveCaller` ([`lib/auth-api-key.ts`](../lib/auth-api-key.ts)) so that API keys, sessions and MCP delegation behave the same way. Admin-only writes check `role === "admin"`.

## UI and i18n

- Every user-visible string exists in both EN and VI. Short UI strings go in `messages/*.json`, and long-form copy goes in the copy modules (`content/`, `lib/blog/blog-copy.ts`, `lib/courses/courses-copy.ts`). Add both locales in the same change.
- Use design tokens, not raw colours. When you add a font size to `tailwind.config.ts`, also register it in `cn()` in [`lib/utils.ts`](../lib/utils.ts). Otherwise tailwind-merge drops colour classes. See [design-guidelines.md](./design-guidelines.md).
- No fabricated social proof. Seat counts, countdowns and activity toasts must come from real data or config, or be hidden.
- Accessibility is a release bar: Lighthouse a11y ≥ 95, no horizontal scroll from 320 px, accessible names that match the visible labels, and reduced-motion support.

## Tests

- Vitest. Each test file boots a fresh in-memory Miniflare D1 ([`tests/setup/local-d1-setup.ts`](../tests/setup/local-d1-setup.ts)), so route handlers run against real SQLite semantics. Do not mock the database.
- Use `runWithDb()` from [`lib/db/index.ts`](../lib/db/index.ts) when a test needs an explicit database.
- A bug fix comes with a test that fails without the fix.
- Do not weaken or skip tests to get CI green.

## Secrets

- Never commit `.env`, `.dev.vars` or migration dumps (all gitignored). Reference variable names in code and docs, never values.
- Worker secrets are set with `scripts/provision-cloudflare.sh secrets <env>`, which pipes the values and never echoes them.
