/**
 * OpenAPI paths and schemas for Builder League privacy requests (admin export and delete), merged
 * additively into lib/openapi.ts.
 */
const TAG = "Builder League: Privacy";
const SESSION_ONLY = [{ SessionAuth: [] }];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const envelope = (data: unknown) => json({ type: "object", properties: { data } });
const userIdParam = {
  name: "userId",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" },
  description: "The member's account id. Tombstone ids (`deleted-…`) are refused.",
};
const adminOnly = { description: "Admin session required (API keys and agents are refused); 404 while the Builder League is off" };
const counts = { type: "object", additionalProperties: { type: "integer" } };

export const privacyPaths: Record<string, unknown> = {
  "/api/v1/builder-admin/privacy/{userId}/export": {
    get: {
      summary: "Export a member's Builder League data (admin)",
      description:
        "Everything the league stores about the member as one JSON download: privacy switches, pilot entry, projects, evidence (file keys only), appeals, events, ledger, badges, ranks, seasons, reward claims, Time Capsule, yearly snapshots, share links (never tokens) and their funnel counts, render jobs and the decision history without moderator ids. Each export is recorded in the moderation audit trail.",
      tags: [TAG],
      security: SESSION_ONLY,
      parameters: [userIdParam],
      responses: {
        "200": { description: "Export (served as an attachment, no-store)", content: envelope(ref("BuilderPrivacyExport")) },
        "400": { description: "Not a valid member id" },
        "401": adminOnly,
        "403": adminOnly,
        "404": { description: "No account and no league data with that id, or hidden while the Builder League is off" },
        "429": { description: "Rate limited" },
      },
    },
  },
  "/api/v1/builder-admin/privacy/{userId}/delete": {
    post: {
      summary: "Delete a member's Builder League data (admin)",
      description:
        "Irreversible. Deletes the member's private R2 files (evidence and rendered videos) first, then in one atomic D1 batch deletes evidence, appeals, privacy switches, pilot entry, projects, badges, ranks, nominations, season entries, reward claims (open claims give their unit back), Time Capsule notes, yearly snapshots, render jobs, share links and their attribution rows. Events, ledger entries, cap slots, audit rows and stored board entries are kept with the member's id replaced by a fresh tombstone id, so finalized boards still reproduce. The account itself is not deleted. Idempotent: a repeat reports `nothingToDo`. The body must repeat the member id and be sent as JSON. Admins cannot delete their own data.",
      tags: [TAG],
      security: SESSION_ONLY,
      parameters: [userIdParam],
      requestBody: {
        required: true,
        content: json({ type: "object", required: ["confirm"], additionalProperties: false, properties: { confirm: { type: "string", description: "Must equal the `userId` path parameter." } } }),
      },
      responses: {
        "200": { description: "Deleted", content: envelope(ref("BuilderPrivacyDeletion")) },
        "400": { description: "Invalid id, confirmation mismatch, or own account" },
        "401": adminOnly,
        "403": adminOnly,
        "404": { description: "Hidden while the Builder League is off" },
        "415": { description: "Body must be application/json" },
        "429": { description: "Rate limited" },
        "502": { description: "Private files could not be deleted; nothing in D1 was changed. Retry." },
      },
    },
  },
};

export const privacySchemas: Record<string, unknown> = {
  BuilderPrivacyExport: {
    type: "object",
    properties: {
      schema: { type: "integer", description: "Export format version" },
      userId: { type: "string" },
      exportedAt: { type: "string", format: "date-time" },
      notes: { type: "array", items: { type: "string" } },
      privacy: { type: ["object", "null"], additionalProperties: true },
      pilot: { type: ["object", "null"], additionalProperties: true },
      projects: { type: "array", items: { type: "object", additionalProperties: true } },
      evidence: { type: "array", items: { type: "object", additionalProperties: true } },
      appeals: { type: "array", items: { type: "object", additionalProperties: true } },
      confirmationsGiven: { type: "array", items: { type: "object", additionalProperties: true } },
      events: { type: "array", items: { type: "object", additionalProperties: true } },
      ledger: { type: "array", items: { type: "object", additionalProperties: true } },
      badges: { type: "array", items: { type: "object", additionalProperties: true } },
      ranks: { type: "array", items: { type: "object", additionalProperties: true } },
      nominations: { type: "array", items: { type: "object", additionalProperties: true } },
      seasons: { type: "array", items: { type: "object", additionalProperties: true } },
      rewardClaims: { type: "array", items: { type: "object", additionalProperties: true } },
      timeCapsule: { type: "array", items: { type: "object", additionalProperties: true } },
      yearlySnapshots: { type: "array", items: { type: "object", additionalProperties: true } },
      shareLinks: { type: "array", items: { type: "object", additionalProperties: true } },
      shareFunnel: { type: "object", properties: { visits: { type: "integer" }, signups: { type: "integer" }, paid: { type: "integer" } } },
      renderJobs: { type: "array", items: { type: "object", additionalProperties: true } },
      moderationHistory: { type: "array", items: { type: "object", additionalProperties: true } },
    },
  },
  BuilderPrivacyDeletion: {
    type: "object",
    properties: {
      tombstoneId: { type: "string", description: "Replaces the member's id in retained history. No mapping back is stored." },
      objectsDeleted: { type: "integer", description: "R2 keys deleted (missing keys count as deleted)" },
      deleted: { ...counts, description: "Rows deleted per table" },
      pseudonymised: { ...counts, description: "Rows rewritten with the tombstone id per table and column" },
      nothingToDo: { type: "boolean" },
    },
  },
};
