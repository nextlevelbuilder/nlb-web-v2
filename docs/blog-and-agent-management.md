# Blog and agent management

Blog posts are an ordered list of typed **widget blocks**, like a page builder, not free HTML. Humans and agents manage them through one REST API. The `nlb` CLI and the MCP server in the toolkits repo are thin wrappers around that API.

## Why blocks

- **One catalogue**: [`lib/blog/blocks/registry.ts`](../lib/blog/blocks/registry.ts) maps each block `type` to a zod props schema, a JSON Schema, an example and a category (section or primitive). The API, the OpenAPI document, `GET /api/v1/blog/blocks` (read by the CLI and MCP) and the renderers all read it. A block is either supported everywhere or nowhere.
- **Type-checked rendering**: [`components/blog/blog-block-renderers.tsx`](../components/blog/blog-block-renderers.tsx) maps every block type exhaustively, so a block with no renderer fails `tsc`.
- **Safe by construction**:
  - Rendering uses React text nodes only. There is no `dangerouslySetInnerHTML`.
  - Links are limited to `/`, `#`, `http(s):` and `mailto:`.
  - Embeds are allowlisted, and the iframe `src` is rebuilt from parsed ids ([`lib/blog/blocks/embed-url.ts`](../lib/blog/blocks/embed-url.ts)).

To add a block:
1. Add a schema entry in `primitive-block-schemas.ts` or `section-block-schemas.ts`.
2. Add a renderer in `components/blog/`.
3. Add tests (`tests/blog-blocks.test.ts`, `tests/blog-renderers.test.ts`).

The registry also sets the limits: block count, serialized size and block id format (`MAX_BLOCKS`, `MAX_BLOCKS_BYTES` in the registry). The request body cap is `MAX_BODY_BYTES` in [`lib/blog/blog-route-helpers.ts`](../lib/blog/blog-route-helpers.ts).

## Data model

- `blog_posts` holds one row per `(locale, slug)`, with status draft, published or archived and an integer `version`. `blog_post_revisions` stores a snapshot of the previous state on every write. See [`lib/db/schema.ts`](../lib/db/schema.ts).
- Posts are per locale (`en`, `vi`). An optional `translationKey` links translations of the same post.
- Business logic lives in [`lib/blog/blog-post-service.ts`](../lib/blog/blog-post-service.ts). Queries are in `blog-queries.ts`, and the public SEO/JSON-LD in `blog-seo.ts`.

## REST API: `/api/v1/blog/*`

The contract is `/api/openapi.json` (blog paths in [`lib/blog/blog-openapi.ts`](../lib/blog/blog-openapi.ts)), rendered at `/api-docs`. Route handlers live in `app/api/v1/blog/`.

| Method and path | Who | CLI | MCP tool |
|---|---|---|---|
| `GET /blocks` | public | `nlb blog blocks` | `blog_list_blocks` |
| `POST /validate` | public | `nlb blog validate <file>` | `blog_validate` |
| `GET /posts` | public for published; admin for `status=draft\|archived\|all` | `nlb blog list` | `blog_list_posts` |
| `POST /posts` | admin | `nlb blog create <file>` | `blog_create_post` |
| `GET /posts/{idOrSlug}` | public if published; admin otherwise (404 for others) | `nlb blog get` | `blog_get_post` |
| `PATCH /posts/{idOrSlug}` | admin | `nlb blog update <id> <file> --version N` | `blog_update_post` |
| `DELETE /posts/{idOrSlug}?version=N` | admin. Archives the post (soft delete). | `nlb blog archive` | `blog_archive_post` |
| `POST /posts/{idOrSlug}/publish` · `/unpublish` | admin | `nlb blog publish` · `unpublish` | `blog_publish_post` · `blog_unpublish_post` |
| `GET /posts/{idOrSlug}/revisions` · `/revisions/{revisionId}` | admin | `nlb blog revisions` | `blog_list_revisions` |
| `POST /posts/{idOrSlug}/revisions/{revisionId}/restore` | admin | `nlb blog restore` | `blog_restore_revision` |

Paths are relative to `/api/v1/blog`. The exact flags and arguments are owned by the toolkits docs (see [below](#cli-and-mcp)).

### Write semantics

- **Auth**: every write runs through `handleBlogWrite` in [`lib/blog/blog-route-helpers.ts`](../lib/blog/blog-route-helpers.ts). That means `resolveCaller` (API key, session or MCP delegation with `mcp:write`), then `role === "admin"`. You get 401 without credentials and 403 for non-admins.
- **Optimistic concurrency**: updates, status changes and restores carry the current `version`. A stale version returns 409 with the current version. Re-read the post and retry.
- **Idempotency**: send an `Idempotency-Key` header on writes. The rules (scope, TTL, replay, conflict) are in the header comment of [`lib/blog/blog-idempotency.ts`](../lib/blog/blog-idempotency.ts).
- **Errors**: one JSON envelope from [`lib/blog/blog-errors.ts`](../lib/blog/blog-errors.ts). Validation failures list `path: message` per issue.

### Credentials for agents

- An admin creates an API key on `/profile`. Send it as `Authorization: Bearer <key>` or `x-api-key: <key>`. Keys are stored as SHA-256 hashes, so a key cannot be recovered after it is created.
- MCP clients authenticate to `mcp.nextlevelbuilder.io` with OAuth (`mcp:read`, `mcp:write`). The MCP worker then calls this API with a short-lived `x-nlb-mcp-assertion`, never with the user's token (see [system-architecture.md](./system-architecture.md#auth)).
- Delete temporary keys after smoke tests.

## CLI and MCP

They are owned by `nextlevelbuilder/nlb-directory-toolkits`. Use these sources for the current flags and arguments:
- CLI: `docs/cli.md`, section "`nlb blog ...` (admin)". There are 11 `nlb blog` subcommands, covering every row above.
- MCP: `docs/mcp.md`, section "Blog management tools".
- Wire contracts and limits: `docs/contracts.md#blog-management`.

> Availability: the blog CLI commands and MCP tools are on toolkits branch `feat/blog-management` and are not merged to `main`. A published `@nextlevelbuilder/cli` or a deployed MCP worker does not have them until that branch is merged and released.

The MCP worker allows only `nextlevelbuilder.io`, `staging.nextlevelbuilder.io` and loopback as API targets. It cannot reach the workers.dev hosts until after [cutover](./cutover-runbook.md).

## Public pages

- `/blog` and `/blog/<slug>` (and `/vi/...`), from `app/[locale]/blog/`.
- Markdown twins: append `.md`.
- Only published posts appear in the sitemap and discovery files.

## Smoke test (staging)

1. Create an admin API key on staging `/profile`.
2. Create a post: `POST /api/v1/blog/posts` with a body that passes `POST /api/v1/blog/validate`.
3. Publish it with its current `version`, then open `/blog/<slug>`.
4. Archive the smoke post (`DELETE ...?version=N`) and delete the key.
