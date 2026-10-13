# Phase 05/06 — Blog HTTP contract (shared by web + toolkits)

Fixed contract. Web implements it (`app/api/v1/blog/*`), toolkits consume it (CLI + MCP). Changes need the controller.

## Auth
- Public reads: published posts only, no auth.
- Everything else: `resolveCaller(request.headers, undefined, { scope, method, path })` (session, `Authorization: Bearer nlb_...` API key, or MCP delegation). Reads of drafts/revisions use scope `mcp:read`; writes use `mcp:write`.
- Caller must have `user.role === "admin"` for any non-public operation → otherwise 403 `{ error: "Forbidden" }`. Missing caller → 401 `{ error: "Unauthorized" }`.

## Envelopes (match existing /api/v1)
- Success: `{ data }`, lists `{ data, pagination: { limit, offset, count } }`.
- Error: `{ error: string, details?: unknown }`. 400 validation (`details` = list of `{ path, message }`), 404, 409 conflict `{ error, currentVersion }`, 413 too large.
- Writes accept optional `Idempotency-Key` header (≤128 chars). Same key + same caller within 24h returns the stored response; same key with a different body → 422.

## Types
```ts
type BlogLocale = "en" | "vi";
type BlogStatus = "draft" | "published" | "archived";
interface BlogBlock { type: string; props: Record<string, unknown>; id?: string }
interface BlogSeo { title?: string; description?: string; ogImage?: string; canonical?: string; noindex?: boolean }
interface BlogPost {
  id: string; locale: BlogLocale; slug: string; title: string; description: string | null;
  blocks: BlogBlock[]; coverUrl: string | null; tags: string[]; seo: BlogSeo;
  authorName: string | null; status: BlogStatus; translationKey: string | null;
  publishedAt: string | null; version: number; createdAt: string; updatedAt: string; // ISO 8601
}
type BlogPostSummary = Omit<BlogPost, "blocks">;
interface BlogRevision { id: string; postId: string; version: number; note: string | null; actorId: string | null; createdAt: string; snapshot?: BlogPost }
interface BlogBlockDefinition { type: string; title: string; description: string; category: "section" | "primitive"; propsSchema: object /* JSON Schema */; example: BlogBlock }
```
Limits: slug `^[a-z0-9]+(?:-[a-z0-9]+)*$` ≤ 96; title ≤ 160; description ≤ 320; ≤ 60 blocks; serialized blocks ≤ 200 KB; ≤ 12 tags each ≤ 32 chars. A post is unique on (locale, slug).

## Endpoints
| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| GET | `/api/v1/blog/blocks` | public | — | `{ data: BlogBlockDefinition[] }` |
| POST | `/api/v1/blog/validate` | public | `{ blocks }` | `{ data: { valid: boolean, errors: {path,message}[] } }` |
| GET | `/api/v1/blog/posts?locale&status&tag&limit&offset` | public (published) / admin (`status=draft|archived|all`) | — | list of `BlogPostSummary` |
| POST | `/api/v1/blog/posts` | admin write | `{ locale, slug, title, description?, blocks, coverUrl?, tags?, seo?, translationKey?, authorName? }` | 201 `{ data: BlogPost }` (status draft, version 1); 409 if (locale,slug) exists |
| GET | `/api/v1/blog/posts/{idOrSlug}?locale=en` | public if published, else admin read | — | `{ data: BlogPost }` |
| PATCH | `/api/v1/blog/posts/{id}` | admin write | `{ version, ...any create field }` | `{ data: BlogPost }` version+1; 409 stale |
| POST | `/api/v1/blog/posts/{id}/publish` | admin write | `{ version }` | `{ data: BlogPost }` status published, publishedAt set (kept on republish) |
| POST | `/api/v1/blog/posts/{id}/unpublish` | admin write | `{ version }` | status draft |
| DELETE | `/api/v1/blog/posts/{id}?version=N` | admin write | — | archives: `{ data: BlogPost }` status archived |
| GET | `/api/v1/blog/posts/{id}/revisions` | admin read | — | `{ data: BlogRevision[] }` newest first, no snapshot |
| GET | `/api/v1/blog/posts/{id}/revisions/{revisionId}` | admin read | — | `{ data: BlogRevision }` with snapshot |
| POST | `/api/v1/blog/posts/{id}/revisions/{revisionId}/restore` | admin write | `{ version }` | `{ data: BlogPost }` content restored as new version, status unchanged |

Every successful write stores a revision snapshot of the resulting post.

## Toolkits surface (branch `feat/blog-management`)
- CLI: `nlb blog blocks`, `nlb blog validate <file>`, `nlb blog list [--locale --status --tag]`, `nlb blog get <idOrSlug> [--locale]`, `nlb blog create <file>`, `nlb blog update <id> <file> --version N`, `nlb blog publish|unpublish <id> --version N`, `nlb blog archive <id> --version N`, `nlb blog revisions <id>`, `nlb blog restore <id> <revisionId> --version N`. `<file>` is JSON (or `-` for stdin).
- MCP tools: `blog_list_blocks`, `blog_validate`, `blog_list_posts`, `blog_get_post`, `blog_create_post`, `blog_update_post`, `blog_publish_post`, `blog_unpublish_post`, `blog_archive_post`, `blog_list_revisions`, `blog_restore_revision`.
- Contracts: Zod schemas for the types above in the toolkits contracts package.
