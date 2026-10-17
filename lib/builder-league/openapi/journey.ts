/**
 * OpenAPI paths and schemas for the Builder League journey, Year in Review, Community Wrapped and
 * video render API, merged additively into lib/openapi.ts.
 *
 * While `BUILDER_LEAGUE_ENABLED` is off every route answers 404 except for admins and pilot members.
 */
const TAG = "Builder League: Journey & Year";
const AUTH = [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }];
const SESSION_ONLY = [{ SessionAuth: [] }];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const envelope = (data: unknown) => json({ type: "object", properties: { data } });
const yearParam = { name: "year", in: "path", required: true, schema: { type: "integer", minimum: 2026 }, description: "Calendar year in Asia/Ho_Chi_Minh (UTC+7)." };
const hidden = { description: "Not found, or hidden while the Builder League is off" };
const unauthorized = { description: "Sign in or send an API key" };
const sceneKeys = [
  "year_in_numbers", "first_idea", "validation", "pivotal_learning", "mvp", "launch",
  "first_customer", "community_impact", "league_highlights", "next_year",
];
const nullableString = { type: ["string", "null"] };
const nullableDate = { type: ["string", "null"], format: "date-time" };

export const journeyPaths: Record<string, unknown> = {
  "/api/v1/builder-journey": {
    get: {
      summary: "Read my builder journey",
      description: "The caller's journey, oldest first: verified and pending activity, corrections and reversals (each its own item, linked to what it supersedes), backfilled history labelled with its provenance, rank and badge awards. Keyset-paginated.",
      tags: [TAG],
      security: AUTH,
      parameters: [
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
        { name: "project", in: "query", schema: { type: "string" }, description: "Only items of this project." },
      ],
      responses: {
        "200": { description: "Journey page", content: json({ type: "object", properties: { data: { type: "object", properties: { items: { type: "array", items: ref("BuilderJourneyItem") }, projects: { type: "array", items: ref("BuilderJourneyProject") } } }, pagination: { type: "object", properties: { nextCursor: nullableString, limit: { type: "integer" } } } } }) },
        "401": unauthorized,
        "404": hidden,
      },
    },
  },
  "/api/v1/builder-year/{year}": {
    get: {
      summary: "Read my Year in Review",
      description: "The latest snapshot of the caller's year. Provisional until Dec 30 23:59 (UTC+7) has closed and while late approvals may land; final (immutable) after Dec 31 plus the moderation grace period. `review` is private; `shared` is exactly what a share link and the video show.",
      tags: [TAG],
      security: AUTH,
      parameters: [yearParam],
      responses: { "200": { description: "Year in Review", content: envelope(ref("BuilderYearReviewEnvelope")) }, "401": unauthorized, "404": hidden },
    },
    patch: {
      summary: "Hide scenes from my shared year",
      description: "Replaces the list of scenes kept out of the shared version and video. Session only: API keys and agents are refused.",
      tags: [TAG],
      security: SESSION_ONLY,
      parameters: [yearParam],
      requestBody: { required: true, content: json({ type: "object", required: ["hiddenScenes"], properties: { hiddenScenes: { type: "array", maxItems: 20, items: { type: "string", enum: sceneKeys } } } }) },
      responses: { "200": { description: "Saved", content: envelope({ type: "object", properties: { hiddenScenes: { type: "array", items: { type: "string" } } } }) }, "400": { description: "Unknown scene" }, "403": { description: "Session required" }, "404": hidden },
    },
  },
  "/api/v1/builder-year/{year}/share": {
    get: {
      summary: "List my Year in Review share links",
      tags: [TAG],
      security: AUTH,
      parameters: [yearParam],
      responses: { "200": { description: "Links (never tokens) and the visit → signup → paid funnel", content: envelope({ type: "object", properties: { links: { type: "array", items: ref("BuilderShareLink") }, funnel: ref("BuilderShareFunnel") } }) }, "404": hidden },
    },
    post: {
      summary: "Create a share link",
      description: "Returns the personal URL (with UTM tags) once; only a hash of its token is stored. At most 5 active links per year. Session only.",
      tags: [TAG],
      security: SESSION_ONLY,
      parameters: [yearParam],
      requestBody: { content: json({ type: "object", properties: { locale: { type: "string", enum: ["en", "vi"], default: "en" } } }) },
      responses: { "201": { description: "Created", content: envelope({ type: "object", properties: { link: ref("BuilderShareLink"), url: { type: "string", format: "uri" } } }) }, "403": { description: "Session required" }, "404": hidden, "409": { description: "Too many active links" } },
    },
  },
  "/api/v1/builder-year/{year}/share/{id}": {
    delete: {
      summary: "Revoke a share link",
      description: "Idempotent. The link stops resolving immediately.",
      tags: [TAG],
      security: AUTH,
      parameters: [yearParam, { name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Revoked", content: envelope({ type: "object", properties: { link: ref("BuilderShareLink") } }) }, "404": hidden },
    },
  },
  "/api/v1/builder-year/{year}/render": {
    get: {
      summary: "List my Year in Review video renders",
      tags: [TAG],
      security: AUTH,
      parameters: [yearParam],
      responses: { "200": { description: "Render jobs", content: envelope({ type: "object", properties: { jobs: { type: "array", items: ref("BuilderRenderJob") } } }) }, "404": hidden },
    },
    post: {
      summary: "Request a Year in Review video",
      description: "Queues a 30–60 second video of the shared scenes. Idempotent per snapshot and format; a failed or expired render is queued again. Outputs are private and kept 30 days.",
      tags: [TAG],
      security: AUTH,
      parameters: [yearParam],
      requestBody: { required: true, content: json({ type: "object", required: ["format"], properties: { format: { type: "string", enum: ["9x16", "16x9"] } } }) },
      responses: {
        "202": { description: "Queued", content: envelope({ type: "object", properties: { job: ref("BuilderRenderJob"), created: { type: "boolean" } } }) },
        "200": { description: "Existing job returned" },
        "404": hidden,
        "409": { description: "Nothing public to render" },
      },
    },
  },
  "/api/v1/builder-year/{year}/render/{jobId}/download": {
    get: {
      summary: "Download my rendered video or poster",
      tags: [TAG],
      security: AUTH,
      parameters: [yearParam, { name: "jobId", in: "path", required: true, schema: { type: "string" } }, { name: "part", in: "query", schema: { type: "string", enum: ["video", "poster"], default: "video" } }],
      responses: { "200": { description: "The file (private, no-store)", content: { "video/mp4": {}, "image/png": {} } }, "404": hidden },
    },
  },
  "/api/v1/builder-wrapped/{year}": {
    get: {
      summary: "Community Wrapped",
      description: "Public aggregate of the community's year. Every metric names its source, event types, verification levels, timeframe and denominator. Cohorts of fewer than 5 members are suppressed; no member is named.",
      tags: [TAG],
      parameters: [yearParam],
      responses: { "200": { description: "Community Wrapped", content: envelope(ref("BuilderCommunityWrapped")) }, "404": hidden },
    },
  },
  "/api/v1/builder-wrapped/visit": {
    post: {
      summary: "Record a shared Year in Review visit",
      description: "Beacon from a shared page. Sets a random first-party visitor cookie, stored only as a daily HMAC, plus the share reference used for signup attribution. No IP or user agent is stored. Clients must not call it when DNT or GPC is set.",
      tags: [TAG],
      requestBody: { required: true, content: json({ type: "object", required: ["token"], properties: { token: { type: "string" }, utm: { type: "object", additionalProperties: { type: "string" } } } }) },
      responses: { "200": { description: "Whether a new visit was counted", content: envelope({ type: "object", properties: { recorded: { type: "boolean" } } }) }, "404": hidden },
    },
  },
  "/api/v1/builder-admin/render-jobs": {
    get: {
      summary: "List render jobs (admin)",
      tags: [TAG],
      security: AUTH,
      parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["queued", "claimed", "done", "failed", "expired"] } }],
      responses: { "200": { description: "Jobs", content: envelope({ type: "object", properties: { jobs: { type: "array", items: ref("BuilderRenderJobAdmin") } } }) }, "403": { description: "Admin required (delegation refused)" } },
    },
  },
  "/api/v1/builder-admin/render-jobs/claim": {
    post: {
      summary: "Lease the next render job (renderer)",
      description: "Leases the oldest due job for 15 minutes and returns the public-safe scenes. `lease` must be sent back on complete or fail; a renderer whose lease expired is fenced out.",
      tags: [TAG],
      security: AUTH,
      responses: { "200": { description: "A leased job, or job: null", content: envelope({ type: "object", properties: { job: { oneOf: [ref("BuilderRenderJobAdmin"), { type: "null" }] }, lease: { type: "integer" }, displayName: { type: "string" }, review: ref("BuilderSharedYearReview"), labels: { type: "object", description: "Plain-string card and caption labels per locale (en, vi), so renderers never duplicate site copy. `titleTemplate` has `{name}` and `{year}` slots.", additionalProperties: { type: "object", additionalProperties: true } }, site: { type: "string", format: "uri", description: "Site origin shown on the outro card" } } }) }, "403": { description: "Admin required" } },
    },
  },
  "/api/v1/builder-admin/render-jobs/{id}/complete": {
    post: {
      summary: "Upload a finished render (renderer)",
      tags: [TAG],
      security: AUTH,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["lease", "video"], properties: { lease: { type: "integer" }, video: { type: "string", format: "binary", description: "video/mp4, at most 80 MB" }, poster: { type: "string", format: "binary", description: "image/png, at most 5 MB" } } } } } },
      responses: { "200": { description: "Done", content: envelope({ type: "object", properties: { job: ref("BuilderRenderJobAdmin") } }) }, "409": { description: "Lease lost" }, "413": { description: "File too large or empty" }, "503": { description: "Storage unavailable" } },
    },
  },
  "/api/v1/builder-admin/render-jobs/{id}/fail": {
    post: {
      summary: "Report a failed render (renderer)",
      description: "Re-queues with exponential backoff, or fails permanently after 5 attempts or when `permanent` is true.",
      tags: [TAG],
      security: AUTH,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: json({ type: "object", required: ["lease", "error"], properties: { lease: { type: "integer" }, error: { type: "string", maxLength: 2000 }, permanent: { type: "boolean" } } }) },
      responses: { "200": { description: "Recorded", content: envelope({ type: "object", properties: { job: ref("BuilderRenderJobAdmin") } }) }, "409": { description: "Lease lost" } },
    },
  },
};

const milestone = {
  type: "object",
  properties: {
    eventId: { type: "string" }, eventType: { type: "string" }, stage: { type: "string" },
    occurredAt: { type: "integer", description: "Epoch ms" }, localDate: { type: "string", format: "date" },
    projectId: nullableString, projectName: nullableString, title: nullableString,
    visibility: { type: "string" }, backfill: { type: "boolean" }, provenanceLabel: nullableString,
  },
};
const scene = {
  type: "object",
  properties: {
    key: { type: "string", enum: sceneKeys }, eventIds: { type: "array", items: { type: "string" } },
    occurredAt: { type: ["integer", "null"] }, facts: { type: "object", additionalProperties: { type: ["number", "string"] } }, publicSafe: { type: "boolean" },
  },
};

export const journeySchemas: Record<string, unknown> = {
  BuilderJourneyItem: {
    type: "object",
    properties: {
      id: { type: "string" },
      source: { type: "string", enum: ["event", "evidence", "rank", "badge"] },
      kind: { type: "string" }, eventType: { type: "string" }, stage: nullableString,
      occurredAt: { type: "integer", description: "Epoch ms" }, localDate: { type: "string", format: "date" },
      title: nullableString, summary: nullableString, projectId: nullableString, projectName: nullableString,
      verification: nullableString, visibility: { type: "string" },
      state: { type: "string", enum: ["verified", "self_reported", "pending", "needs_info", "rejected", "withdrawn", "corrected", "reversed", "revoked"] },
      rp: { type: "integer", description: "Net RP in the ledger for this event" },
      links: { type: "array", items: { type: "string", format: "uri" } },
      provenance: { oneOf: [{ type: "null" }, { type: "object", properties: { source: { type: "string" }, label: nullableString, originalAt: { type: "integer" }, importedAt: { type: "integer" } } }] },
      relations: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["corrects", "reverses", "corrected_by", "reversed_by", "led_to", "followed_pivot"] }, itemId: { type: "string" } } } },
      learning: { type: "boolean" }, rank: nullableString, badgeKey: nullableString,
    },
  },
  BuilderJourneyProject: { type: "object", properties: { projectId: nullableString, projectName: nullableString, firstAt: { type: "integer" }, lastAt: { type: "integer" }, itemIds: { type: "array", items: { type: "string" } } } },
  BuilderYearReviewEnvelope: {
    type: "object",
    properties: {
      year: { type: "integer" }, version: { type: "integer" }, status: { type: "string", enum: ["provisional", "final"] },
      rulesetVersion: { type: "string" }, createdAt: { type: "string", format: "date-time" },
      hiddenScenes: { type: "array", items: { type: "string" } },
      review: ref("BuilderYearReview"), shared: ref("BuilderSharedYearReview"),
    },
  },
  BuilderYearReview: {
    type: "object",
    description: "Private, deterministic snapshot: the same inputs always produce byte-identical JSON. Only verified, non-superseded activity counts; peers are named only with their consent.",
    properties: {
      schema: { type: "integer" }, year: { type: "integer" }, status: { type: "string", enum: ["provisional", "final"] },
      rulesetVersion: { type: "string" }, cutoffAt: { type: "integer" }, eventHash: { type: "string" },
      stats: { type: "object", additionalProperties: true }, score: { type: ["object", "null"], additionalProperties: true },
      milestones: { type: "array", items: milestone }, scenes: { type: "array", items: scene },
      archetype: { oneOf: [{ type: "null" }, { type: "object", properties: { key: { type: "string" }, basis: { type: "object" } } }] },
      peerMentions: { type: "array", items: { type: "object", properties: { userId: { type: "string" }, name: { type: "string" } } } },
      provenance: { type: "object", additionalProperties: true },
      missing: { type: "object", properties: { scenes: { type: "array", items: { type: "string" } }, trackedFrom: nullableString, untrackedBeforeTrackedFrom: { type: "boolean" } } },
    },
    additionalProperties: true,
  },
  BuilderSharedYearReview: {
    type: "object",
    description: "Public subset: public verified milestones only, no RP, score, private notes or time-capsule text; scenes the member hid are removed.",
    properties: {
      year: { type: "integer" }, status: { type: "string", enum: ["provisional", "final"] }, rulesetVersion: { type: "string" }, cutoffAt: { type: "integer" },
      stats: { type: "object", additionalProperties: true }, milestones: { type: "array", items: milestone }, scenes: { type: "array", items: scene },
      archetype: { oneOf: [{ type: "null" }, { type: "object" }] }, missing: { type: "object", additionalProperties: true },
    },
    additionalProperties: true,
  },
  BuilderShareLink: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: ["passport", "year_review"] }, year: { type: ["integer", "null"] }, createdAt: { type: "string", format: "date-time" }, revokedAt: nullableDate } },
  BuilderShareFunnel: { type: "object", properties: { visits: { type: "integer" }, signups: { type: "integer" }, paid: { type: "integer" } } },
  BuilderRenderJob: {
    type: "object",
    properties: {
      id: { type: "string" }, year: { type: "integer" }, format: { type: "string", enum: ["9x16", "16x9"] },
      status: { type: "string", enum: ["queued", "claimed", "done", "failed", "expired"] }, attempts: { type: "integer" },
      error: nullableString, expiresAt: nullableDate, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    },
  },
  BuilderRenderJobAdmin: {
    allOf: [ref("BuilderRenderJob"), { type: "object", properties: { userId: { type: "string" }, snapshotId: { type: "string" }, lockedUntil: nullableDate } }],
  },
  BuilderCommunityWrapped: {
    type: "object",
    properties: {
      version: { type: "integer" }, createdAt: { type: "string", format: "date-time" },
      year: { type: "integer" }, status: { type: "string", enum: ["provisional", "final"] },
      timeframe: { type: "object", properties: { start: { type: "integer" }, end: { type: "integer" }, cutoffAt: { type: "integer" }, timeZone: { type: "string" } } },
      minCohort: { type: "integer" }, backfilledEvents: { type: ["integer", "null"] }, eventHash: { type: "string" },
      metrics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: ["active_builders", "active_validators", "launches", "paying_products", "peer_help"] },
            value: { type: ["integer", "null"] }, unit: { type: "string" }, members: { type: ["integer", "null"] },
            denominator: { oneOf: [{ type: "null" }, { type: "object", properties: { key: { type: "string" }, value: { type: "integer" } } }] },
            extra: { type: "object", additionalProperties: { type: "integer" } }, suppressed: { type: "boolean" },
            source: { type: "string" }, eventTypes: { type: "array", items: { type: "string" } }, verification: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};
