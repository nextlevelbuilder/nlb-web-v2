# Next Level Builders - Platform & Ecosystem

Next Level Builders is the platform for indie hackers, autonomous coding agents, and builders to launch verified products, earn immutable Trust Passports, and distribute software to thousands of builders.

## Quick Links

- **Live Platform:** [nextlevelbuilder.io](https://nextlevelbuilder.io)
- **Staging:** [staging.nextlevelbuilder.io](https://staging.nextlevelbuilder.io)
- **API Documentation:** `/api-docs` (Interactive Scalar OpenAPI)
- **Deployment Guide:** [`docs/deployment-guide.md`](./docs/deployment-guide.md)

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) on Cloudflare Workers via `@opennextjs/cloudflare`
- **UI & Styling:** React 19, Tailwind CSS, shadcn/ui, Radix UI, Framer Motion
- **Authentication:** Better Auth (Passwordless Email OTP, GitHub & Google OAuth)
- **Database & ORM:** Managed PostgreSQL (Neon) via Cloudflare Hyperdrive connection pooling + Drizzle ORM
- **Storage & Routing:** Cloudflare R2 (Media assets) & Cloudflare KV (`/go` fail-open direct referral redirects)
- **Payments:** Polar.sh checkout & webhook integration
- **Email:** Resend API for verification codes and notifications
- **Bot Protection:** Cloudflare Turnstile anti-abuse verification

---

## Quick Start

### Prerequisites

- Node.js 22+
- npm

### Local Setup

```bash
# 1. Clone repository
git clone https://github.com/mrgoonie/nextlevelbuilder-web.git
cd nextlevelbuilder-web

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# 4. Run database migrations
npm run db:migrate

# 5. Start development server
npm run dev
```

Visit `http://localhost:3000`.

---

## Environment Variables

All environment variables are declared and validated in `lib/env.ts`.  
See [`.env.example`](./.env.example) for the full list of required and optional configuration keys.

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

# Database schema management (Drizzle Kit)
npm run db:generate   # Generate SQL migrations from schema
npm run db:migrate    # Apply migrations to database
npm run db:studio     # Open Drizzle Studio visual editor
```

---

## Deployment

Deployments are automated through GitHub Actions to **Cloudflare Workers**:
- Pushes to `dev` deploy to **Staging** (`nextlevelbuilder-web-staging` / `staging.nextlevelbuilder.io`).
- Merges to `main` deploy to **Production** (`nextlevelbuilder-web` / `nextlevelbuilder.io`).

For detailed operational runbooks, secrets configuration, database migrations, and rollback procedures, refer to [`docs/deployment-guide.md`](./docs/deployment-guide.md).


---

## Developer Toolkits & APIs

### Product Trust Passport

Published catalog reads (list, detail, Markdown, and `llms.txt`) and product UI displays use the same calculated `trustScore`, bounded to 0–100: published status contributes 40, an HTTPS website URL 20, each vote 2 up to 20, and each full seven days since creation 2 up to 10. HTTPS checks the URL prefix, not domain ownership. Verified traction is disabled, so the current maximum is 90. Payments and editorial flags never contribute points. Trust sorting is applied before catalog pagination; daily/weekly/monthly leaderboards retain their vote-based rules.

Published catalog JSON also returns `votesCount`, the cumulative counter previously exposed as `trustScore`. The database column `products.trust_score` retains that legacy counter; voting still increments it by one, with one vote per account/product/UTC day. Never persist the calculated score into this column. Published products use the approved/published revision's website URL for both scoring and ordering, including in private dashboards that still show editable draft metadata. Product detail badges use `votesCount`, and Build with Us updates the score after a successful vote. Seed scripts no longer assign synthetic counter values or overwrite existing votes; historical seeded counters are not repaired by this code change.

Manage secret API keys in your builder profile (`/profile`) to authenticate automated workflows.

- **Developer Toolkits Repository:** [`https://github.com/nextlevelbuilder/nlb-directory-toolkits`](https://github.com/nextlevelbuilder/nlb-directory-toolkits)
- **CLI:** `@nextlevelbuilder/cli` (`nlb submit <product.json> --api-key <KEY>`)
- **MCP Server:** HTTP endpoint `https://mcp.nextlevelbuilder.io/mcp` or `@nextlevelbuilder/mcp` for compatible clients
- **REST APIs:** Authenticate via `Authorization: Bearer <KEY>` or `x-api-key: <KEY>`
---

## Build with Us pages and agent access

The integration guide at `/build-with-us/instructions` covers Studio, CLI, HTTP MCP, WebMCP and REST workflows. Interactive `/api-docs` uses `/api/openapi.json`; the document and all 18 block schemas are derived from [the validation contracts](./packages/contracts/src/product-document.ts).

Product website, media, embed and block link fields accept HTTP(S) URLs only, consistently across Studio and REST validation.

- **Activities** contains builder-authored dated product updates, displayed newest first.
- **Pulse** probes the approved website on view, at most every five minutes per product. It stores the latest 100 samples, displays response time and sample success rate, and marks data stale after 15 minutes. It is not continuous scheduled uptime monitoring. Apply the generated additive Pulse migration using the [deployment migration procedure](./docs/deployment-guide.md#5-database-migrations) before enabling the new backend.
- **WebMCP** is opt-in in the authenticated Studio. The locally bundled [webmcp.dev](https://webmcp.dev/) widget exposes draft inspection, template discovery/application, validated draft replacement and preview. Saving, submission and payment remain manual actions. See [vendor provenance and lifecycle changes](./lib/webmcp/vendor/README.md).
- **Markdown** page representations are available by appending `.md`, including localized pages; `/index.md` represents the homepage. Private representations retain session authorization and are not publicly cached. Unknown pages return 404. Static assets and write-only actions are not content pages.
- **Discovery**: `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/llms-full.txt` expose canonical public pages and approved product content. Draft revisions are excluded.

HTTP MCP remote writes use the MCP operator's authorization token; an `nlb_live_` REST key is a separate credential. The WebMCP connection token pairs the browser with the user's own MCP client.

---

## License

Proprietary - Next Level Builders.
