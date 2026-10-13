---
title: "nlb-web-v2 bootstrap: seven traps between Neon and D1"
date: 2026-10-13
summary: "v2 live on hi@ workers.dev with 43/43 tables verified; lessons on wrangler keep_names, OpenNext Host, Actions falsy strings, D1 batch, wrangler .env, upsert final-sync, SSR-hidden reveals"
---

# nlb-web-v2 bootstrap: seven traps between Neon and D1

# nlb-web-v2 bootstrap: seven traps between Neon and D1

**Date**: 2026-10-13 21:51 (Asia/Saigon)
**Severity**: High
**Component**: nlb-web-v2 (OpenNext on Cloudflare Workers, D1, GitHub Actions CI, migration scripts)
**Status**: Resolved in code. Cutover blocked on owner (token scopes, zone, Stream)

## What Happened

v2 runs on the hi@ account: production and staging workers.dev, 43/43 tables migrated Neon to D1 with row counts, id hashes and per-row value hashes all matching, 700 tests passing, Lighthouse a11y 100. Getting there meant hitting seven traps. Most of them looked fine on the surface and were wrong underneath. Source: `plans/reports/bootstrap-261013-2146-final-report.md` and the build, review, live-check, fix-pass and UX/AX reports it links.

## The Brutal Truth

None of these were exotic. Every one passed a quick glance and failed only under real verification: a console check, a hash diff, a dry run, a tall-viewport capture. The CI bug is the one that hurts most. Every push to `main` deployed **staging** with production env values, and production was never deployed from CI at all. Green checkmarks, wrong target. Without the code review we would have shipped a cutover runbook that wiped live data.

## Technical Details and Lessons

1. **wrangler esbuild `keep_names` breaks next-themes.** `ReferenceError: __name is not defined` showed up on every page. next-themes serialises its no-flash function with `toString()`, and esbuild injected `__name(...)` calls into that function. Those calls have no helper in the inline script. Fix: `keep_names: false` in `wrangler.jsonc`. Lesson: when code gets stringified into the page, bundler transforms leak into it. Read the browser console on the deployed worker, not just locally.
2. **OpenNext self-fetch with no `Host` served the old site.** Service-binding requests carry no `Host`. OpenNext's `isExternal` treated next-intl's absolute rewrite as external, so it fetched the public domain, which still points to Digitop. Markdown twins and `/llms-full.txt` returned old-site content with a 200. Fix: pin `Host` in `lib/markdown/page-markdown.ts`. Worth reporting upstream.
3. **`cond && '' || x` in GitHub Actions always gives `x`.** `''` is falsy, so `github.ref_name == 'main' && '' || '--env staging'` always returned `--env staging`. Fix: `'--env='` for main and `'--env=staging'` otherwise, verified with `wrangler deploy --dry-run`. Lesson: never use a falsy value as the "true" branch of this pattern.
4. **D1 has no interactive transactions.** We rewrote the Postgres transactions as `db.batch`: moderation, revisions, outbox, and votes with counter guarded by `exists`. Optimistic concurrency uses `changes()=1` inside the batch. Known gap: reads before the batch (`nextRevisionNumber`, moderation decide) still race, the same as under READ COMMITTED before.
5. **wrangler auto-loads the project `.env`.** `CLOUDFLARE_API_TOKEN` in `.env` overrode the OAuth login and used the narrower token. Workaround: `env -u CLOUDFLARE_API_TOKEN ... npx wrangler --config <repo>/wrangler.jsonc`, run from outside the repo.
6. **Final-sync must upsert, not replace.** `import.sql` ran `DELETE FROM` on all 43 tables before re-inserting. That would have wiped v2-born users, sessions, orders and `webhook_events` at cutover. Now it upserts by primary key, never touches blog, courses or idempotency tables, takes a D1 export before every write, and needs `--replace --i-understand` for a full replace (`tests/migrate-import-modes.test.ts`).
7. **Scroll-reveal hid headlines from crawlers.** framer-motion `initial={{opacity:0}}` shipped invisible headlines in the server HTML. Crawlers, no-JS visitors and full-page captures got blank chapters. The first fix used CSS `animation-timeline: view()` and still failed: on a tall viewport, the way Googlebot renders, the timeline is inactive and the backwards fill kept `opacity:0`. Final fix: the server HTML stays visible, and after hydration an IntersectionObserver hides and reveals only elements below the fold (`components/home/reveal.tsx`, `.reveal` in `app/globals.css`).

## Decisions

- Disable `keep_names` globally rather than patch next-themes. Rejected: forking or vendoring the script.
- Pin `Host` locally rather than wait on an OpenNext upstream fix.
- Make upsert the default for final-sync and keep replace behind a loud flag. Rejected: "freeze v2 writes until cutover", which nobody can enforce.
- Use an observer-based reveal. Rejected: pure-CSS scroll-driven animation, which failed the tall-viewport check.

## Next Steps

- Owner (Duy): widen the `CLOUDFLARE_API_TOKEN` scopes (Workers, D1, KV, Queues, R2, Account Settings read, Zone create, DNS edit) and update the GitHub secret. CI deploy fails at D1 migrate until this is done.
- Owner: add the `nextlevelbuilder.io` zone on hi@, switch nameservers at Spaceship, enable Stream.
- Agent: after that, run `docs/cutover-runbook.md`: upsert final-sync, custom domain, Polar webhook, OAuth callbacks.
- Agent: file the OpenNext `isExternal` missing-Host issue upstream.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
