/**
 * OpenAPI paths for the permission-aware member API (`/api/v1/courses`, `/assets`, `/directory/mine`,
 * `/leaderboards`), merged additively into lib/openapi.ts. Every resource is checked with the shared
 * `authorize()` policy; a deny answers 401 (`unauthenticated`) or 403 with the deny reason.
 */
const TAG = "Member access";
const CALLER_AUTH = [{ SessionAuth: [] }, { BearerAuth: [] }, { ApiKeyAuth: [] }];
const PUBLIC_AUTH = [{}, ...CALLER_AUTH];

const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const time = { type: "string", format: "date-time" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const envelope = (data: unknown) => json({ type: "object", properties: { data } });
const error = (description: string) => ({ description, content: json(ref("MemberAccessError")) });
const DENY = {
  "401": error("Sign in required (`unauthenticated`)"),
  "403": error("Denied by policy (`banned`, `insufficient_scope`, `no_entitlement`, `not_available`)"),
};

function op(summary: string, description: string, data: unknown, options: { params?: unknown[]; auth?: unknown[]; extra?: Record<string, unknown> } = {}) {
  return {
    summary,
    description,
    tags: [TAG],
    security: options.auth ?? CALLER_AUTH,
    ...(options.params ? { parameters: options.params } : {}),
    responses: { "200": { description: "OK", content: envelope(data) }, ...DENY, ...(options.extra ?? {}) },
  };
}

export const memberPaths: Record<string, unknown> = {
  "/api/v1/courses/library": {
    get: op(
      "My Courses library",
      "Every published video with `canWatch` decided by `video:<id>` watch (purchase, entitlement or a qualifying plan). `?owned=true` keeps only watchable videos.",
      { type: "array", items: ref("MemberCourseVideo") },
      { params: [{ name: "owned", in: "query", schema: { type: "string", enum: ["true", "false"] } }] }
    ),
  },
  "/api/v1/courses/videos/{slug}": {
    get: op("A Courses video with my access", "Published or archived video; `canWatch` is false for anonymous callers.", ref("MemberCourseVideo"), {
      auth: PUBLIC_AUTH,
      params: [{ name: "slug", in: "path", required: true, schema: str }],
      extra: { "404": error("Unknown or draft video (`video_not_found`)") },
    }),
  },
  "/api/v1/assets": {
    get: op("Assets of my organization", "Needs `org:<id>` read (organization membership). Newest first.", { type: "array", items: ref("MemberAsset") }, {
      params: [
        { name: "orgId", in: "query", required: true, schema: str },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
      ],
      extra: { "400": error("`orgId` missing (`invalid_input`)") },
    }),
  },
  "/api/v1/assets/{id}": {
    get: op(
      "One asset",
      "`asset:<id>` download: a promoted asset for anyone, any other asset for members of the owning organization. A missing asset is `not_available` (403).",
      ref("MemberAsset"),
      { auth: PUBLIC_AUTH, params: [{ name: "id", in: "path", required: true, schema: str }] }
    ),
  },
  "/api/v1/directory/mine": {
    get: op(
      "My directory products",
      "Products of every organization I belong to, any status; `?status=` filters.",
      {
        type: "object",
        properties: {
          organizations: { type: "array", items: { type: "object", properties: { orgId: str, name: str, slug: str, role: str } } },
          products: { type: "array", items: ref("MemberDirectoryProduct") },
        },
      },
      { params: [{ name: "status", in: "query", schema: str }] }
    ),
  },
  "/api/v1/leaderboards": {
    get: op(
      "Latest directory leaderboard",
      "The newest frozen snapshot for `?window=` (daily default); `data` is null before the first snapshot. Builder League boards are at `/api/v1/builder-rankings`.",
      { type: ["object", "null"], additionalProperties: true },
      {
        auth: PUBLIC_AUTH,
        params: [
          { name: "board", in: "query", schema: { type: "string", enum: ["directory"], default: "directory" } },
          { name: "window", in: "query", schema: { type: "string", enum: ["daily", "weekly", "monthly"], default: "daily" } },
        ],
        extra: { "400": error("Unknown board or window (`invalid_input`)") },
      }
    ),
  },
};

export const memberSchemas: Record<string, unknown> = {
  MemberAccessError: {
    type: "object",
    required: ["error"],
    properties: { error: { type: "object", required: ["code", "message"], properties: { code: str, message: str } } },
  },
  MemberCourseVideo: {
    type: "object",
    properties: {
      id: str, slug: str, title: str, description: str, locale: { type: "string", enum: ["en", "vi"] },
      weekNumber: { type: ["integer", "null"] }, durationSec: { type: "integer" }, priceCents: { type: "integer" }, currency: str,
      thumbnailUrl: nullableStr, publishedAt: { type: ["string", "null"], format: "date-time" }, hasTranscript: { type: "boolean" },
      status: { type: "string", enum: ["published", "archived"] }, canWatch: { type: "boolean" },
    },
  },
  MemberAsset: {
    type: "object",
    properties: {
      id: str, orgId: str, productId: nullableStr, mimeType: str, sizeBytes: { type: "integer" }, status: str,
      publicUrl: nullableStr, createdAt: time, promotedAt: { type: ["string", "null"], format: "date-time" },
    },
  },
  MemberDirectoryProduct: {
    type: "object",
    properties: {
      id: str, orgId: str, slug: str, title: str, tagline: str, websiteUrl: str, logoUrl: nullableStr, status: str,
      isFeatured: { type: "boolean" }, createdAt: time, updatedAt: time,
    },
  },
};
