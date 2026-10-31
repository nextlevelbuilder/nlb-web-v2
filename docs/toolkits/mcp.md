# MCP Server Documentation (`@nextlevelbuilder/mcp`)

The `@nextlevelbuilder/mcp` package implements a Model Context Protocol (MCP) server that exposes Next Level Builders Directory operations to AI agents and IDE assistants (Claude Desktop, Cursor, Codex, OpenCode).

## Transports

### 1. Stdio Transport (Local AI IDEs)
The stdio transport runs locally over standard input/output using line-delimited JSON-RPC 2.0 messages.

```bash
npx @nextlevelbuilder/mcp
```

#### Configuration:
- **Cursor** (`.cursor/mcp.json`):
  ```json
  {
    "mcpServers": {
      "nlb-directory": {
        "command": "npx",
        "args": ["-y", "@nextlevelbuilder/mcp"]
      }
    }
  }
  ```
- **Claude Desktop** (`claude_desktop_config.json`):
  ```json
  {
    "mcpServers": {
      "nlb-directory": {
        "command": "npx",
        "args": ["-y", "@nextlevelbuilder/mcp"],
        "env": {
          "NLB_API_KEY": "nlb_live_your_key"
        }
      }
    }
  }
  ```

---

### 2. Hosted Streamable HTTP endpoint

Hosted endpoint: **https://nextlevelbuilder.io/mcp** (staging: `https://staging.nextlevelbuilder.io/mcp`). The nlb-web-v2 Worker serves it in-process through `@nextlevelbuilder/mcp/http`; mounting and configuration are in [deployment-guide.md](../deployment-guide.md#mcp-server). The old host `https://mcp.nextlevelbuilder.io/mcp` keeps working for existing clients.

```typescript
import { createNlbMcpHttpHandler } from "@nextlevelbuilder/mcp/http";

const mcp = createNlbMcpHttpHandler({
  apiBaseUrl: "https://nextlevelbuilder.io",
  resource: "https://nextlevelbuilder.io/mcp",
  oauthIssuer: "https://nextlevelbuilder.io/api/auth",
  delegationSecret: env.MCP_DELEGATION_SECRET,
});
const response = await mcp(request); // null when the path is not an MCP route
```

Routes:
- `POST /mcp`: MCP 2026-07-28 over stateless Streamable HTTP. Clients on 2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05 are served through the SDK's legacy path. Notifications return `202`.
- `GET /mcp`, `DELETE /mcp`: `405` (no standalone stream or session).
- `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`: RFC 9728 protected-resource metadata.
- `GET /sse` + `POST /message?sessionId=`: the deprecated HTTP+SSE transport, bridged onto `/mcp`.
- `OPTIONS` on any of the above: CORS preflight. Requests with an untrusted `Host` or `Origin` get `403`.

An OAuth client needs only the endpoint:

```json
{
  "mcpServers": {
    "nlb-directory": { "url": "https://nextlevelbuilder.io/mcp" }
  }
}
```

Self-hosting: [`packages/mcp/wrangler.jsonc`](../../packages/mcp/wrangler.jsonc) builds a standalone Worker (`@nextlevelbuilder/mcp/worker`) on the same handler, adding `GET /health` and a `POST /` alias. It accepts a static `WORKER_AUTH_TOKEN` secret for full tool access when OAuth is off; each tool then still needs its upstream `api_key` (or the optional `NLB_API_KEY` secret). Keep local secrets in `packages/mcp/.dev.vars`, which git ignores. NLB's own CI no longer deploys this Worker.

### 3. OAuth 2.1 with an NLB account

The authorization server is the web's Better Auth provider at `<site>/api/auth`, found through `/.well-known/oauth-protected-resource/mcp`. It uses the existing NLB sign-in methods and asks the user to approve the requesting application.

- Authorization Code with PKCE S256 only; `iss` is on every authorization response (RFC 9207).
- Clients may use a Client ID Metadata Document URL as `client_id`, or register dynamically (kept for older clients).
- Tokens are bound to the MCP resource (RFC 8707). An authorization request without `resource` is bound to the canonical one. Access tokens last five minutes; refresh tokens rotate and reuse revokes the family.

| Scope | Permission |
| --- | --- |
| `mcp:read` | Read directory data, authorized product traffic, blog drafts and revisions (admins), Builder League and onboarding status |
| `mcp:write` | Submit products, upload media, vote, create checkout links, blog writes (admins), Builder League self-reported submissions and member actions, course video publishing (admins) |
| `mcp:keys` | List, create and revoke the user's API keys; newly created keys can outlive this OAuth grant |
| `mcp:operator` | NLB Live operator tools (`live_admin_*`). Only platform operators get it: for anyone else the consent screen hides it and the server drops it from the grant |

Public reads need no token. A protected call without a valid token returns `401` with a `WWW-Authenticate` challenge (`resource_metadata`, `scope`); a token missing the tool's scope returns `403 insufficient_scope`.

OAuth calls act as the signed-in account: do not pass `api_key`, `session_cookie` or a different `api_url`. The server validates the token's type, signature, issuer, audience, expiry and scopes, then calls the API with a separate `x-nlb-mcp-assertion` that lasts at most 60 seconds and is bound to the user, scope, HTTP method and path. OAuth access tokens and session cookies are never forwarded. The web reloads the current user and keeps its organization, ownership and Turnstile checks.

Manage and disconnect authorized clients at `/oauth/connections`. Disconnecting revokes the user's refresh-token families for that client and removes consent; already issued access tokens stay valid until they expire. API keys created through `mcp:keys` must be revoked separately.

---

## MCP Tools Reference

### 1. `validate_listing`
Validates a product document against `@nextlevelbuilder/contracts` and returns its canonical SHA-256 content hash.
- **Parameters**: `document` (object, required).
- **Returns**: `{ valid: boolean, contentHash?: string, errors?: Array }`.

### 2. `submit_product`
Submits a product document to the Next Level Builders Directory moderation queue. If the product requires a paid publishing slot, returns a direct Polar checkout URL.
- **Parameters**: `document` (object, required), `org_id` (string, required UUID), `api_key` (string, optional), `api_url` (string, optional), `notes` (string, optional), `is_fast_track` (boolean, optional), `pay_only` (boolean, optional).
- **Returns**:
  - Success: `{ status: "submitted", slug: string, submissionId: string, caseId?: string, contentHash: string, previewUrl: string }`.
  - Payment Required: `{ status: "payment_required", slug: string, message: string, checkoutUrl: string, amount: string, isEarlyBird?: boolean, slotNumber?: number, previewUrl: string }`.

### 3. `get_product`
Fetches product details and block outlines by slug. Supports both structured JSON and AI-optimized Markdown format.
- **Parameters**: `slug` (string, required), `format` ("json" | "markdown", optional), `api_url` (string, optional).
- **Returns**: Structured product object or `{ slug: string, markdown: string }`.

### 4. `get_product_markdown`
Exports product details as Markdown structured feed formatted for AI agents and LLM context windows.
- **Parameters**: `slug` (string, required), `api_url` (string, optional).
- **Returns**: `{ slug: string, markdown: string }`.

### 5. `list_products`
Lists published directory products with offset pagination.
- **Parameters**: `limit` (number, optional, default: 20), `offset` (number, optional, default: 0), `api_url` (string, optional).
- **Returns**: `{ data: Array, pagination: { limit: number, offset: number, count: number } }`.

### 6. `get_leaderboard`
Gets transparent community rankings leaderboard by timeframe window.
- **Parameters**: `window` ("daily" | "weekly" | "monthly", optional, default: "daily"), `api_url` (string, optional).
- **Returns**: `{ data: { windowType: string, ranks: Array<{ rank, productId, voteCount, score }> } }`.

### 7. `get_stats`
Gets live platform metrics (published products, click-outs, registered builders, total votes).
- **Parameters**: `api_url` (string, optional).
- **Returns**: `{ success: boolean, stats: { publishedCount, outboundClicks, registeredBuilders, totalVotes } }`.

### 8. `check_health`
Probes database and service runtime health. Sanitizes output to prevent internal stack trace exposure.
- **Parameters**: `api_url` (string, optional).
- **Returns**: `{ status: string, database: string, db_name?: string, products_count?: number, timestamp: string }`.

### 9. `cast_vote`
Casts an organic community vote for a product.
- **Parameters**: `product_id` (string, required UUID), `turnstile_token` (string, optional), `session_cookie` (string, optional), `api_url` (string, optional).
- **Returns**: Vote registration response. Requires OAuth `mcp:write` or a user session cookie.

### 10. `upload_media`
Uploads an image (up to 10MB) or video (up to 100MB) with strict MIME allowlist and size validation.
- **Parameters**: `file_base64` (string, required), `filename` (string, required), `mime_type` (string, optional), `folder` (string, optional), `api_key` (string, optional), `api_url` (string, optional).
- **Returns**: `{ success: boolean, url: string, storageKey?: string, provider?: string }`.

### 11. `create_checkout`
Generates a Polar checkout session URL for purchasing directory publishing slots or memberships using a Polar product UUID.
- **Parameters**: `product_id` (string, required Polar product UUID), `customer_email` (string, optional), `product_slug` (string, optional), `api_url` (string, optional).
- **Returns**: `{ url: string }`.

### 12. `list_templates`
Returns layout templates (SaaS Launch, AI Agent, Dev Tool, Community Curated, Minimalist) with supported block blueprints.
- **Parameters**: `template_name` (string, optional).
- **Returns**: List of templates or single detailed template blueprint.

### 13. `list_api_keys`
Lists active developer API keys for the current account.
- **Parameters**: `session_cookie` (string, optional), `api_url` (string, optional).
- **Returns**: `{ success: boolean, data: Array<{ id, name, prefix, enabled, createdAt, expiresAt }> }`. Requires OAuth `mcp:keys` or a user session cookie.

### 14. `create_api_key`
Creates a new developer API key. The raw secret key is returned only once.
- **Parameters**: `name` (string, required), `organization_id` (string, optional), `expires_days` (number, optional), `session_cookie` (string, optional), `api_url` (string, optional).
- **Returns**: `{ success: boolean, data: { id, name, prefix, key, expiresAt, createdAt } }`. Requires OAuth `mcp:keys` or a user session cookie.

### 15. `revoke_api_key`
Revokes an existing developer API key by ID.
- **Parameters**: `id` (string, required), `session_cookie` (string, optional), `api_url` (string, optional).
- **Returns**: `{ success: boolean, message: string }`. Requires OAuth `mcp:keys` or a user session cookie.

### 16. `get_product_traffic`

Queries organization-authorized traffic for an NLB-hosted product page.
- **Parameters**: `slug` (required), `from` and `to` (optional UTC ISO timestamps), `api_key` and `api_url` (optional).
- **Defaults**: `to` is now; `from` is 30 days before `to`. Increasing ranges up to 90 days are accepted; the end cannot be in the future.
- **Authentication**: OAuth callers need `mcp:read` and membership in the product organization (or admin access). The Worker signs a request-bound delegation assertion for the web API; it never forwards OAuth tokens or shared API keys. Stdio callers reuse `NLB_API_KEY`. Legacy Worker calls additionally require `Authorization: Bearer <WORKER_AUTH_TOKEN>`. Organization-scoped API keys must match the product organization.
- **Returns**: The [traffic response](contracts.md#product-traffic), including source, timestamps, totals, daily series, referrers, countries, devices, and active visitors. Unavailable data returns an MCP tool error.
- **Visitors**: Counts represent daily sessions. Identifiers reset each UTC day, so a returning session on the next day counts again; range totals are not unique people across the period.

```json
{
  "name": "get_product_traffic",
  "arguments": {
    "slug": "my-product",
    "from": "2026-08-01T00:00:00Z",
    "to": "2026-08-31T00:00:00Z"
  }
}
```

To add a public Analytics block, include `{ "id": "traffic-1", "type": "analytics", "props": { "title": "Traffic", "period": "30d" } }` in the product document's `blocks` array, validate with `validate_listing`, and submit with `submit_product`. Periods are `7d`, `30d`, or `90d`; omitted title/period default to `Traffic`/`30d`. Publishing the block opts into public aggregate totals and series. Detailed breakdowns stay organization-authorized.

### 17. Blog management tools

Wrap `/api/v1/blog/*` (see [blog contracts](contracts.md#blog-management)). Non-public operations require an admin account.

| Tool | Arguments | Notes |
|---|---|---|
| `blog_list_blocks` | — | Block catalogue with props JSON Schemas and examples. Call it before composing posts. Public. |
| `blog_validate` | `blocks` | Server-side validation; returns `{ valid, errors: [{ path, message }] }`. Public. |
| `blog_list_posts` | `locale?`, `status?` (`draft`, `published`, `archived`, `all`), `tag?`, `limit?`, `offset?` | Anonymous callers see published posts only. |
| `blog_get_post` | `id_or_slug`, `locale?` | Returns blocks and the current `version`. |
| `blog_create_post` | `post` (`{ locale, slug, title, blocks, description?, coverUrl?, tags?, seo?, translationKey?, authorName? }`) | Creates a draft. Returns 409 if (locale, slug) already exists. |
| `blog_update_post` | `post_id`, `version`, `changes` | Partial update. |
| `blog_publish_post` / `blog_unpublish_post` / `blog_archive_post` | `post_id`, `version` | Archive is a soft delete. |
| `blog_list_revisions` | `post_id` | Newest first. Always needs an identity. |
| `blog_restore_revision` | `post_id`, `revision_id`, `version` | Restores the revision as a new version. |

- Writes take an optional `idempotency_key`. Reuse it when you retry the same write. A random UUID is sent when it is omitted.
- A stale `version` returns a tool error `{ error, status: 409, currentVersion }`. Re-read with `blog_get_post` and retry. A server validation failure returns `{ error, status: 400, details: [{ path, message }] }`.
- OAuth: reads need `mcp:read` and writes need `mcp:write`. `blog_list_posts` and `blog_get_post` stay public when the caller is anonymous and forward the signed-in identity when one is present. Anonymous legacy Worker callers never use the Worker's configured `NLB_API_KEY` for blog reads.

### 18. Builder League tools

All call `/api/v1/builder-*` as the signed-in member. Reads need `mcp:read`, writes `mcp:write`.

| Tool | Route |
| --- | --- |
| `builder_get_access` | `GET /api/v1/builder-access` |
| `builder_get_me` | `GET /api/v1/builder-me` |
| `builder_list_projects` · `builder_create_project` | `GET` · `POST /api/v1/builder-projects` |
| `builder_list_evidence` · `builder_get_evidence` | `GET /api/v1/builder-evidence[/{id}]` |
| `builder_submit_evidence` | `POST /api/v1/builder-evidence` (always `self_reported`) |
| `builder_update_evidence` · `builder_withdraw_evidence` | `PATCH /api/v1/builder-evidence/{id}` |
| `builder_appeal_evidence` | `POST /api/v1/builder-evidence/{id}/appeal` |
| `builder_get_journey` | `GET /api/v1/builder-journey` |
| `builder_list_missions` · `builder_list_badges` | `GET /api/v1/builder-missions`, `/builder-badges` |
| `builder_get_seasons` · `builder_join_season` | `GET` · `POST /api/v1/builder-seasons` |
| `builder_get_rankings` | `GET /api/v1/builder-rankings` |
| `builder_list_rewards` | `GET /api/v1/builder-rewards` |
| `builder_get_time_capsule` · `builder_save_time_capsule` | `GET` · `POST /api/v1/builder-time-capsule` |
| `builder_get_passport` | `GET /api/v1/builder-passport/{userId}` |
| `builder_get_year` | `GET /api/v1/builder-year/{year}` |
| `builder_list_share_links` · `builder_revoke_share_link` | `GET /api/v1/builder-year/{year}/share`, `DELETE …/share/{id}` |
| `builder_list_year_videos` · `builder_request_year_video` | `GET` · `POST /api/v1/builder-year/{year}/render` |
| `builder_get_community_wrapped` | `GET /api/v1/builder-wrapped/{year}` |
| `builder_admin_list_queue` | `GET /api/v1/builder-admin/queue` (admin role) |
| `builder_admin_backfill_preview` | `POST /api/v1/builder-admin/backfill`, always a dry run (admin role) |

Agents can only submit `self_reported` evidence and can never approve, award or confirm. Peer confirmation, reward claims, privacy settings, hidden scenes, share-link creation, admin decisions, appeal resolution and backfill apply need a signed-in person and are only in the CLI. When `BUILDER_LEAGUE_ENABLED` is off for the caller, tools return "Builder League is not enabled on this environment".

### 19. `onboarding_get_status`

Returns the signed-in member's onboarding status from `GET /api/v1/onboarding-status` (`mcp:read`): membership tier and the Discord and Telegram access steps. Returns 404 when onboarding is disabled on the environment.

### 20. NLB Live operator tools

For platform operators who hold the `live:manage` grant. Every tool needs `mcp:operator` and calls `/api/v1/live-admin/*` as the signed-in operator. These routes stay out of the public OpenAPI document while `PUBLISH_LIVE_OPENAPI` is `false` ([`lib/openapi.ts`](../../lib/openapi.ts)).

- **Who gets the scope**: clients ask for every advertised scope, but the authorization server grants `mcp:operator` only to a user with an unrevoked `platform_operators` row ([`lib/mcp-oauth-config.ts`](../../lib/mcp-oauth-config.ts)). Members get a token without it and a `403 insufficient_scope` on these tools. An operator who is granted later must reconnect the client. A client registered before the scope existed keeps its old scope list, so the operator removes the server from the client and adds it again to register afresh. A code issued after a grant is revoked lacks the scope; refresh tokens keep their scope until they expire (30 days).
- **Checks on every call**: the web still checks the operator grant, so a revoked operator is refused even with an older token. API keys are refused. Every call, allowed or denied, is written to the operator audit trail.
- **Two-person rule**: `live_admin_refund_ticket`, `live_admin_cancel_event` and `live_admin_override_round_winner` need `approvalId`. Call `live_admin_request_approval` first, then a different operator calls `live_admin_decide_approval`. Without an approval the API answers `409 approval_required`.
- **Without OAuth** (stdio or Worker token): pass the operator's Better Auth `session_cookie` (or set `NLB_SESSION_COOKIE`).

| Tool | Route |
| --- | --- |
| `live_admin_list_events` · `live_admin_create_event` | `GET` · `POST /api/v1/live-admin/events` |
| `live_admin_get_event` · `live_admin_update_event` | `GET` · `PATCH /api/v1/live-admin/events/{id}` |
| `live_admin_set_event_capacity` | `POST …/events/{id}/capacity` |
| `live_admin_transition_event` | `POST …/events/{id}/transition` |
| `live_admin_create_event_product` | `POST …/events/{id}/polar-product` |
| `live_admin_open_event_sales` | `POST …/events/{id}/open-sales` |
| `live_admin_create_event_meeting` | `POST …/events/{id}/meeting` |
| `live_admin_cancel_event` | `POST …/events/{id}/cancel` (approval) |
| `live_admin_list_event_tickets` | `GET …/events/{id}/tickets` |
| `live_admin_refund_ticket` | `POST /api/v1/live-admin/tickets/{id}/refund` (approval) |
| `live_admin_list_topic_groups` · `live_admin_create_topic_group` | `GET` · `POST /api/v1/live-admin/topic-groups` |
| `live_admin_update_topic_group` · `live_admin_archive_topic_group` | `PATCH …/topic-groups/{id}` · `POST …/topic-groups/{id}/archive` |
| `live_admin_list_topics` · `live_admin_create_topic` | `GET` · `POST /api/v1/live-admin/topics` |
| `live_admin_update_topic` · `live_admin_archive_topic` | `PATCH …/topics/{id}` · `POST …/topics/{id}/archive` |
| `live_admin_list_rounds` · `live_admin_create_round` | `GET` · `POST /api/v1/live-admin/rounds` |
| `live_admin_finalize_round` | `POST …/rounds/{id}/finalize` |
| `live_admin_override_round_winner` | `POST …/rounds/{id}/override` (approval) |
| `live_admin_list_approvals` · `live_admin_request_approval` | `GET` · `POST /api/v1/live-admin/approvals` |
| `live_admin_get_approval` · `live_admin_decide_approval` | `GET …/approvals/{id}` · `POST …/approvals/{id}/decision` |
| `live_admin_list_audit` | `GET /api/v1/live-admin/audit` |
| `live_admin_get_metrics` | `GET /api/v1/live-admin/metrics` |
| `live_admin_run_sweeps` | `POST /api/v1/live-admin/sweeps` |

### 21. Course video tools

Tools over `/api/courses/*` (not `/api/v1`). The admin tools need `mcp:write` and an admin account; the web checks the role. Workflow and conventions: [docs/courses.md](../courses.md).

| Tool | Route |
|---|---|
| `course_list_videos` | `GET /api/courses/videos` (public, `mcp:read`) |
| `course_create_upload` | `POST /api/courses/uploads`: signed-only Stream upload, returns `streamUid` and a one-time tus `uploadUrl`. Send the file with `nlb courses put <file> <uploadUrl>`. |
| `course_get_upload` | `GET /api/courses/uploads/{uid}`: processing state, `durationSec`, `requireSignedUrls` |
| `course_create_video` · `course_update_video` | `POST /api/courses/videos` · `PATCH /api/courses/videos/{slug}` |
| `course_publish_video` | `POST /api/courses/videos/{slug}/publish` (creates the Polar product) |
| `course_get_transcript` | `GET /api/courses/videos/{slug}/transcript` (`mcp:read`, forwards the signed-in member). For buyers of the video and Premium/VIP members; others get 403 `purchase_required`. Pages with `offset`/`max_chars` (follow `nextOffset`) or searches with `query`. |
| `course_set_transcript` | `PUT /api/courses/videos/{slug}/transcript` (admin) |
