# NLB Live runbook

How to take NLB Live from "flag on, nothing scheduled" to a first paid session, and the follow-ups still open after the production launch. Design and rules: [live-and-access-adr.md](./live-and-access-adr.md). Commands that touch Cloudflare follow the account pin and `wr` helper in [deployment-guide.md](./deployment-guide.md).

## State on 2026-10-29

- `LIVE_ENABLED` is `"true"` in production ([`wrangler.jsonc`](../wrangler.jsonc)). `/live` and `/vi/live` show the empty state: no event, no voting round, no archive.
- Production has no platform operators, no Live events and no voting rounds.
- The Zoom secrets are not set in production, so joins answer `meeting_not_ready`.
- Live paths are not in the public OpenAPI document (`PUBLISH_LIVE_OPENAPI = false` in [`lib/openapi.ts`](../lib/openapi.ts)).

## Before the first live session

Do these in order. Each step says how to check it.

### 1. Set the Zoom secrets

Create a Zoom **Server-to-Server OAuth** app with meeting and registrant scopes. Then set its three values on the production Worker. Each command prompts for the value, so nothing lands in shell history:

```bash
wr secret put ZOOM_ACCOUNT_ID --env=""
wr secret put ZOOM_CLIENT_ID --env=""
wr secret put ZOOM_CLIENT_SECRET --env=""
```

Check: `wr secret list --name nextlevelbuilder-web` lists the three names. Never print the values. Staging needs the same three names (`--env staging`) for an end-to-end rehearsal.

### 2. Grant the first operators

The first operator cannot be approved by a second one, so it is granted out of band. [`scripts/grant-platform-operator.ts`](../scripts/grant-platform-operator.ts) prints the SQL and the pinned wrangler command and writes nothing itself:

```bash
npx tsx scripts/grant-platform-operator.ts --user <userId> --capability live:manage --note "Live launch" --env production
```

1. Take a D1 export first ([deployment-guide.md](./deployment-guide.md)).
2. Run the printed command.
3. Grant a **second** operator the same way. Ticket refunds, event cancellations and poll overrides (`live.ticket.refund`, `live.event.cancel`, `live.poll.override` in [`lib/operators/operator-actions.ts`](../lib/operators/operator-actions.ts)) need an approval from a different operator holding `live:manage` (`operator_approvals`), so one operator alone cannot do them.
4. Later grants and revocations (`operator.grant`, `operator.revoke`) go through the approval flow too, but under `system:manage`. Add `--capability system:manage` to the bootstrap grants if those two operators should manage the roster without the script.

Check: `SELECT user_id, capabilities, revoked_at FROM platform_operators` shows both users with `live:manage` and no `revoked_at`.

### Operator tools

Steps 3 to 5 call the operator API under `/api/v1/live-admin/`. An operator can run them from an MCP client connected to `https://nextlevelbuilder.io/mcp`: the `live_admin_*` tools wrap these routes ([MCP toolkit](./toolkits/mcp.md#20-nlb-live-operator-tools)). The connection must be authorized after the grant in step 2, because only operators receive the `mcp:operator` scope. A client connected before the operator tools shipped keeps its old scope list: remove the server from the client and add it again. Refunds, cancellations and winner overrides still need a second operator's approval (`live_admin_request_approval`, then `live_admin_decide_approval`).

### 3. Open a voting round

Use the operator API under `/api/v1/live-admin/`: topic groups, topics, then a round (`rounds`) with its voting window. Members vote on `/live` while the round is open.

Check: `/live` shows the round and its topics.

### 4. Schedule the event and open sales

Each step is an operator call under `/api/v1/live-admin/events`:

1. Create the event, with its title, start and end times and capacity.
2. Create its Polar product: `POST …/events/{id}/polar-product`. This is idempotent.
3. Open sales: `POST …/events/{id}/open-sales`.
4. Create the Zoom meeting right after opening sales, and in any case before the join window (15 minutes before start): `POST …/events/{id}/meeting`. This is idempotent. The member join path never creates a meeting.

Check, before announcing the event:

1. Buy a seat with a test account.
2. Confirm the `live_tickets` row and the `live:ticket:<eventId>` entitlement exist.
3. Refund the test order through Polar and confirm the seat is freed.

### 5. On the day

- From 15 minutes before start, ticket holders get their personal join link on the event page.
- If join answers `meeting_not_ready`, the meeting was not created (step 4.4) or the Zoom secrets are wrong (step 1). Join never creates a meeting, so a burst of members cannot cause duplicates.
- Tickets stored as `exception` are paid orders without a seat or without an account. Reconcile them as an operator and refund through Polar.

## Publish the Live API in OpenAPI

`/api/openapi.json` is an additive-only public contract. Once a Live path is published it cannot be withdrawn or renamed. Publish only after the first sessions have run without route changes:

1. Set `PUBLISH_LIVE_OPENAPI = true` in [`lib/openapi.ts`](../lib/openapi.ts).
2. Run the OpenAPI tests.
3. Ship through `dev` → `main`.

## Retire the standalone MCP Worker

`mcp.nextlevelbuilder.io` has been served by `nextlevelbuilder-web` since 2026-10-29 ([deployment-guide.md](./deployment-guide.md#mcpnextlevelbuilderio-on-the-web-worker)). The old Worker `nlb-directory-mcp` still exists with no domain attached, as a fallback.

1. Confirm that a signed-in MCP client (OAuth token for `https://mcp.nextlevelbuilder.io/mcp`) can list and call tools on the new Worker. A tool call that reads the member's own data is enough.
2. Delete the Worker: `wr delete --name nlb-directory-mcp`. This cannot be undone. The source stays in [`packages/mcp`](../packages/mcp) for self-hosting.

Rollback before step 2: point the domain back at the old Worker. Run the same Workers custom-domain API call described in the deployment guide, with `"service": "nlb-directory-mcp"`.

## Turn Live off

Set `LIVE_ENABLED` to `"false"` in [`wrangler.jsonc`](../wrangler.jsonc) and ship. Pages and member APIs answer 404, but operators keep their operator APIs. Paid tickets are not touched: refund them through the operator flow if an event is cancelled.
