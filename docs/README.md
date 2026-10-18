# nlb-web-v2 documentation

Docs own the **why** and the **where**. Behaviour lives in code: each page links to the file that owns it. When a doc and the code disagree, the code wins. Fix the doc.

| Read this | When you need to |
|---|---|
| [getting-started.md](./getting-started.md) | Set up a local environment, run tests, understand the branch-to-environment flow |
| [system-architecture.md](./system-architecture.md) | Understand the runtime, Cloudflare bindings, auth, payments and the reasons behind them |
| [codebase-summary.md](./codebase-summary.md) | Find the module that owns a feature |
| [code-standards.md](./code-standards.md) | Write code that fits D1, the Worker runtime, i18n and the public API contract |
| [design-guidelines.md](./design-guidelines.md) | Work on UI: Constellation tokens, themes, motion, i18n copy |
| [blog-and-agent-management.md](./blog-and-agent-management.md) | Manage blog posts over REST, the `nlb` CLI or MCP |
| [courses.md](./courses.md) | Set up or operate paid course videos (Polar + Cloudflare Stream) |
| [membership-onboarding.md](./membership-onboarding.md) | Operate post-checkout onboarding: tier rules, Discord/Telegram access, jobs and cron, secrets, backfill, rollback |
| [deployment-guide.md](./deployment-guide.md) | Deploy, provision Cloudflare resources and secrets, apply D1 migrations |
| [data-migration-neon-to-d1.md](./data-migration-neon-to-d1.md) | Understand the one-way Neon → D1 data copy and its risks |
| [cutover-runbook.md](./cutover-runbook.md) | Move `nextlevelbuilder.io` from the Digitop account to hi@ |
| [project-roadmap.md](./project-roadmap.md) | See what is done, blocked and next |

Other authority surfaces:
- Root [`README.md`](../README.md): product overview, stack and public toolkit links.
- [`scripts/migrate/README.md`](../scripts/migrate/README.md): migration commands.
- `/api/openapi.json` (built by [`lib/openapi.ts`](../lib/openapi.ts)): the REST contract, rendered at `/api-docs`.
- `plans/`: plans and reports. They are dated records, not current authority.
