/**
 * OpenAPI paths and schemas for the Builder League rankings API (member summary, boards, passport,
 * mentor nominations, snapshot finalization), merged additively into lib/openapi.ts.
 */
import { BOARD_KEYS, PERIOD_TYPES, RANK_KEYS, STAGES } from "../types";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const data = (schema: object, description: string) => ({ description, content: json({ type: "object", required: ["data"], properties: { data: schema } }) });
const error = (description: string) => ({ description, content: json(ref("BuilderError")) });
const nullable = (type: string, extra: object = {}) => ({ type: [type, "null"], ...extra });
const date = { type: "string", format: "date-time" };
const memberAuth = [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }];
const sessionAuth = [{ SessionAuth: [] }];
const stageNumbers = { type: "object", required: [...STAGES], properties: Object.fromEntries(STAGES.map((stage) => [stage, { type: "number" }])) };
const hidden = error("Builder League is not available to this caller (the feature flag hides it)");
const tags = ["Builder League"];

const privacyProperties = {
  leaderboardPublic: { type: "boolean", description: "List me on public builder boards." },
  passportPublic: { type: "boolean", description: "Show my Builder Passport on my public profile." },
  wrappedPublic: { type: "boolean", description: "Legacy switch with no effect. Year in Review share links open for anyone holding the link and are never indexed by search engines." },
  peerMentionsOk: { type: "boolean", description: "Others may name me in peer-help evidence." },
  backfillOptIn: { type: "boolean", description: "Import my earlier 2026 records into the league." },
  redactFinancials: { type: "boolean", description: "Hide payment details on public surfaces (default on)." },
};

export const rankingsSchemas: Record<string, unknown> = {
  BuilderError: {
    type: "object",
    required: ["error"],
    properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } },
  },
  BuilderPrivacy: { type: "object", properties: privacyProperties },
  BuilderLevel: {
    type: "object",
    required: ["level", "levelStartRp", "nextLevelRp", "rpIntoLevel", "rpToNext", "progress"],
    properties: {
      level: { type: "integer", minimum: 1, maximum: 100 },
      levelStartRp: { type: "integer" },
      nextLevelRp: nullable("integer"),
      rpIntoLevel: { type: "integer" },
      rpToNext: nullable("integer"),
      progress: { type: "number", minimum: 0, maximum: 1 },
    },
  },
  BuilderRankRequirement: {
    type: "object",
    required: ["key", "required", "actual", "met"],
    properties: {
      key: { type: "string", enum: ["rp", "tenure_days", "ship_or_contributor", "feedback_rate", "weekly_check_ins", "people_helped", "highlighted_posts", "featured_or_contributor", "mentor_nominations", "member_quota"] },
      required: { type: ["number", "boolean"] },
      actual: { type: ["number", "boolean"] },
      met: { type: "boolean" },
    },
  },
  BuilderMe: {
    type: "object",
    description: "Membership tier never changes RP, rank or League Score and is not part of this payload.",
    properties: {
      userId: { type: "string" },
      rp: { type: "integer", description: "Lifetime RP net of reversals." },
      level: ref("BuilderLevel"),
      rank: {
        type: "object",
        properties: {
          current: { type: "string", enum: [...RANK_KEYS], description: "Highest rank awarded; never downgraded automatically." },
          awardedAt: nullable("string", { format: "date-time" }),
          eligible: { type: "string", enum: [...RANK_KEYS] },
          next: nullable("string", { enum: [...RANK_KEYS, null] }),
          nextRequirements: { type: "array", items: ref("BuilderRankRequirement") },
          inactive: { type: "boolean", description: "No verified activity in 90 days. Informational; the rank stays." },
          lastActivityAt: nullable("string", { format: "date-time" }),
        },
      },
      week: { type: "object", properties: { periodKey: { type: "string", example: "2026-W42" }, score: { type: "number" }, components: stageNumbers } },
      pendingEvidence: { type: "integer" },
      privacy: ref("BuilderPrivacy"),
      rulesetVersion: { type: "string", example: "v2" },
    },
  },
  BuilderBoardEntry: {
    type: "object",
    properties: {
      rank: { type: "integer", description: "Position among publicly listed members." },
      userId: { type: "string" },
      name: { type: "string" },
      image: nullable("string"),
      score: { type: "number", description: "Overall: weighted League Score 0–100. Stage boards: capped stage RP. Rising: improvement over the previous period." },
      components: stageNumbers,
      verifiedEventCount: { type: "integer" },
      previousScore: { type: "number", description: "Rising board only." },
    },
  },
  BuilderRankings: {
    type: "object",
    properties: {
      board: { type: "string", enum: [...BOARD_KEYS] },
      periodType: { type: "string", enum: [...PERIOD_TYPES] },
      periodKey: { type: "string" },
      range: { type: "object", properties: { start: date, end: date } },
      previousKey: nullable("string"),
      nextKey: nullable("string"),
      snapshot: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["provisional", "final"] },
          revision: { type: "integer", minimum: 1 },
          rulesetVersion: { type: "string" },
          watermarkAt: date,
          eventHash: { type: "string", description: "sha256 of the ruleset version and the ledger entries behind the board." },
          supersedesId: nullable("string"),
        },
      },
      entries: { type: "array", items: ref("BuilderBoardEntry") },
      viewer: {
        ...nullable("object"),
        description: "The caller's own position among every member who scored, shown only to the caller.",
        properties: {
          position: { type: "integer" },
          outOf: { type: "integer" },
          score: { type: "number" },
          components: stageNumbers,
          verifiedEventCount: { type: "integer" },
          isPublic: { type: "boolean" },
          previousScore: { type: "number" },
        },
      },
    },
  },
  BuilderPassport: {
    type: "object",
    properties: {
      view: { type: "string", enum: ["public", "private"] },
      user: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, image: nullable("string"), memberSince: date } },
      rp: { type: "integer" },
      level: ref("BuilderLevel"),
      rank: { type: "object", properties: { key: { type: "string", enum: [...RANK_KEYS] }, awardedAt: nullable("string", { format: "date-time" }) } },
      stageMix: { type: "object", properties: Object.fromEntries(STAGES.map((stage) => [stage, { type: "object", properties: { rp: { type: "integer" }, share: { type: "number" } } }])) },
      milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            eventId: { type: "string" },
            eventType: { type: "string" },
            stage: { type: "string", enum: [...STAGES] },
            occurredAt: date,
            rp: { type: "integer" },
            projectId: nullable("string"),
            title: nullable("string"),
            links: { type: "array", items: { type: "string" } },
          },
        },
      },
      badges: { type: "array", items: { type: "object", properties: { badgeKey: { type: "string" }, seasonKey: { type: "string" }, awardedAt: date } } },
      projects: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, summary: { type: "string" }, stage: { type: "string", enum: [...STAGES] }, productId: nullable("string") } } },
      proofLinks: { type: "array", items: { type: "string" } },
      privacy: { ...ref("BuilderPrivacy"), description: "Private view only." },
    },
  },
};

export const rankingsPaths: Record<string, unknown> = {
  "/api/v1/builder-me": {
    get: {
      summary: "Read your Builder League summary",
      description: "Level, rank checklist, this week's League Score, pending evidence and privacy switches. Requires `builder:read`.",
      tags,
      security: memberAuth,
      responses: { "200": data(ref("BuilderMe"), "Summary"), "401": error("Sign in required"), "403": error("Builder League membership required"), "404": hidden },
    },
    patch: {
      summary: "Update your Builder League privacy",
      description: "Every public surface is opt-in and private by default. Consent changes need a signed-in browser session; API keys and agents get 403.",
      tags,
      security: sessionAuth,
      requestBody: { required: true, content: json({ type: "object", required: ["privacy"], additionalProperties: false, properties: { privacy: ref("BuilderPrivacy") } }) },
      responses: {
        "200": data(ref("BuilderMe"), "Updated summary"),
        "400": error("Validation failed"),
        "401": error("Sign in required"),
        "403": error("Session required or membership required"),
        "404": hidden,
        "429": error("Too many requests"),
      },
    },
  },
  "/api/v1/builder-rankings": {
    get: {
      summary: "Read a builder board",
      description: "Boards rank verified ledger RP per period in Asia/Ho_Chi_Minh time. Only members who opted in are listed; the caller's own position is returned in `viewer`. Ties break on verified events, then the earlier time the score was reached, then user id.",
      tags,
      security: memberAuth,
      parameters: [
        { name: "board", in: "query", required: false, schema: { type: "string", enum: [...BOARD_KEYS], default: "overall" } },
        { name: "period", in: "query", required: false, schema: { type: "string", enum: [...PERIOD_TYPES], default: "week" } },
        { name: "key", in: "query", required: false, description: "Period key such as 2026-W42, 2026-10, 2026 or S2026-1. Defaults to the current period.", schema: { type: "string" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
      ],
      responses: {
        "200": data(ref("BuilderRankings"), "Board"),
        "400": error("Unknown board, period or key, or a future period"),
        "401": error("Sign in required"),
        "403": error("Builder League membership required"),
        "404": hidden,
      },
    },
  },
  "/api/v1/builder-passport/{userId}": {
    get: {
      summary: "Read a Builder Passport",
      description: "The member and admins get the private view. Everyone else gets the public view, and only when the member opted in; otherwise 404. While the league is in pilot only admins and pilot members can read passports.",
      tags,
      security: [...memberAuth, {}],
      parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": data(ref("BuilderPassport"), "Passport"), "404": error("Unknown member, no consent, or league hidden") },
    },
  },
  "/api/v1/builder-admin/nominations": {
    post: {
      summary: "Nominate a member for a rank",
      description: "Admin browser session; the admin is the mentor. One nomination per mentor, member, rank and calendar year. Legend needs at least two. The rank gate is re-evaluated after the nomination.",
      tags,
      security: sessionAuth,
      requestBody: {
        required: true,
        content: json({
          type: "object",
          required: ["nomineeUserId"],
          additionalProperties: false,
          properties: { nomineeUserId: { type: "string" }, rank: { type: "string", enum: [...RANK_KEYS], default: "legend" }, note: { type: "string", maxLength: 1000 } },
        }),
      },
      responses: {
        "200": data({ type: "object" }, "Nomination already recorded"),
        "201": data({ type: "object", properties: { created: { type: "boolean" }, year: { type: "integer" }, rank: { type: "string" }, currentRank: { type: "string" }, awarded: nullable("string") } }, "Nomination recorded"),
        "400": error("Validation failed or self-nomination"),
        "401": error("Sign in required"),
        "403": error("Admin session required"),
        "404": error("Member not found, or league hidden"),
      },
    },
  },
  "/api/v1/builder-admin/snapshots/finalize": {
    post: {
      summary: "Finalize league snapshots",
      description: "Admin browser session. With `periodType` and `periodKey`, finalizes that period's boards (409 before the period end plus grace). With an empty body, finalizes every due period like the cron does. Final snapshots are immutable; later changes append a revision with `supersedesId`.",
      tags,
      security: sessionAuth,
      requestBody: { required: false, content: json({ type: "object", additionalProperties: false, properties: { periodType: { type: "string", enum: [...PERIOD_TYPES] }, periodKey: { type: "string" } } }) },
      responses: {
        "200": data({ type: "object" }, "Finalized snapshots or a summary of due periods"),
        "400": error("Validation failed"),
        "401": error("Sign in required"),
        "403": error("Admin session required"),
        "404": hidden,
        "409": error("Period not finalizable yet"),
      },
    },
  },
};
