/** OpenAPI paths of the content operator domains: Courses, assets and the directory (`/api/v1/operator`). */
import { int, object, op, ref, str } from "./operator-openapi-shared";

const slugParam = { name: "slug", in: "path", required: true, schema: str };
const assetIdParam = { name: "id", in: "path", required: true, schema: str };
const limitParam = { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } };
const videoStatus = { type: "string", enum: ["draft", "published", "archived"] };
const videoFields = {
  title: { type: "string", minLength: 3, maxLength: 64 },
  description: { type: "string", maxLength: 5000 },
  locale: { type: "string", enum: ["en", "vi"] },
  weekNumber: { type: ["integer", "null"] },
  streamUid: { type: ["string", "null"] },
  durationSec: int,
  priceCents: int,
  currency: str,
  thumbnailUrl: { type: ["string", "null"], format: "uri" },
};

export const contentPaths: Record<string, unknown> = {
  "/api/v1/operator/courses/videos": {
    get: op("List Courses videos", "Every status; `?status=` filters. Needs `courses:manage`.", {
      params: [{ name: "status", in: "query", schema: videoStatus }],
      data: { type: "array", items: ref("OperatorCourseVideo") },
    }),
    post: op("Create a draft video", "The Polar product is created on publish. `slug_taken` (409).", {
      body: object({ slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }, ...videoFields }, ["slug", "title", "priceCents"]),
      status: "201",
      data: ref("OperatorCourseVideo"),
    }),
  },
  "/api/v1/operator/courses/videos/{slug}": {
    get: op("Get a Courses video", "Any status, with the Stream uid and Polar product.", { params: [slugParam], data: ref("OperatorCourseVideo") }),
    patch: op(
      "Update a Courses video",
      "Partial. `status` may only be `draft`: archiving needs the approval-gated archive route. `price_locked` (409) once the Polar product exists; `stream_uid_required` (422) when clearing the uid of a published video.",
      {
        params: [slugParam],
        body: object({ ...videoFields, status: { type: "string", enum: ["draft"] } }),
        data: ref("OperatorCourseVideo"),
      }
    ),
  },
  "/api/v1/operator/courses/videos/{slug}/publish": {
    post: op("Publish a Courses video", "Enforces signed-only Stream playback and creates the Polar product (idempotent). `stream_uid_required` (422) without a uid.", {
      params: [slugParam],
      data: ref("OperatorCourseVideo"),
    }),
  },
  "/api/v1/operator/courses/videos/{slug}/archive": {
    post: op(
      "Archive a Courses video",
      "Sensitive (`courses.video.archive`, target `{ slug }`): hidden from new buyers, existing buyers keep watching. Needs an approval decided by a different operator.",
      { params: [slugParam], body: object({ approvalId: str }, ["approvalId"]), data: ref("OperatorCourseVideo") }
    ),
  },
  "/api/v1/operator/assets": {
    get: op("List uploaded assets", "Every organization, newest first. Needs `assets:manage`.", {
      params: [
        { name: "status", in: "query", schema: { type: "string", enum: ["staging", "approved", "rejected"] } },
        { name: "orgId", in: "query", schema: str },
        limitParam,
      ],
      data: { type: "array", items: ref("OperatorAsset") },
    }),
  },
  "/api/v1/operator/assets/{id}/promote": {
    post: op("Promote an asset", "Staging only (`asset_not_staging`, 409). A promoted asset is public (`asset:<id>` download for anyone).", {
      params: [assetIdParam],
      data: ref("OperatorAsset"),
    }),
  },
  "/api/v1/operator/assets/{id}/reject": {
    post: op("Reject an asset", "Staging only (`asset_not_staging`, 409); the asset stays private to its organization.", {
      params: [assetIdParam],
      body: object({ reason: { type: "string", maxLength: 500 } }, ["reason"]),
      data: ref("OperatorAsset"),
    }),
  },
  "/api/v1/operator/directory/products": {
    get: op("List directory products", "Every organization and status (`?status=`). Needs `directory:manage`.", {
      params: [{ name: "status", in: "query", schema: { type: "string", pattern: "^[a-z_]{1,40}$" } }, limitParam],
    }),
  },
  "/api/v1/operator/directory/products/{id}": {
    get: op("Get a directory product", "Any status, with its current revision and its 20 most recent submissions and their moderation case.", {
      params: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/api/v1/operator/directory/moderation": {
    get: op("Moderation queue", "Cases with product and revision, highest priority first; `?status=` in_review (default), open or decided.", {
      params: [{ name: "status", in: "query", schema: { type: "string", enum: ["open", "in_review", "decided"], default: "in_review" } }, limitParam],
    }),
  },
  "/api/v1/operator/directory/moderation/{caseId}/decision": {
    post: op(
      "Decide a moderation case",
      "Session only (`session_required` for MCP delegations): a named human records the decision; `approved` publishes the product. `case_decided` (409) when already decided.",
      {
        params: [{ name: "caseId", in: "path", required: true, schema: str }],
        body: object(
          {
            decision: { type: "string", enum: ["approved", "changes_requested", "rejected", "quarantined"] },
            reasonCodes: { type: "array", minItems: 1, maxItems: 20, items: str },
            notes: { type: "string", maxLength: 2000 },
          },
          ["decision", "reasonCodes"]
        ),
      }
    ),
  },
  "/api/v1/operator/directory/rankings": {
    post: op("Compute a leaderboard snapshot", "Freezes the directory ranking for a window; `/api/v1/leaderboards` serves the newest snapshot.", {
      body: object({ windowType: { type: "string", enum: ["daily", "weekly", "monthly"] }, windowDate: { type: "string", format: "date" } }, ["windowType"]),
      status: "201",
    }),
  },
};

export const contentSchemas: Record<string, unknown> = {
  OperatorCourseVideo: {
    type: "object",
    properties: {
      id: str, slug: str, title: str, description: str, locale: { type: "string", enum: ["en", "vi"] },
      weekNumber: { type: ["integer", "null"] }, durationSec: int, priceCents: int, currency: str,
      thumbnailUrl: { type: ["string", "null"] }, publishedAt: { type: ["string", "null"], format: "date-time" }, hasTranscript: { type: "boolean" },
      status: videoStatus, streamUid: { type: ["string", "null"] }, polarProductId: { type: ["string", "null"] }, updatedAt: { type: "string", format: "date-time" },
    },
  },
  OperatorAsset: {
    type: "object",
    properties: {
      id: str, orgId: str, productId: { type: ["string", "null"] }, mimeType: str, sizeBytes: int, status: str,
      publicUrl: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" },
      promotedAt: { type: ["string", "null"], format: "date-time" }, storageKey: str, checksumSha256: str,
    },
  },
};
