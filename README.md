# Next Level Builders - Platform & Ecosystem

Next Level Builders is the platform for indie hackers, autonomous coding agents, and builders to launch verified products, earn immutable Trust Passports, and distribute software to thousands of builders.

## Quick Links

- **Live Platform:** [nextlevelbuilder.io](https://nextlevelbuilder.io)
- **Staging:** [staging.nextlevelbuilder.io](https://staging.nextlevelbuilder.io)
- **API Documentation:** `/api-docs` (Interactive Scalar OpenAPI)
- **Documentation:** [`docs/README.md`](./docs/README.md) (deployment, architecture, cutover runbook)

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) on Cloudflare Workers via `@opennextjs/cloudflare`
- **UI & Styling:** React 19, Tailwind CSS, shadcn/ui, Radix UI, Framer Motion
- **Authentication:** Better Auth (Passwordless Email OTP, GitHub & Google OAuth)
- **Database & ORM:** Cloudflare D1 (SQLite) + Drizzle ORM (`lib/db/schema.ts`, migrations in `drizzle/migrations`)
- **Storage & Routing:** Cloudflare R2 (Media assets) & Cloudflare KV (`/go` fail-open direct referral redirects)
- **Payments:** Polar.sh checkout & webhook integration
- **Email:** Resend API for verification codes and notifications
- **Bot Protection:** Cloudflare Turnstile anti-abuse verification
- **Video:** Cloudflare Stream signed playback for paid course videos
- **i18n & theme:** next-intl (English at `/`, Vietnamese at `/vi`, auto-detected), next-themes (system/light/dark)

---

## Quick Start

Requires Node.js 22 and npm 10.

```bash
git clone https://github.com/nextlevelbuilder/nlb-web-v2.git
cd nlb-web-v2
npm ci
npm run db:migrate:local   # apply D1 migrations to the local Miniflare database (.wrangler/state)
npm run dev                # http://localhost:3000 (EN) and /vi (VI)
```

Local configuration (`.dev.vars`, `.env`), tests and the branch-to-environment flow: [`docs/getting-started.md`](./docs/getting-started.md). All project docs: [`docs/README.md`](./docs/README.md).

---

## Environment Variables

Server configuration is validated in `lib/env.ts`, and Worker env keys are typed in `cloudflare-env.d.ts` (`npm run cf-typegen`). Non-secret vars live in `wrangler.jsonc`. Secrets are Worker secrets (`scripts/provision-cloudflare.sh secrets <env>`) and `.dev.vars` locally.

---

## Development Commands

```bash
# Start local Next.js dev server
npm run dev

# Run Vitest test suite
npm test

# Run TypeScript typecheck
npm run type-check

# Run Next.js linting
npm run lint

# Build for Cloudflare Workers (OpenNext)
npm run build:worker

# Standard Next.js production build
npm run build

# Database (Drizzle Kit + D1)
npm run db:generate              # generate SQL migrations from lib/db/schema.ts
npm run db:migrate:local         # apply to local D1
npm run db:migrate:staging       # apply to staging D1 (CI does this on deploy)
npm run db:migrate:production    # apply to production D1 (CI does this on deploy)
```

---

## Deployment

Deployments are automated through GitHub Actions to **Cloudflare Workers**:
- Pushes to `dev` deploy to **Staging** (`nextlevelbuilder-web-staging` / `staging.nextlevelbuilder.io`).
- Merges to `main` deploy to **Production** (`nextlevelbuilder-web` / `nextlevelbuilder.io`).

Provisioning, secrets, D1 migrations and rollback: [`docs/deployment-guide.md`](./docs/deployment-guide.md). Neon → D1 data copy: [`docs/data-migration-neon-to-d1.md`](./docs/data-migration-neon-to-d1.md). Domain move: [`docs/cutover-runbook.md`](./docs/cutover-runbook.md).


---

## Developer Toolkits & APIs

### Product Trust Passport

Published catalog reads (list, detail, Markdown, and `llms.txt`) and product UI displays use the same calculated `trustScore`, bounded to 0–100: published status contributes 40, an HTTPS website URL 20, each vote 2 up to 20, and each full seven days since creation 2 up to 10. HTTPS checks the URL prefix, not domain ownership. Verified traction is disabled, so the current maximum is 90. Payments and editorial flags never contribute points. Trust sorting is applied before catalog pagination; daily/weekly/monthly leaderboards retain their vote-based rules.

Published catalog JSON also returns `votesCount`, the cumulative counter previously exposed as `trustScore`. The database column `products.trust_score` retains that legacy counter; voting still increments it by one, with one vote per account/product/UTC day. Never persist the calculated score into this column. Published products use the approved/published revision's website URL for both scoring and ordering, including in private dashboards that still show editable draft metadata. Product detail badges use `votesCount`, and Build with Us updates the score after a successful vote. Seed scripts no longer assign synthetic counter values or overwrite existing votes; historical seeded counters are not repaired by this code change.

Manage secret API keys in your builder profile (`/profile`) to authenticate automated workflows.

- **Developer toolkits:** [`packages/cli`](packages/cli), [`packages/mcp`](packages/mcp) and [`packages/contracts`](packages/contracts) in this repository
- **CLI:** `@nextlevelbuilder/cli` (`nlb submit <product.json> --api-key <KEY>`)
- **MCP Server:** HTTP endpoint `https://nextlevelbuilder.io/mcp` or `@nextlevelbuilder/mcp` for compatible clients
- **REST APIs:** Authenticate via `Authorization: Bearer <KEY>` or `x-api-key: <KEY>`
---

## Build with Us pages and agent access

The integration guide at `/build-with-us/instructions` covers Studio, CLI, HTTP MCP, WebMCP and REST workflows. Interactive `/api-docs` uses `/api/openapi.json`; the document and all 18 block schemas are derived from [the validation contracts](./packages/contracts/src/product-document.ts).

Product website, media, embed and block link fields accept HTTP(S) URLs only, consistently across Studio and REST validation.

- **Activities** contains builder-authored dated product updates, displayed newest first.
- **Pulse** probes the approved website on view, at most every five minutes per product. It stores the latest 100 samples, displays response time and sample success rate, and marks data stale after 15 minutes. It is not continuous scheduled uptime monitoring. Apply the generated additive Pulse migration using the [D1 migration procedure](./docs/deployment-guide.md#database) before enabling the new backend.
- **WebMCP** is opt-in in the authenticated Studio. The locally bundled [webmcp.dev](https://webmcp.dev/) widget exposes draft inspection, template discovery/application, validated draft replacement and preview. Saving, submission and payment remain manual actions. See [vendor provenance and lifecycle changes](./lib/webmcp/vendor/README.md).
- **Markdown** page representations are available by appending `.md`, including localized pages; `/index.md` represents the homepage. Private representations retain session authorization and are not publicly cached. Unknown pages return 404. Static assets and write-only actions are not content pages.
- **Discovery**: `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/llms-full.txt` expose canonical public pages and approved product content. Draft revisions are excluded.

HTTP MCP remote writes use the MCP operator's authorization token; an `nlb_live_` REST key is a separate credential. The WebMCP connection token pairs the browser with the user's own MCP client.

---

## Blog

Posts are ordered lists of typed widget blocks (one catalogue in `lib/blog/blocks/registry.ts`, rendered by `components/blog`). They are managed through `/api/v1/blog/*` (admin API key, session or MCP delegation; optimistic `version`, revisions, `Idempotency-Key`), documented in `/api/openapi.json`, and by the `nlb blog` CLI commands and `blog_*` MCP tools in the toolkits repo. Public pages: `/blog`, `/blog/<slug>` (and `/vi/...`). Details: [`docs/blog-and-agent-management.md`](./docs/blog-and-agent-management.md).

## Courses

Each course video has one Polar product (created on publish) and plays through Cloudflare Stream signed URLs. Access: a `video:<id>` entitlement or paid order, or an active subscription on a plan in `COURSES_ACCESS_PLANS` (VIP by default). `POST /api/courses/videos/<slug>/token` returns a signed playback URL or an error status (documented in the route's header comment). Setup and decisions: [`docs/courses.md`](./docs/courses.md).

---

## License

Proprietary - Next Level Builders.
