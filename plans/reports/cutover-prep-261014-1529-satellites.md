# Cutover prep: satellite services on hi@ (2026-10-14, Asia/Saigon)

The satellites are ready on hi@ under workers.dev, and none has a custom domain yet. Nothing was written to the Digitop account or to Neon. Digitop was only read (script content, settings, secret names, bucket listings), and Neon was read through a `default_transaction_read_only` session.

## workers.dev URLs (hi@, account 7ac87c90789159ae1b10b7d78f5dcc08)

| Service | URL | Version |
|---|---|---|
| MCP production `nlb-directory-mcp` | https://nlb-directory-mcp.hi-7ac.workers.dev (endpoint `/mcp`) | `2c5afffa-ffad-4c69-8b7f-af67466f88fc` |
| MCP staging `nlb-directory-mcp-staging` | https://nlb-directory-mcp-staging.hi-7ac.workers.dev (endpoint `/mcp`) | `ebee76ef-7a01-402c-ad34-ef5d38414c71` |
| `ui-ux-pro-max-skill-redirect` | https://ui-ux-pro-max-skill-redirect.hi-7ac.workers.dev | `2ab0e4ea-5498-400b-993f-4fd3e8ffc23a` |

## 1. MCP worker

- **PR:** https://github.com/nextlevelbuilder/nlb-directory-toolkits/pull/18, branch `feat/hi-account-deploy` from `origin/main`. It changes one line, `account_id` in `packages/mcp/wrangler.jsonc`, and is not merged. Tests (113) and type-check pass.
- **Deploy:** built from that branch. The temporary deploy config dropped only the `mcp.nextlevelbuilder.io` custom-domain route, so the deploy is workers.dev only. The committed config keeps the route so the domain attaches on the first deploy after the zone is active.
- **Existing worker overwritten:** hi@ already had an `nlb-directory-mcp`, an older v0.2.0 upload from 2026-09-12 with no OAuth vars. It now runs v0.2.1 with OAuth enabled.
- **Vars** match the Digitop settings exactly. Production upstream is `NLB_API_URL=https://nextlevelbuilder.io`, with issuer `https://nextlevelbuilder.io/api/auth` and resource `https://mcp.nextlevelbuilder.io/mcp`. Staging upstream is `https://staging.nextlevelbuilder.io`.
- **Secrets:** Digitop production has `MCP_DELEGATION_SECRET` and `WORKER_AUTH_TOKEN`; Digitop staging has `MCP_DELEGATION_SECRET` only.
  - `MCP_DELEGATION_SECRET` was piped from `nlb-web-v2/.env` to both hi@ workers, never echoed. It is the same value the hi@ web workers use (64 characters, unquoted).
  - `WORKER_AUTH_TOKEN` exists on hi@ production, carried over from the 2026-09-12 upload. Whether it equals the Digitop value is unknown, because no local copy exists. See owner actions.
- **Verification** (both hosts):
  - `/health` returns ok, v0.2.1, 16 tools.
  - `initialize` returns protocol `2025-06-18`.
  - `tools/list` returns 16 tools.
  - `/.well-known/oauth-protected-resource` returns the expected resource and issuer.
  - A public `get_stats` call on production returned output identical to the live `mcp.nextlevelbuilder.io`.
  - Not verified: an OAuth-authorized call. It needs an interactive sign-in, which runbook step 8 covers after cutover.

## 2. ui-ux-pro-max-skill-redirect

- Downloaded the script read-only from Digitop. It is a 301 redirect to `https://uupm.cc`: allowlisted path prefixes keep their path and query, and any other path goes to `/`. Settings: compatibility date `2024-09-23`, no bindings, no secrets.
- Saved as `infra/ui-ux-pro-max-skill-redirect/worker.js` and `wrangler.jsonc`, pinned to hi@ with workers.dev on and no routes. The only code change is a named default export, for lint; the logic is the same.
- Committed and pushed to `dev` as `2932613`. Only these two files were staged.
- **Verification:** compared against live https://ui-ux-pro-max-skill.nextlevelbuilder.io. All 24 paths returned the same status and `Location`. They covered every allowlisted prefix, mixed case, query strings, fragments, unknown paths, `/demo` and `/api` without the trailing slash, and percent-encoding. POST and HEAD also matched.

## 3. cdn objects

- **References found: none.**
  - Production D1 `nlb-prod`: all 320 text columns in 47 tables were searched with read-only queries, and none contain `cdn.nextlevelbuilder.io`. The same method finds `nextlevelbuilder.io` in 11 tables, so the search works.
  - Old app source: only base-URL defaults (`.env.example`, `wrangler.jsonc`, `lib/media/r2.ts`, `app/api/v1/media/upload/route.ts`). No object keys.
  - Neon snapshot: the `assets` table is empty, and no row references the cdn host.
- **What cdn actually serves:** `cdn.nextlevelbuilder.io` is a custom domain on the Digitop bucket **`nextlevelbuilder`**, not `nlb-media-public`. That bucket holds 7 objects: 4 files and 3 zero-byte folder markers. All 7 were copied so the host behaves the same after the switch, which matters for external links such as skill READMEs.
- **Copy:** each object was downloaded over public HTTPS and uploaded with the same key and content-type into hi@ `nlb-media-public`, using the R2 token from `.env`. No key collided; the app's own media lives under `public/`.

| Key | Bytes | Content-Type | Result |
|---|---|---|---|
| `reports/analysis-260316-1532-inflow-digital-workers-vs-goclaw.html` | 51,350 | text/html; charset=utf-8 | match |
| `skills/3dviz/harness-village.gif` | 7,007,075 | image/gif | match |
| `skills/3dviz/wordmark-dark.svg` | 5,157 | image/svg+xml | match |
| `skills/3dviz/wordmark.svg` | 5,157 | image/svg+xml | match |
| `reports/`, `skills/`, `skills/3dviz/` (folder markers) | 0 | application/octet-stream | match |

- **Stats:** 7 of 7 copied, about 7.07 MB. Size, content-type and MD5 etag match the source listing for every object, so the bytes are identical. Missing objects: none.
- **Not copied:** the Digitop `nlb-media-public` bucket holds one object, `public/agentkit/80c6d0da-…png` (161 KB). No domain serves it and nothing references it.
- The custom domain was not attached.
- **Side effect to know about:** once `cdn.` points at `nlb-media-public`, the app's `public/…` media also becomes reachable at `cdn.nextlevelbuilder.io/public/…`. That is intended, since the bucket is public media.

## 4. Write freeze for the old site

**Recommended: a WAF custom rule on the Digitop zone**, applied by the owner in the dashboard at T0. It needs no deploy and no code change, takes effect at once, and is undone by disabling the rule.

The rule blocks every mutating method on the apex and `www`, plus the GET endpoints that write. The old app writes on GET only through Better Auth OAuth callbacks and email verification. `/go/<slug>` also records click analytics on GET, but that loss is accepted because it is small. The rule keeps `/api/webhooks/polar` open, matching runbook step 4.5–4.6, which reconciles those deliveries by redelivery.

Security → WAF → Custom rules → Create, action **Block**:

```
(http.host in {"nextlevelbuilder.io" "www.nextlevelbuilder.io"} and (
  (not http.request.method in {"GET" "HEAD" "OPTIONS"} and not starts_with(http.request.uri.path, "/api/webhooks/polar"))
  or starts_with(http.request.uri.path, "/api/auth/callback/")
  or starts_with(http.request.uri.path, "/api/auth/verify-email")
))
```

- **What it covers:** POST, PUT, PATCH and DELETE on `/api/auth/*` (sign-up, sign-in, OTP, device auth), `/api/checkout`, `/api/v1/products*`, `/api/v1/votes`, `/api/v1/api-keys*`, `/api/v1/media/upload`, `/api/v1/admin/decide`, and Next server actions, which are POSTs to page paths.
- **How to check it:** `curl -s -o /dev/null -w '%{http_code}' -X POST https://nextlevelbuilder.io/api/v1/votes` should return 403 from Cloudflare. A GET page should return 200.
- **MCP writes:** the Digitop MCP worker proxies writes to the apex API, so the rule should block them too. Check one MCP write tool after enabling the rule. Don't add `mcp.` to the host list, because MCP reads are also POSTs.
- **Rejected option:** a maintenance flag in the old app. It needs a code change plus a fresh OpenNext build and deploy to Digitop, which risks shipping drift from the current build. It is slower to roll back.

### Final sync

Run after T0, from the nlb-web-v2 repo root, following runbook step 4:

```bash
npx tsx scripts/migrate/run-migration.ts dump
npx tsx scripts/migrate/run-migration.ts convert
npx tsx scripts/migrate/run-migration.ts import --target production --final-sync --confirm-production
npx tsx scripts/migrate/run-migration.ts verify --target production --final-sync --confirm-production
npx tsx scripts/migrate/run-migration.ts rekey-jwks --target production --confirm-production
```

### Final-sync dry run (done now)

There is no `--dry-run` flag; the README's "dry run" means `--target local`. Instead I ran `dump`, `convert` and then `verify --target production --final-sync --confirm-production`. `verify` only runs SELECTs on D1, so this shows exactly which snapshot rows the import would write.

To leave the operator's existing `scripts/migrate/dump/` untouched, the run used an isolated copy of `scripts/migrate`. The only change in that copy was a `changedTargetRows` counter in the report. I deleted the scratch dump afterwards because it contains PII, and kept only the manifest and the verify report.

- Snapshot time: 2026-10-14T08:58:51Z. It has 43 tables and 6,392 rows, and `import-final-sync.sql` is 7.5 MB.
- **Delta: 79 inserts, 0 updates.**
  - `analytics_events`: 78 new rows (Neon 4,161, D1 4,083), from outbound clicks since the 2026-10-13 import.
  - `jwks_keys`: 1 row, which is expected. The import restores the Neon row and `rekey-jwks` deletes it by design.
- The other 41 tables match: users, accounts, orders, customers, sessions, webhook_events (2,024), and the rest. The v2-only rows reported as `extraTargetRows` are kept by final-sync.

## 5. BIND zone file

I skipped this task on the coordinator's instruction. The zone was already added on hi@ (Pending, nameservers marvin and tegan) and its 13 records were imported from the coordinator's own `scripts/dns/nextlevelbuilder-io.bind.txt`. I did not create a second `.bind` file and did not touch that file, the zone, DNS or nameservers.

## Owner actions

1. **At T0:** enable the WAF freeze rule above on the Digitop zone. Disable it to roll back.
2. **After the zone is Active on hi@,** attach the custom domains:
   - `mcp.nextlevelbuilder.io` → `nlb-directory-mcp`
   - `ui-ux-pro-max-skill.nextlevelbuilder.io` → `ui-ux-pro-max-skill-redirect`
   - R2 `nlb-media-public` → custom domain `cdn.nextlevelbuilder.io`

   The objects are already copied, so runbook step 6.1 is done.
3. **Toolkits PR #18:** before merging, switch the toolkits repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to hi@. The token needs Workers Scripts edit, plus routes and custom-domain rights on the zone. Merge only once the zone is Active, because the `main` deploy declares the `mcp.` custom domain.
4. **`WORKER_AUTH_TOKEN`:** if legacy static-token MCP clients must keep working, set the Digitop value on hi@ production. No local copy exists.

   ```bash
   env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08 npx wrangler secret put WORKER_AUTH_TOKEN --config packages/mcp/wrangler.jsonc --env=""
   ```

5. **After cutover:** move the staging MCP resource off the Digitop host on both sides together:
   - web staging `MCP_OAUTH_RESOURCE` in nlb-web-v2 `wrangler.jsonc`
   - toolkits staging `NLB_OAUTH_RESOURCE`

   Both still say `nlb-directory-mcp-staging.digitop-vn.workers.dev`, and that value is the token audience. Until both change, OAuth against the hi@ staging MCP host advertises the Digitop resource.
6. **Informational:** 6 production product logos point at `https://nextlevelbuilder-web.hi-7ac.workers.dev/media/...`. After cutover, re-run the ecosystem seed with `--media-origin https://nextlevelbuilder.io`, as the deployment guide says.

## Unresolved questions

- Does the Digitop zone's plan allow a custom block response, such as a JSON 503? On Free the rule shows the default 403 block page. That is functional, but less friendly.
- Are there legacy static-token MCP clients? If none, owner action 4 can be skipped.
