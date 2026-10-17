# Domain cutover: nextlevelbuilder.io → v2 (2026-10-14)

## Result
nextlevelbuilder.io now serves v2 from the hi@ Cloudflare account. The registry, 1.1.1.1 and 8.8.8.8 all return the new nameservers (`marvin`/`tegan.ns.cloudflare.com`), and Chrome opens the Constellation site at https://nextlevelbuilder.io. No resource on the Digitop account or in Neon was changed; both were only read.

## Timeline (UTC)
| Time | Step |
|---|---|
| 09:00 | The zone was added on hi@ (Free plan). The 13 DNS records were imported from `scripts/dns/nextlevelbuilder-io.bind.txt`, all DNS only. |
| 09:07 | Final data sync from Neon to production D1. A D1 backup was taken first. Verify passed on 43/43 tables, and the 6 listings created on v2 are intact. |
| 09:12 | `rekey-jwks` ran (backup first) and a new JWKS key was minted. |
| 09:19 | Nameservers changed at Spaceship from jim/emily to marvin/tegan. |
| 09:20–09:30 | Custom domains attached while the zone was still pending: apex, www, staging, mcp, ui-ux-pro-max-skill. |
| 09:33 | The zone became Active and every host answered over HTTPS. |
| 09:36 | `cdn.nextlevelbuilder.io` attached to `nlb-media-public`. The 6 listings were re-seeded with media origin https://nextlevelbuilder.io (D1 backup first). |
| 09:47 | Health-check fix deployed to production (`1a00c9b4`) and staging (`1cd40ae4`). |

## Verification
- Apex, www and staging: `/api/health` reports `ok` with `database: connected`. The main pages and agent files return 200, and the pages contain no workers.dev links.
- MX (Google), SPF, the Resend and Google DKIM keys, and the `send.` records all resolve from the new zone.
- `mcp.nextlevelbuilder.io`: `initialize` returns `nlb-directory-mcp 0.2.1`.
- `ui-ux-pro-max-skill.` redirects with 301 to https://uupm.cc/, the same as before.
- `cdn.`: a file that was copied over returns 200 with the right content type.
- Polar webhook: the path `/api/webhooks/polar` and the signing secret are the same on old and new (checked by hash), so Polar delivers to v2 automatically with no dashboard change.

## Bug found and fixed
`/api/health` always reported `degraded` because D1 rejects `sqlite_version()` with "not authorized to use function". The probe is now `SELECT 1` (commit `9f644e6` on `dev`). Tests pass (796) and typecheck is clean.

## Write freeze: decision
The planned freeze is a WAF rule on the Digitop zone. It was not applied, because Digitop resources must not be changed. The sync-time delta was tiny (78 click events plus 1 jwks row). The risk is writes that reach the old site through resolvers still caching the old nameservers, for up to about 6 hours (resolver NS TTL 21600 s).

## Still to do
1. **Catch-up sync after about 16:00 UTC today, once old caches have expired:**
   - Dump Neon and run `verify --final-sync` to see the delta.
   - If there are new rows (sign-ups, orders, votes), import with `--final-sync` (backup first). Upsert can overwrite rows edited on v2 since the cutover, so review the delta before importing.
2. **Polar:** check the webhook delivery log for events between 09:07Z and propagation, and redeliver any that went to the old site (event-id idempotency makes this safe).
3. **Owner:** before merging toolkits PR #18, switch the toolkits repo's CI secrets to hi@. The `mcp.` domain is already attached in the dashboard.
4. **Owner:** test sign-in by email OTP, GitHub and Google on the apex. Existing users have to sign in again.
5. **Owner:** grant the CI token D1 permission so deploys stop being manual.

## Rollback
At Spaceship, set the nameservers back to `jim.ns.cloudflare.com` and `emily.ns.cloudflare.com`. The old zone on Digitop is unchanged, so the old site serves again as resolvers switch back.

## Unresolved questions
- Do any old MCP clients use the static `WORKER_AUTH_TOKEN`? If so, the Digitop value has to be copied onto the hi@ MCP worker.
- Should the catch-up sync wait for your review of the delta, or should I run it right away once there are new rows?
