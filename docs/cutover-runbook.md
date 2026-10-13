# Cutover runbook: nextlevelbuilder.io → hi@ account

This runbook moves the live domain from the old site (Digitop Cloudflare account, Neon) to nlb-web-v2 on the **hi@nextlevelbuilder.io** account (`7ac87c90789159ae1b10b7d78f5dcc08`). Run it top to bottom and record the time of each step.

**Who:** steps marked **[owner]** need the hi@ dashboard or the Spaceship registrar, so the account owner does them. The operator does the rest from a repo checkout.

**Never** delete or modify anything on the Digitop account or on Neon. Both are the rollback path.

`wr` below is the pinned wrangler helper defined in [deployment-guide.md](./deployment-guide.md#wrangler-access).

## 0. Preconditions

- [ ] The production worker `nextlevelbuilder-web` runs the intended `main` build and answers on `https://nextlevelbuilder-web.hi-7ac.workers.dev`. Staging is verified.
- [ ] A rehearsal migration verified on staging and production (see [data-migration-neon-to-d1.md](./data-migration-neon-to-d1.md)).
- [ ] Record the current nameservers for rollback: `dig NS nextlevelbuilder.io +short`.
- [ ] Check DNSSEC at Spaceship. If it is on, turn it off and wait for the DS record to expire before the nameserver change. Otherwise resolvers will fail validation against the new zone.
- [ ] The MCP worker is ready to deploy on hi@ (step 2).
- [ ] The old `cdn.` objects can be copied (step 6), or the gap is accepted.
- [ ] A write-freeze method for the old site is agreed (step 3).
- [ ] Pick a low-traffic window. Expect a short gap for users whose resolvers switch before the custom domains are attached.

## 1. Add the zone on hi@ [owner]

The CLI token cannot create zones, so add the zone in the dashboard:
1. In the hi@ dashboard, use **Add a domain** → `nextlevelbuilder.io` → Free plan.
2. Choose to **enter DNS records manually**, which skips the quick scan. A scan would copy proxied records that point at the Digitop workers.
3. Note the two assigned nameservers. The zone stays **Pending** until step 4.

Import the DNS records (mail, SPF, DKIM, site verification, Resend `send.`, the `go` CNAME) from [`scripts/dns/nextlevelbuilder-io-records.json`](../scripts/dns/nextlevelbuilder-io-records.json). Use a token scoped to this zone with **Zone: Read** and **DNS: Edit**. Enter it without echoing:

```bash
read -rs CF_ZONE_TOKEN && export CF_ZONE_TOKEN
scripts/dns/setup-zone-on-hi-account.sh   # finds the pending zone, skips records that already exist, prints status and nameservers
unset CF_ZONE_TOKEN
```

Check the dashboard: every record from the JSON is present. Apex, `www` and `staging` have **no** DNS records yet, because Workers custom domains create them in step 5.

## 2. Prepare the satellite services on hi@

These hostnames are served from the Digitop account. They stop resolving when the nameservers change unless they are recreated on hi@ (`workerCustomDomains` in the records JSON):

| Hostname | Today | Action |
|---|---|---|
| `mcp.nextlevelbuilder.io` | worker `nlb-directory-mcp` (toolkits repo, `packages/mcp/wrangler.jsonc` pins the Digitop account) | In the toolkits repo, retarget `account_id` to hi@ and set its secrets on hi@. Then deploy. Its `mcp.` custom domain attaches once the zone is active. |
| `ui-ux-pro-max-skill.nextlevelbuilder.io` | worker `ui-ux-pro-max-skill-redirect` (Digitop) | Redeploy on hi@ from its source repo |
| `cdn.nextlevelbuilder.io` | R2 custom domain on a Digitop bucket | Step 6 |

`MCP_DELEGATION_SECRET` must be **identical** on the web worker and the MCP worker of the same environment. It was rotated on 2026-10-13: one value is set on the staging and production web workers and stored as `MCP_DELEGATION_SECRET` in the repo `.env` (gitignored), which `provision-cloudflare.sh secrets` copies from. When you set up the MCP worker on hi@, put the same value on it without printing it:

```bash
# from the toolkits repo, with its wrangler pinned to hi@:
python3 -c 'import sys; [sys.stdout.write(l.strip().split("=",1)[1]) for l in open(sys.argv[1]) if l.startswith("MCP_DELEGATION_SECRET=")]' \
  /path/to/nlb-web-v2/.env | npx wrangler secret put MCP_DELEGATION_SECRET            # MCP worker, production
```

To rotate again, generate a new value, update `.env`, run `provision-cloudflare.sh secrets staging` and `secrets production`, then set it on the MCP worker. Assertions signed with the old value fail until both sides match.

## 3. Freeze writes on the old site

Stop new writes to Neon: sign-ups, submissions, votes, checkouts. The mechanism lives in the old app, for example a maintenance deploy that returns 503 for mutating requests. Record the freeze time **T0**.

Polar webhooks keep arriving at the old endpoint during the freeze. Anything delivered after the dump is not in D1. Step 4.6 reconciles it.

## 4. Final data sync

Follow the "final cutover sync" in [`scripts/migrate/README.md`](../scripts/migrate/README.md):

```bash
npx tsx scripts/migrate/run-migration.ts dump
npx tsx scripts/migrate/run-migration.ts convert
npx tsx scripts/migrate/run-migration.ts import --target production --confirm-production
npx tsx scripts/migrate/run-migration.ts verify --target production --confirm-production
npx tsx scripts/migrate/run-migration.ts rekey-jwks --target production --confirm-production
```

1. Import replaces the migrated tables. Anything written to v2 production before this point is lost (see [risks](./data-migration-neon-to-d1.md#risks-before-the-final-sync)).
2. The verify report must show equal counts and hashes for every table. If it fails twice, stop.
3. Spot-check `orders`, `subscriptions`, `customers` and `users` against Neon.
4. Confirm that an existing `nlb_live_` API key still works: `GET /api/v1/...` on the workers.dev host.
5. **[owner]** In the Polar dashboard, point the webhook endpoint to the production worker's workers.dev URL now: `https://nextlevelbuilder-web.hi-7ac.workers.dev/api/webhooks/polar`. The apex still resolves to the old site until propagation finishes. Keep the signing secret equal to the production `POLAR_WEBHOOK_SECRET`. If the endpoint is recreated rather than edited, set the new secret on the worker.
6. In Polar's webhook delivery log, find the events delivered to the old endpoint between the dump time and the switch, and **redeliver** them to the new endpoint. Event-id idempotency makes the redelivery safe.

## 5. Nameserver change and custom domains [owner]

1. At Spaceship, set custom nameservers for `nextlevelbuilder.io` to the two hi@ nameservers from step 1, replacing the old ones.
2. In the hi@ dashboard, wait for the zone to become **Active**. Use "Check nameservers" to speed this up.
3. Attach the Workers custom domains immediately. In the dashboard, open **Workers & Pages** → worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**:
   - `nextlevelbuilder.io` and `www.nextlevelbuilder.io` → `nextlevelbuilder-web`
   - `staging.nextlevelbuilder.io` → `nextlevelbuilder-web-staging`
   - `mcp.nextlevelbuilder.io` → `nlb-directory-mcp`, and `ui-ux-pro-max-skill.nextlevelbuilder.io` → its redirect worker. Skip these if their own `wrangler deploy` already declares them.

   If the dashboard accepts custom domains while the zone is still pending, attach them before the nameserver change to close the gap.
4. `wrangler.jsonc` declares no `routes`. After the next CI or manual deploy, confirm the custom domains are still attached.

## 6. CDN [owner]

1. Copy the old `cdn.` objects into `nlb-media-public`, for example with rclone, using S3 API keys for both accounts. Product media URLs in D1 point at `cdn.nextlevelbuilder.io`, so missing objects show up as broken images.
2. R2 → `nlb-media-public` → **Settings** → **Custom Domains** → connect `cdn.nextlevelbuilder.io`.

## 7. Third-party settings

| Service | Setting | Value |
|---|---|---|
| Polar **[owner]** | Webhook endpoint (after the apex serves v2) | `https://nextlevelbuilder.io/api/webhooks/polar` |
| Polar | Checkout success URLs | Nothing to change in Polar. They are built at checkout time from `NEXT_PUBLIC_APP_URL` ([`lib/polar.ts`](../lib/polar.ts), [`lib/courses/course-checkout.ts`](../lib/courses/course-checkout.ts)). Check that no static checkout links in the Polar dashboard point at another host. |
| GitHub OAuth app **[owner]** | Authorization callback URL | `https://nextlevelbuilder.io/api/auth/callback/github`. A GitHub OAuth app has one callback host, so staging needs its own app with `https://staging.nextlevelbuilder.io/api/auth/callback/github`. |
| Google OAuth client **[owner]** | Authorized redirect URIs and JavaScript origins | `https://nextlevelbuilder.io/api/auth/callback/google` (plus the staging equivalent); origins `https://nextlevelbuilder.io`, `https://www.nextlevelbuilder.io` |
| Turnstile | Widget hostnames | Production widget: `nextlevelbuilder.io` (which also covers `www`) plus the workers.dev host. Staging widget: `staging.nextlevelbuilder.io`, its workers.dev host, `localhost`. `scripts/provision-cloudflare.sh resources` sets them, so no change is needed. Re-running it resets the lists to the script's values. |

The callback paths come from Better Auth's default `/api/auth` base path and `BETTER_AUTH_URL`, which is the final domain per environment ([`lib/auth.ts`](../lib/auth.ts)). The old site used the same domain and the same paths, so these entries should already exist. Verify them rather than re-create them.

## 8. Verify

- [ ] `curl -sI https://nextlevelbuilder.io`, `https://www.nextlevelbuilder.io` and `https://staging.nextlevelbuilder.io` return 200 from the v2 worker (the v2 design, `/api/health` reports D1).
- [ ] `dig MX nextlevelbuilder.io` and the Resend/DKIM records resolve. Send a test email OTP.
- [ ] Email OTP, GitHub and Google sign-in work on the apex. Existing users must sign in again (expected after `rekey-jwks`).
- [ ] A vote passes Turnstile on the apex and on `www`.
- [ ] A Polar test checkout redirects to `/success`. The webhook delivery shows 2xx in Polar, and a `webhook_events` row exists.
- [ ] `mcp.nextlevelbuilder.io` answers. An MCP OAuth sign-in and one authorized call succeed.
- [ ] A `cdn.nextlevelbuilder.io` media URL from an existing product loads.
- [ ] `wr tail` (production) shows no error burst. Keep watching for 24 h.

## Rollback

| Point of failure | Action |
|---|---|
| Before step 5 | Nothing public changed. Point the Polar webhook back to the old endpoint and lift the freeze on the old site. |
| After the nameserver change | At Spaceship, restore the nameservers recorded in step 0. The old zone on Digitop is untouched, so the old site serves again as resolvers switch back. Point the Polar webhook back to the old endpoint. Writes made on v2 since the cutover exist only in D1 and must be reconciled into Neon by hand (Polar dashboard for orders). |
| Bad v2 deploy | `wr deployments list --env=""`, then `wr rollback <version-id> --env=""` |
| Bad data in D1 | `wr d1 time-travel restore DB --env="" --timestamp=<RFC3339>` (within 30 days), or restore the pre-import backup described in the migrate README |

## Afterwards

- Point staging `MCP_OAUTH_RESOURCE` (in `wrangler.jsonc`) away from the Digitop workers.dev MCP host.
- Delete `scripts/migrate/dump/` from the operator machine once cutover is stable.
- Decommission the Digitop workers and Neon only after an explicit owner decision. That is outside this runbook.
