/**
 * OpenAPI paths and schemas for /api/v1/blog, merged additively into lib/openapi.ts.
 * Block props schemas are derived from the runtime zod registry so docs never drift from validation.
 */
import { blockPropsJsonSchema, BLOG_BLOCK_TYPES, MAX_BLOCKS, MAX_BLOCKS_BYTES } from "./blocks/registry";
import { BLOG_LIMITS } from "./blog-post-schema";
import { BLOG_SLUG_RE, MAX_BLOG_SLUG_LENGTH } from "./blog-slug-rules";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const data = (schema: object, description: string) => ({ description, content: json({ type: "object", required: ["data"], properties: { data: schema } }) });
const error = (description: string) => ({ description, content: json(ref("BlogError")) });
const nullable = (type: string, extra: object = {}) => ({ type: [type, "null"], ...extra });
const date = { type: "string", format: "date-time" };
const adminAuth = [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }];
const idempotencyKey = { name: "Idempotency-Key", in: "header", required: false, description: "Optional, at most 128 visible ASCII characters. The same key and caller within 24 hours replays the stored response; reusing it with a different request returns 422.", schema: { type: "string", maxLength: 128 } };
const postId = { name: "id", in: "path", required: true, schema: { type: "string" } };
const revisionId = { name: "revisionId", in: "path", required: true, schema: { type: "string" } };
const versionBody = { required: true, content: json({ type: "object", required: ["version"], properties: { version: { type: "integer", minimum: 1 } } }) };
const writeErrors = {
  "400": error("Validation failed; `details` lists `{ path, message }` with dot-joined paths such as blocks.3.props.title"),
  "401": error("Authentication required"),
  "403": error("Admin role required"),
  "404": error("Post not found"),
  "409": { description: "Version conflict (`currentVersion` included) or slug/translation clash", content: json(ref("BlogError")) },
  "413": error(`Request or serialized blocks too large (blocks limit ${MAX_BLOCKS_BYTES} bytes)`),
  "422": error("Idempotency-Key reused with a different request"),
};

const postFields = {
  locale: { type: "string", enum: ["en", "vi"] },
  slug: { type: "string", pattern: BLOG_SLUG_RE.source, maxLength: MAX_BLOG_SLUG_LENGTH },
  title: { type: "string", minLength: 1, maxLength: BLOG_LIMITS.title },
  description: nullable("string", { maxLength: BLOG_LIMITS.description }),
  coverUrl: nullable("string"),
  tags: { type: "array", maxItems: BLOG_LIMITS.tags, items: { type: "string", minLength: 1, maxLength: BLOG_LIMITS.tagLength } },
  seo: ref("BlogSeo"),
  translationKey: nullable("string", { pattern: "^[A-Za-z0-9._-]{1,64}$" }),
  authorName: nullable("string", { maxLength: BLOG_LIMITS.authorName }),
};
const blocksField = { type: "array", maxItems: MAX_BLOCKS, items: ref("BlogBlock"), description: `At most ${MAX_BLOCKS} blocks and ${MAX_BLOCKS_BYTES} bytes of serialized JSON.` };
const summaryProperties = {
  id: { type: "string" },
  ...postFields,
  status: { type: "string", enum: ["draft", "published", "archived"] },
  publishedAt: nullable("string", { format: "date-time" }),
  version: { type: "integer", minimum: 1 },
  createdAt: date,
  updatedAt: date,
};

export const blogSchemas = {
  BlogError: { type: "object", required: ["error"], properties: { error: { type: "string" }, details: {}, currentVersion: { type: "integer" } } },
  BlogSeo: { type: "object", additionalProperties: false, properties: { title: { type: "string", maxLength: BLOG_LIMITS.title }, description: { type: "string", maxLength: BLOG_LIMITS.description }, ogImage: { type: "string" }, canonical: { type: "string", format: "uri" }, noindex: { type: "boolean" } } },
  BlogBlock: {
    description: "One widget block. `type` selects the props schema; see GET /api/v1/blog/blocks for titles, descriptions and examples.",
    oneOf: BLOG_BLOCK_TYPES.map((type) => ({
      type: "object",
      required: ["type", "props"],
      additionalProperties: false,
      properties: { type: { type: "string", const: type }, props: blockPropsJsonSchema(type), id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" } },
    })),
  },
  BlogBlockDefinition: {
    type: "object",
    required: ["type", "title", "description", "category", "propsSchema", "example"],
    properties: { type: { type: "string", enum: [...BLOG_BLOCK_TYPES] }, title: { type: "string" }, description: { type: "string" }, category: { type: "string", enum: ["section", "primitive"] }, propsSchema: { type: "object", description: "JSON Schema of `props`" }, example: ref("BlogBlock") },
  },
  BlogPostSummary: { type: "object", required: Object.keys(summaryProperties), properties: summaryProperties },
  BlogPost: { type: "object", required: [...Object.keys(summaryProperties), "blocks"], properties: { ...summaryProperties, blocks: blocksField } },
  BlogRevision: { type: "object", required: ["id", "postId", "version", "note", "actorId", "createdAt"], properties: { id: { type: "string" }, postId: { type: "string" }, version: { type: "integer" }, note: nullable("string"), actorId: nullable("string"), createdAt: date, snapshot: ref("BlogPost") } },
};

const createBody = { required: true, content: json({ type: "object", required: ["locale", "slug", "title", "blocks"], properties: { ...postFields, blocks: blocksField } }) };
const patchBody = { required: true, content: json({ type: "object", required: ["version"], minProperties: 2, properties: { version: { type: "integer", minimum: 1 }, ...postFields, blocks: blocksField } }) };
const tags = ["Blog"];

export const blogPaths = {
  "/api/v1/blog/blocks": { get: { operationId: "listBlogBlocks", summary: "List blog block types", tags, responses: { "200": data({ type: "array", items: ref("BlogBlockDefinition") }, "Block catalogue with JSON Schema and an example per type") } } },
  "/api/v1/blog/validate": {
    post: {
      operationId: "validateBlogBlocks", summary: "Validate a blocks array", tags,
      requestBody: { required: true, content: json({ type: "object", required: ["blocks"], properties: { blocks: { type: "array", items: {} } } }) },
      responses: { "200": data({ type: "object", required: ["valid", "errors"], properties: { valid: { type: "boolean" }, errors: { type: "array", items: { type: "object", required: ["path", "message"], properties: { path: { type: "string" }, message: { type: "string" } } } } } }, "Validation result (invalid blocks are still 200)"), "400": error("Body is not a JSON object") },
    },
  },
  "/api/v1/blog/posts": {
    get: {
      operationId: "listBlogPosts", summary: "List blog posts", tags,
      description: "Published posts are public. status=draft|archived|all requires an admin caller.",
      parameters: [
        { name: "locale", in: "query", schema: { type: "string", enum: ["en", "vi"] } },
        { name: "status", in: "query", schema: { type: "string", enum: ["published", "draft", "archived", "all"], default: "published" } },
        { name: "tag", in: "query", schema: { type: "string", maxLength: BLOG_LIMITS.tagLength } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
      ],
      responses: {
        "200": { description: "Post summaries (no blocks)", content: json({ type: "object", required: ["data", "pagination"], properties: { data: { type: "array", items: ref("BlogPostSummary") }, pagination: { type: "object", properties: { limit: { type: "integer" }, offset: { type: "integer" }, count: { type: "integer" } } } } }) },
        "400": error("Invalid query"), "401": error("Authentication required for non-published lists"), "403": error("Admin role required"),
      },
    },
    post: { operationId: "createBlogPost", summary: "Create a draft post", tags, security: adminAuth, parameters: [idempotencyKey], requestBody: createBody, responses: { "201": data(ref("BlogPost"), "Created draft (version 1)"), ...writeErrors } },
  },
  "/api/v1/blog/posts/{id}": {
    get: {
      operationId: "getBlogPost", summary: "Get a post by id or slug", tags,
      description: "`{id}` may be the post id or its slug. Published posts are public; drafts and archived posts are returned to admins only (404 otherwise).",
      parameters: [postId, { name: "locale", in: "query", schema: { type: "string", enum: ["en", "vi"] } }],
      responses: { "200": data(ref("BlogPost"), "The post"), "400": error("Invalid locale"), "404": error("Not found or not visible") },
    },
    patch: { operationId: "updateBlogPost", summary: "Update a post", tags, security: adminAuth, parameters: [postId, idempotencyKey], requestBody: patchBody, responses: { "200": data(ref("BlogPost"), "Updated post (version + 1)"), ...writeErrors } },
    delete: { operationId: "archiveBlogPost", summary: "Archive a post", tags, security: adminAuth, parameters: [postId, { name: "version", in: "query", required: true, schema: { type: "integer", minimum: 1 } }, idempotencyKey], responses: { "200": data(ref("BlogPost"), "Archived post"), ...writeErrors } },
  },
  "/api/v1/blog/posts/{id}/publish": { post: { operationId: "publishBlogPost", summary: "Publish a post", description: "Sets publishedAt on first publish and keeps it on republish.", tags, security: adminAuth, parameters: [postId, idempotencyKey], requestBody: versionBody, responses: { "200": data(ref("BlogPost"), "Published post"), ...writeErrors } } },
  "/api/v1/blog/posts/{id}/unpublish": { post: { operationId: "unpublishBlogPost", summary: "Unpublish a post (back to draft)", tags, security: adminAuth, parameters: [postId, idempotencyKey], requestBody: versionBody, responses: { "200": data(ref("BlogPost"), "Draft post"), ...writeErrors } } },
  "/api/v1/blog/posts/{id}/revisions": { get: { operationId: "listBlogRevisions", summary: "List revisions (newest first, no snapshot)", tags, security: adminAuth, parameters: [postId], responses: { "200": data({ type: "array", items: ref("BlogRevision") }, "Revisions"), "401": error("Authentication required"), "403": error("Admin role required"), "404": error("Post not found") } } },
  "/api/v1/blog/posts/{id}/revisions/{revisionId}": { get: { operationId: "getBlogRevision", summary: "Get a revision with its snapshot", tags, security: adminAuth, parameters: [postId, revisionId], responses: { "200": data(ref("BlogRevision"), "Revision with snapshot"), "401": error("Authentication required"), "403": error("Admin role required"), "404": error("Revision not found") } } },
  "/api/v1/blog/posts/{id}/revisions/{revisionId}/restore": { post: { operationId: "restoreBlogRevision", summary: "Restore a revision as a new version", description: "Content is restored; locale and status are unchanged.", tags, security: adminAuth, parameters: [postId, revisionId, idempotencyKey], requestBody: versionBody, responses: { "200": data(ref("BlogPost"), "Restored post"), ...writeErrors } } },
};
