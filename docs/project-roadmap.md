# Project roadmap

Status as of 2026-10-13. This page is a stateful record, so update the date when you change it. Scope and acceptance criteria come from `plans/reports/bootstrap-261013-1759-brainstorm-contract.md`. Evidence for "done" is in `plans/reports/` (build, review and live-check reports).

## Milestones

| Milestone | Status |
|---|---|
| **M1: v2 site on hi@** (feature parity, Constellation design, D1, CI/CD, data migrated) | Deployed to staging and production on workers.dev. Domain cutover pending. |
| **M2: Courses** (Stream signed URLs, a Polar product per video, VIP access) | Code deployed. Stream not enabled yet, so no videos are playable. |
| **Blog** (block posts managed via REST, CLI, MCP) | Live on v2. The toolkits CLI and MCP tools are on `feat/blog-management`, not merged or released. |
| **Cutover** | Blocked on owner actions (below) |

## Blocked on the account owner

1. **CI deploy token** with D1, KV, Queues, R2 and Workers edit permissions on hi@ ([deployment-guide.md](./deployment-guide.md#cicd)). Until then, CI deploys fail and deploys are manual.
2. **Zone on hi@**, then the nameserver change at Spaceship ([cutover-runbook.md](./cutover-runbook.md)).
3. **Cloudflare Stream** enabled, plus a signing key ([courses.md](./courses.md#one-time-setup-cloudflare-stream)).
4. **MCP worker and redirect worker** redeployed on hi@ before the nameserver change.
5. **Old `cdn.` objects** copied, which needs read access to the Digitop bucket.

## Next (engineering)

These come from the codebase review and the live check. Remove an item once it is merged.
- VIP course access must end at the subscription's paid period end, not only on `status=active`.
- Enforce Stream `requireSignedURLs` for every video that gets a token.
- Add a migration pre-import guard against wiping rows written on v2 after the dump. Extend verify beyond primary-key hashes.
- Fix the theme no-flash script error on the deployed Worker (`__name` injected by esbuild `keep_names`).
- Polish the homepage: decide on the FAQ, the always-enabled CTA with a consent dialog, the seat-meter display rule, and the EGANY partner heading.
- `/api/traffic/posthog` should no-op when PostHog is not configured.
- Hardening: a webhook lock lease on reclaim, MCP assertion `jti` replay protection, a banned-user check on API keys, and an idempotent moderation decide.
- Housekeeping:
  - commit a `.dev.vars.example`;
  - fix or remove `db:seed:local` (its seed file is missing);
  - align the `deploy:*` npm scripts with the explicit `--env` rule;
  - decide whether to wire up or remove the unused `GO_REDIRECTS`, `POLAR_WEBHOOK_QUEUE` and `AI` bindings.

## Open product questions

- Is the X handle `nextlevelbuilders` correct?
- Should staging get a Polar sandbox token?
- Legal review of the Terms, Privacy, Refund and Cookies pages and the six community policies (jurisdiction, contracting entity). The VI drafts also need review.
- Discord role sync is inactive until `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` and `DISCORD_PREMIUM_ROLE_ID` are provided.
