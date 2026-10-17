# AGENTS.md

Guidance for coding agents working in nlb-web-v2. Start with [README.md](README.md) and [docs/README.md](docs/README.md).

- Before UI work, read [DESIGN.md](DESIGN.md); review with [REVIEW.md](REVIEW.md).
- Verify UI changes at 1440×900, 768×1024 and 375×812, plus 320 px for reflow. Check the browser console on home EN (`/`) and VI (`/vi`).
- Keep discovery surfaces in sync when routes or content change: `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt`, `app/llms-full.txt`, markdown twins (`lib/markdown/page-paths.ts`), page metadata (`lib/seo.ts`, `lib/blog/blog-seo.ts`), structured data (`lib/structured-data.ts`), agent discovery documents (`lib/discovery/`, `app/.well-known/`) and one `opengraph-image.tsx` per public page.
- `/api/v1` and the OpenAPI document are a public contract: change them only additively.
- Never print or commit secrets (`.env*`, `.dev.vars`). Remote wrangler commands follow the account pin in [docs/deployment-guide.md](docs/deployment-guide.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
