# Project roadmap

Status as of 2026-10-13. This page is a stateful record, so update the date when you change it. Scope and acceptance criteria come from `plans/reports/bootstrap-261013-1759-brainstorm-contract.md`. Evidence for "done" is in `plans/reports/` (build, review and live-check reports).

## Milestones

| Milestone | Status |
|---|---|
| **M1: v2 site on hi@** (feature parity, Constellation design, D1, CI/CD, data migrated) | Deployed to staging and production on workers.dev. Domain cutover pending. |
| **M2: Courses** (Stream signed URLs, a Polar product per video, VIP access) | Code deployed. Stream not enabled yet, so no videos are playable. |
| **Blog** (block posts managed via REST, CLI, MCP) | Live on v2. The CLI and MCP tools live in `packages/` of this repo; the next `packages-v*` release publishes them. |
| **Cutover** | Blocked on owner actions (below) |

## Blocked on the account owner

1. **CI deploy token** with D1, KV, R2 and Workers edit permissions on hi@ ([deployment-guide.md](./deployment-guide.md#cicd)). Until then, CI deploys fail and deploys are manual.
2. **Zone on hi@**, then the nameserver change at Spaceship ([cutover-runbook.md](./cutover-runbook.md)).
3. **Cloudflare Stream** enabled, plus a signing key ([courses.md](./courses.md#one-time-setup-cloudflare-stream)).
4. **MCP worker and redirect worker** redeployed on hi@ before the nameserver change.
5. **Old `cdn.` objects** copied, which needs read access to the Digitop bucket.

## Next (engineering)

These come from the codebase review and the live check. Remove an item once it is merged.
- Hardening: a banned-user check on API keys, and an idempotent moderation decide.
- Low review items: the `createCourseVideoSchema` locale default.
- Set `CF_STREAM_API_TOKEN` (Stream: Edit) with the signing key once Stream is enabled; registering or publishing a video returns 503 until then ([courses.md](./courses.md#one-time-setup-cloudflare-stream)).

## Open product questions

- Is the X handle `nextlevelbuilders` correct?
- Should staging get a Polar sandbox token?
- Legal review of the Terms, Privacy, Refund and Cookies pages and the six community policies (jurisdiction, contracting entity). The VI drafts also need review.
- Discord role sync is inactive until `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` and `DISCORD_PREMIUM_ROLE_ID` are provided.
