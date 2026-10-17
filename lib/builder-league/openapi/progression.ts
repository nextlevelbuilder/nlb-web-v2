/**
 * OpenAPI paths and schemas for the Builder League progression API (badges, missions, seasons, rewards,
 * Time Capsule and the rewards admin), merged additively into lib/openapi.ts.
 */
const TAG = "Builder League Progression";
const ADMIN_TAG = "Builder League Admin";
const MEMBER_SECURITY = [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }];
const ADMIN_SECURITY = [{ SessionAuth: [] }];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const envelope = (schema: unknown) => json({ type: "object", required: ["data"], properties: { data: schema } });
const error = (description: string) => ({ description, content: json(ref("BuilderProgressionError")) });
const localeParam = {
  name: "locale",
  in: "query",
  required: false,
  schema: { type: "string", enum: ["en", "vi"], default: "en" },
  description: "Language of names and labels.",
};
const pathId = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });

const memberErrors = {
  "401": error("Sign in required (404 while the feature flag hides the league)"),
  "403": error("Builder League membership required"),
  "404": error("Not found, or the league is hidden from this caller"),
};
const writeErrors = {
  ...memberErrors,
  "400": error("Validation failed"),
  "413": error("Request body too large"),
  "429": error("Rate limited"),
};
const adminErrors = {
  "401": error("Sign in required"),
  "403": error("Admin session required (API keys and agents are refused)"),
  "404": error("Not found"),
  "429": error("Rate limited"),
};

const localized = { type: "object", required: ["en", "vi"], properties: { en: { type: "string" }, vi: { type: "string" } } };
const nullableDate = { type: "string", format: "date-time", nullable: true };

export const progressionPaths: Record<string, unknown> = {
  "/api/v1/builder-badges": {
    get: {
      summary: "List badges with your awards",
      description:
        "The full badge catalogue joined with the caller's standing awards. Pending awards are evaluated first (idempotent). Badges come only from verified evidence; paying, logging in and posting volume never award one.",
      tags: [TAG],
      security: MEMBER_SECURITY,
      parameters: [localeParam],
      responses: { "200": { description: "Badge catalogue", content: envelope({ type: "array", items: ref("BuilderBadge") }) }, ...memberErrors },
    },
  },
  "/api/v1/builder-missions": {
    get: {
      summary: "Suggested missions",
      description:
        "Stage-aware suggestions from the caller's verified history. A verified stop/pivot starts a new idea cycle at VALIDATE. No streaks, no deadlines; each mission links to the evidence form.",
      tags: [TAG],
      security: MEMBER_SECURITY,
      parameters: [localeParam],
      responses: { "200": { description: "Mission plan", content: envelope(ref("BuilderMissionPlan")) }, ...memberErrors },
    },
  },
  "/api/v1/builder-seasons": {
    get: {
      summary: "Current season and your check-ins",
      description: "Eight-week season (Vietnam time), the caller's optional enrollment, a weekly check-in of verified progress and the caller's placements in finalised past seasons.",
      tags: [TAG],
      security: MEMBER_SECURITY,
      responses: { "200": { description: "Season overview", content: envelope(ref("BuilderSeasonOverview")) }, ...memberErrors },
    },
    post: {
      summary: "Join or update a season",
      description: "Enrolls the caller in the current or next season with a track and an optional goal. Tracks never change scoring.",
      tags: [TAG],
      security: MEMBER_SECURITY,
      requestBody: { required: true, content: json(ref("BuilderSeasonEnrollmentInput")) },
      responses: { "200": { description: "Enrollment", content: envelope(ref("BuilderSeasonEnrollment")) }, ...writeErrors },
    },
  },
  "/api/v1/builder-rewards": {
    get: {
      summary: "Rewards you can work towards",
      description:
        "Active rewards that are open or upcoming, with per-requirement eligibility and the caller's claim for the current period, plus the caller's claim history. Rewards are opportunities, never cash; RP is never spent and membership tier never matters.",
      tags: [TAG],
      security: MEMBER_SECURITY,
      parameters: [localeParam],
      responses: {
        "200": {
          description: "Rewards and claims",
          content: envelope({
            type: "object",
            properties: { rewards: { type: "array", items: ref("BuilderMemberReward") }, claims: { type: "array", items: ref("BuilderRewardClaim") } },
          }),
        },
        ...memberErrors,
      },
    },
  },
  "/api/v1/builder-rewards/{id}/claim": {
    post: {
      summary: "Request a reward",
      description: "One request per reward and period. Signed-in session only. Inventory is reserved atomically; a moderator reviews every request.",
      tags: [TAG],
      security: [{ SessionAuth: [] }],
      parameters: [pathId("id")],
      requestBody: {
        required: false,
        content: json({ type: "object", properties: { note: { type: "string", maxLength: 500, nullable: true } } }),
      },
      responses: {
        "201": { description: "Claim requested", content: envelope(ref("BuilderRewardClaim")) },
        ...writeErrors,
        "403": error("Not eligible (details list each requirement), membership required, or not a session"),
        "409": error("Already claimed, not open, closed or out of stock"),
      },
    },
  },
  "/api/v1/builder-time-capsule": {
    get: {
      summary: "Your Time Capsule for a year",
      description: "Latest intent and reflection plus every earlier version (owner only).",
      tags: [TAG],
      security: MEMBER_SECURITY,
      parameters: [{ name: "year", in: "query", required: false, schema: { type: "integer", minimum: 2000, maximum: 2100 } }],
      responses: { "200": { description: "Capsule year", content: envelope(ref("BuilderTimeCapsuleYear")) }, ...memberErrors },
    },
    post: {
      summary: "Save a Time Capsule entry",
      description: "Appends a new version of the intent or reflection for last year, this year or next year. Private by default.",
      tags: [TAG],
      security: MEMBER_SECURITY,
      requestBody: { required: true, content: json(ref("BuilderTimeCapsuleInput")) },
      responses: { "201": { description: "Saved version", content: envelope(ref("BuilderTimeCapsuleEntry")) }, ...writeErrors },
    },
  },
  "/api/v1/builder-admin/rewards/items": {
    get: {
      summary: "List reward catalogue",
      tags: [ADMIN_TAG],
      security: ADMIN_SECURITY,
      responses: { "200": { description: "Every item", content: envelope({ type: "array", items: ref("BuilderAdminRewardItem") }) }, ...adminErrors },
    },
    post: {
      summary: "Create or update a reward",
      description: "Upsert by key. Eligibility may only use rank, badge, season placement or verified milestones. Audited.",
      tags: [ADMIN_TAG],
      security: ADMIN_SECURITY,
      requestBody: { required: true, content: json(ref("BuilderRewardItemInput")) },
      responses: { "200": { description: "Saved item", content: envelope(ref("BuilderAdminRewardItem")) }, "400": error("Validation failed"), ...adminErrors },
    },
  },
  "/api/v1/builder-admin/rewards/seed": {
    post: {
      summary: "Add the initial reward catalogue",
      description: "Idempotent. Adds missing items as inactive and leaves existing keys untouched. Audited.",
      tags: [ADMIN_TAG],
      security: ADMIN_SECURITY,
      responses: {
        "200": { description: "Created item ids", content: envelope({ type: "object", properties: { created: { type: "array", items: { type: "string" } } } }) },
        ...adminErrors,
      },
    },
  },
  "/api/v1/builder-admin/rewards/claims": {
    get: {
      summary: "List reward claims",
      tags: [ADMIN_TAG],
      security: ADMIN_SECURITY,
      parameters: [
        { name: "status", in: "query", required: false, schema: { type: "string", enum: ["requested", "approved", "rejected", "redeemed", "expired", "cancelled"] } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
      ],
      responses: {
        "200": {
          description: "Claims, newest first",
          content: envelope({
            type: "array",
            items: {
              allOf: [
                ref("BuilderRewardClaim"),
                { type: "object", properties: { memberName: { type: "string" }, rewardKey: { type: "string" }, rewardTitle: localized } },
              ],
            },
          }),
        },
        "400": error("Unknown status"),
        ...adminErrors,
      },
    },
  },
  "/api/v1/builder-admin/rewards/claims/{id}/decision": {
    post: {
      summary: "Decide a reward claim",
      description: "approve, reject, redeem, expire or cancel. Rejecting, expiring or cancelling returns the place to inventory exactly once. Audited.",
      tags: [ADMIN_TAG],
      security: ADMIN_SECURITY,
      parameters: [pathId("id")],
      requestBody: {
        required: true,
        content: json({
          type: "object",
          required: ["action"],
          properties: {
            action: { type: "string", enum: ["approve", "reject", "redeem", "expire", "cancel"] },
            note: { type: "string", maxLength: 500, nullable: true },
            redeemWithinDays: { type: "integer", minimum: 1, maximum: 365, description: "Approve only; default 30." },
          },
        }),
      },
      responses: {
        "200": { description: "Updated claim", content: envelope(ref("BuilderRewardClaim")) },
        "400": error("Validation failed"),
        "409": error("Invalid transition or the claim changed concurrently"),
        ...adminErrors,
      },
    },
  },
  "/api/v1/builder-admin/rewards/badges/{awardId}/revoke": {
    post: {
      summary: "Revoke a badge award",
      description: "Needs a reason. The award row stays with the reason so evaluation never re-grants it. Audited and recorded on the member's journey. Idempotent.",
      tags: [ADMIN_TAG],
      security: ADMIN_SECURITY,
      parameters: [pathId("awardId")],
      requestBody: { required: true, content: json({ type: "object", required: ["reason"], properties: { reason: { type: "string", minLength: 3, maxLength: 500 } } }) },
      responses: {
        "200": {
          description: "Revoked award",
          content: envelope({
            type: "object",
            properties: {
              id: { type: "string" },
              userId: { type: "string" },
              badgeKey: { type: "string" },
              seasonKey: { type: "string", nullable: true },
              revokedAt: nullableDate,
              revokeReason: { type: "string", nullable: true },
            },
          }),
        },
        "400": error("Reason missing"),
        ...adminErrors,
      },
    },
  },
};

const stage = { type: "string", enum: ["validate", "build", "ship", "contribute"] };
const visibility = { type: "string", enum: ["private", "community", "public"] };
const requirement = {
  type: "object",
  required: ["type", "label", "met"],
  properties: {
    type: { type: "string", enum: ["rank", "badge", "season_placement", "verified_milestone"] },
    label: { type: "string" },
    met: { type: "boolean" },
  },
  additionalProperties: true,
};

export const progressionSchemas: Record<string, unknown> = {
  BuilderProgressionError: {
    type: "object",
    required: ["error"],
    properties: {
      error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, details: {} } },
    },
  },
  BuilderBadge: {
    type: "object",
    properties: {
      key: { type: "string" },
      numeral: { type: "string", example: "IV" },
      stage,
      rarity: { type: "string", enum: ["common", "uncommon", "rare", "legendary"] },
      name: { type: "string" },
      description: { type: "string" },
      criteria: { type: "string" },
      seasonalName: { type: "string", nullable: true },
      earned: {
        type: "object",
        nullable: true,
        properties: { awardId: { type: "string" }, awardedAt: { type: "string", format: "date-time" }, evidenceCount: { type: "integer" } },
      },
      seasons: {
        type: "array",
        items: { type: "object", properties: { awardId: { type: "string" }, seasonKey: { type: "string" }, awardedAt: { type: "string", format: "date-time" } } },
      },
    },
  },
  BuilderMissionPlan: {
    type: "object",
    properties: {
      currentStage: stage,
      cycle: { type: "integer", minimum: 1 },
      cycleStartedAt: nullableDate,
      loopedBack: { type: "boolean" },
      recommended: { type: "array", items: { type: "string" } },
      missions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            stage,
            eventType: { type: "string" },
            status: { type: "string", enum: ["done", "in_review", "recommended", "available"] },
            revisit: { type: "boolean" },
            href: { type: "string", example: "/builder-league/evidence/new?type=validate_customer_interviews" },
            completedAt: nullableDate,
            title: { type: "string" },
            outcome: { type: "string" },
          },
        },
      },
    },
  },
  BuilderSeasonEnrollmentInput: {
    type: "object",
    properties: {
      seasonKey: { type: "string", description: "Current or next season; defaults to the current one." },
      track: { type: "string", enum: ["open", "validate", "build", "ship", "contribute"], default: "open" },
      goal: { type: "string", maxLength: 280, nullable: true },
    },
  },
  BuilderSeasonEnrollment: {
    type: "object",
    properties: {
      userId: { type: "string" },
      seasonKey: { type: "string" },
      track: { type: "string" },
      goal: { type: "string", nullable: true },
      joinedAt: { type: "string", format: "date-time" },
    },
  },
  BuilderSeasonOverview: {
    type: "object",
    properties: {
      season: {
        type: "object",
        properties: {
          key: { type: "string", example: "S2026-1" },
          number: { type: "integer" },
          start: { type: "string", format: "date-time" },
          end: { type: "string", format: "date-time" },
          week: { type: "integer", minimum: 0, maximum: 8 },
          weeks: { type: "integer", example: 8 },
          status: { type: "string", enum: ["upcoming", "active", "ended"] },
        },
      },
      nextSeasonKey: { type: "string" },
      enrollment: { allOf: [ref("BuilderSeasonEnrollment")], nullable: true },
      checkIns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            week: { type: "integer" },
            weekKey: { type: "string" },
            start: { type: "string", format: "date-time" },
            end: { type: "string", format: "date-time" },
            verified: { type: "object", additionalProperties: { type: "integer" } },
            inReview: { type: "integer" },
            quiet: { type: "boolean" },
            current: { type: "boolean" },
          },
        },
      },
      archive: {
        type: "array",
        items: {
          type: "object",
          properties: {
            seasonKey: { type: "string" },
            number: { type: "integer" },
            boards: { type: "array", items: { type: "object", additionalProperties: true } },
            myPlacements: {
              type: "array",
              items: {
                type: "object",
                properties: { board: { type: "string" }, place: { type: "integer" }, score: { type: "number", nullable: true }, entrants: { type: "integer" } },
              },
            },
          },
        },
      },
    },
  },
  BuilderRewardClaim: {
    type: "object",
    properties: {
      id: { type: "string" },
      rewardId: { type: "string" },
      userId: { type: "string" },
      periodKey: { type: "string" },
      status: { type: "string", enum: ["requested", "approved", "rejected", "redeemed", "expired", "cancelled"] },
      note: { type: "string", nullable: true },
      decidedAt: nullableDate,
      expiresAt: nullableDate,
      createdAt: { type: "string", format: "date-time" },
    },
  },
  BuilderMemberReward: {
    type: "object",
    properties: {
      id: { type: "string" },
      key: { type: "string" },
      kind: { type: "string", enum: ["editorial_exposure", "launch_review", "mentorship", "distribution_intro", "co_launch"] },
      title: { type: "string" },
      description: { type: "string" },
      inventory: { type: "integer", nullable: true, description: "Places left; null means no fixed limit." },
      availableFrom: nullableDate,
      availableUntil: nullableDate,
      availability: { type: "string", enum: ["open", "upcoming", "closed", "out_of_stock"] },
      periodKey: { type: "string", nullable: true },
      eligibility: {
        type: "object",
        nullable: true,
        properties: {
          eligible: { type: "boolean" },
          period: { type: "string", enum: ["season", "year", "once"] },
          allOf: { type: "array", items: requirement },
          anyOf: { type: "array", items: requirement },
        },
      },
      claim: { allOf: [ref("BuilderRewardClaim")], nullable: true },
    },
  },
  BuilderRewardItemInput: {
    type: "object",
    required: ["key", "kind", "title", "description", "eligibility"],
    properties: {
      key: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,62}$" },
      kind: { type: "string", enum: ["editorial_exposure", "launch_review", "mentorship", "distribution_intro", "co_launch"] },
      title: localized,
      description: localized,
      eligibility: {
        type: "object",
        required: ["period"],
        properties: {
          period: { type: "string", enum: ["season", "year", "once"] },
          allOf: { type: "array", items: { type: "object", additionalProperties: true } },
          anyOf: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
      inventory: { type: "integer", minimum: 0, maximum: 10000, nullable: true },
      budgetNote: { type: "string", maxLength: 500, nullable: true },
      availableFrom: nullableDate,
      availableUntil: nullableDate,
      active: { type: "boolean", default: false },
    },
  },
  BuilderAdminRewardItem: {
    allOf: [
      ref("BuilderRewardItemInput"),
      { type: "object", properties: { id: { type: "string" }, updatedAt: { type: "string", format: "date-time" } } },
    ],
  },
  BuilderTimeCapsuleInput: {
    type: "object",
    required: ["kind", "body"],
    properties: {
      year: { type: "integer", description: "Last, current or next year (Vietnam time); defaults to the current year." },
      kind: { type: "string", enum: ["intent", "reflection"] },
      body: { type: "string", minLength: 1, maxLength: 4000 },
      visibility: { ...visibility, default: "private" },
    },
  },
  BuilderTimeCapsuleEntry: {
    type: "object",
    properties: {
      id: { type: "string" },
      year: { type: "integer" },
      kind: { type: "string", enum: ["intent", "reflection"] },
      body: { type: "string" },
      visibility,
      version: { type: "integer" },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  BuilderTimeCapsuleYear: {
    type: "object",
    properties: {
      year: { type: "integer" },
      writableYears: { type: "array", items: { type: "integer" } },
      intent: { allOf: [ref("BuilderTimeCapsuleEntry")], nullable: true },
      reflection: { allOf: [ref("BuilderTimeCapsuleEntry")], nullable: true },
      history: { type: "array", items: ref("BuilderTimeCapsuleEntry") },
    },
  },
};
