import { z } from "zod";
import { HttpUrlSchema } from "./http-url.js";

/**
 * Public Builder League API payloads (`/api/v1/builder-*`) for external clients (CLI, MCP).
 * Vocabularies mirror `lib/builder-league/types.ts`; shapes mirror the route DTOs.
 */
export const BUILDER_STAGES = ["validate", "build", "ship", "contribute"] as const;
export const BUILDER_EVENT_TYPE_KEYS = [
  "validate_problem_signal", "validate_interviews", "validate_waitlist", "validate_wtp_commitment", "validate_stop_pivot",
  "build_scope_cut", "build_mvp", "build_first_real_user", "build_feedback_improvement",
  "ship_public_post", "ship_highlighted_post", "ship_product_launch", "ship_first_payment", "ship_distribution_case_study",
  "contribute_peer_help", "contribute_weekly_feedback", "contribute_contributor_work", "contribute_discord_active", "contribute_featured",
] as const;
export const BUILDER_VERIFICATIONS = ["self_reported", "peer_confirmed", "moderator_verified", "system_verified"] as const;
export const BUILDER_VISIBILITIES = ["private", "community", "public"] as const;
export const BUILDER_EVIDENCE_STATUSES = ["submitted", "needs_info", "approved", "rejected", "withdrawn"] as const;
export const BUILDER_EVENT_SOURCES = ["member", "api", "agent", "moderator", "system", "backfill", "discord", "directory"] as const;
export const BUILDER_BOARD_KEYS = ["overall", ...BUILDER_STAGES, "rising", "newcomers"] as const;
export const BUILDER_PERIOD_TYPES = ["week", "month", "year", "season"] as const;
export const BUILDER_RANK_KEYS = ["apprentice", "builder", "architect", "master", "legend"] as const;
export const BUILDER_EVENT_KINDS = ["activity", "reversal", "correction", "adjustment", "rank", "badge", "backfill"] as const;
export const BUILDER_BADGE_KEYS = [
  "signal_hunter", "idea_slayer", "first_builder", "first_ship", "first_dollar",
  "growth_explorer", "community_hero", "comeback_builder", "nlb_pioneer",
] as const;
export const BUILDER_MISSION_KEYS = [
  "problem_discovery", "customer_interviews", "qualified_waitlist", "willingness_to_pay", "scoped_mvp",
  "first_core_action", "public_launch", "distribution_experiment", "first_payment", "help_a_builder", "contributor_work",
] as const;

const stage = z.enum(BUILDER_STAGES);
const visibility = z.enum(BUILDER_VISIBILITIES);
const rankKey = z.enum(BUILDER_RANK_KEYS);
const isoDate = z.string().datetime();
const count = z.number().int().nonnegative();
const stageNumbers = z.object({ validate: z.number(), build: z.number(), ship: z.number(), contribute: z.number() });

// ---------------------------------------------------------------------------
// Envelope: success `{ data, pagination? }`, failure `{ error: { code, message, details? } }`
// ---------------------------------------------------------------------------

export const BuilderPaginationSchema = z.object({ nextCursor: z.string().nullable(), limit: z.number().int().positive() });
export const BuilderErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export const builderDataSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data });
export const builderPageSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data, pagination: BuilderPaginationSchema });

// ---------------------------------------------------------------------------
// Evidence: POST /api/v1/builder-evidence, GET /api/v1/builder-evidence[/{id}]
// ---------------------------------------------------------------------------

/** JSON body of an evidence submission. Multipart callers send the same fields plus `files`. */
export const SubmitBuilderEvidenceSchema = z.object({
  eventType: z.string().min(1).max(64),
  stage: stage.optional(),
  projectId: z.string().max(300).nullish(),
  title: z.string().min(3).max(140),
  summary: z.string().max(5000).optional(),
  /** `YYYY-MM-DD` (Asia/Ho_Chi_Minh midnight), an ISO timestamp or epoch ms; not in the future. */
  occurredAt: z.union([z.string().max(40), z.number()]),
  links: z.array(HttpUrlSchema.max(2048)).max(10).optional(),
  /** User id or `/builders/{id}` profile URL of the helped member or confirming counterparty. */
  counterparty: z.string().max(300).nullish(),
  visibility: visibility.optional(),
  clientKey: z.string().regex(/^[\x21-\x7e]{1,128}$/, "clientKey must be 1-128 visible ASCII characters.").optional(),
}).strict();

export const BuilderEvidenceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  projectId: z.string().nullable(),
  eventType: z.string(),
  stage,
  title: z.string(),
  summary: z.string(),
  occurredAt: isoDate,
  links: z.array(z.string()),
  /** Private files; always empty for the counterparty. */
  files: z.array(z.object({ name: z.string(), url: z.string() })),
  counterpartyUserId: z.string().nullable(),
  counterpartyConfirmedAt: isoDate.nullable(),
  status: z.enum(BUILDER_EVIDENCE_STATUSES),
  source: z.enum(BUILDER_EVENT_SOURCES),
  visibility,
  /** Omitted for the counterparty. */
  clientKey: z.string().optional(),
  decision: z.object({ reasonCodes: z.array(z.string()), note: z.string().nullable(), decidedAt: isoDate.nullable() }).nullable(),
  eventId: z.string().nullable(),
  appeal: z.object({
    id: z.string(),
    status: z.enum(["open", "upheld", "overturned", "withdrawn"]),
    resolution: z.string().nullable(),
    createdAt: isoDate,
    resolvedAt: isoDate.nullable(),
  }).nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

// ---------------------------------------------------------------------------
// Rankings: GET /api/v1/builder-rankings
// ---------------------------------------------------------------------------

export const BuilderBoardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  score: z.number(),
  components: stageNumbers,
  verifiedEventCount: count,
  /** Rising board only. */
  previousScore: z.number().optional(),
});
export const BuilderViewerPositionSchema = z.object({
  position: z.number().int().positive(),
  outOf: count,
  score: z.number(),
  components: stageNumbers,
  verifiedEventCount: count,
  isPublic: z.boolean(),
  previousScore: z.number().optional(),
});
export const BuilderRankingsSchema = z.object({
  board: z.enum(BUILDER_BOARD_KEYS),
  periodType: z.enum(BUILDER_PERIOD_TYPES),
  periodKey: z.string(),
  range: z.object({ start: isoDate, end: isoDate }),
  previousKey: z.string().nullable(),
  nextKey: z.string().nullable(),
  snapshot: z.object({
    id: z.string(),
    status: z.enum(["provisional", "final"]),
    revision: z.number().int().positive(),
    rulesetVersion: z.string(),
    watermarkAt: isoDate,
    eventHash: z.string(),
    supersedesId: z.string().nullable(),
  }),
  entries: z.array(BuilderBoardEntrySchema),
  viewer: BuilderViewerPositionSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Passport: GET /api/v1/builder-passport/{userId}
// ---------------------------------------------------------------------------

export const BuilderLevelSchema = z.object({
  level: z.number().int(),
  levelStartRp: z.number(),
  nextLevelRp: z.number().nullable(),
  rpIntoLevel: z.number(),
  rpToNext: z.number().nullable(),
  progress: z.number().min(0).max(1),
});
export const BuilderPrivacySchema = z.object({
  leaderboardPublic: z.boolean(),
  passportPublic: z.boolean(),
  wrappedPublic: z.boolean(),
  peerMentionsOk: z.boolean(),
  backfillOptIn: z.boolean(),
  redactFinancials: z.boolean(),
});
export const BuilderPassportSchema = z.object({
  view: z.enum(["public", "private"]),
  user: z.object({ id: z.string(), name: z.string(), image: z.string().nullable(), memberSince: isoDate }),
  rp: z.number().int(),
  level: BuilderLevelSchema,
  rank: z.object({ key: rankKey, awardedAt: isoDate.nullable() }),
  stageMix: z.object({
    validate: z.object({ rp: z.number(), share: z.number() }),
    build: z.object({ rp: z.number(), share: z.number() }),
    ship: z.object({ rp: z.number(), share: z.number() }),
    contribute: z.object({ rp: z.number(), share: z.number() }),
  }),
  milestones: z.array(z.object({
    eventId: z.string(),
    eventType: z.string(),
    stage,
    occurredAt: isoDate,
    rp: z.number().int(),
    projectId: z.string().nullable(),
    title: z.string().nullable(),
    links: z.array(z.string()),
    /** Private view only. */
    visibility: visibility.optional(),
  })),
  badges: z.array(z.object({ badgeKey: z.string(), seasonKey: z.string(), awardedAt: isoDate })),
  projects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    summary: z.string(),
    stage,
    productId: z.string().nullable(),
    /** Private view only. */
    visibility: visibility.optional(),
  })),
  proofLinks: z.array(z.string()),
  /** Private view only. */
  privacy: BuilderPrivacySchema.optional(),
});

// ---------------------------------------------------------------------------
// Journey: GET /api/v1/builder-journey (timestamps are epoch ms)
// ---------------------------------------------------------------------------

export const BuilderJourneyItemSchema = z.object({
  id: z.string(),
  source: z.enum(["event", "evidence", "rank", "badge"]),
  kind: z.enum([...BUILDER_EVENT_KINDS, "evidence", "rank_award", "badge_award"]),
  eventType: z.string(),
  stage: stage.nullable(),
  occurredAt: z.number().int(),
  /** Local (UTC+7) `YYYY-MM-DD`. */
  localDate: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  verification: z.enum(BUILDER_VERIFICATIONS).nullable(),
  visibility,
  state: z.enum(["verified", "self_reported", "pending", "needs_info", "rejected", "withdrawn", "corrected", "reversed", "revoked"]),
  rp: z.number().int(),
  links: z.array(z.string()),
  provenance: z.object({ source: z.string(), label: z.string().nullable(), originalAt: z.number().int(), importedAt: z.number().int() }).nullable(),
  relations: z.array(z.object({
    type: z.enum(["corrects", "reverses", "corrected_by", "reversed_by", "led_to", "followed_pivot"]),
    itemId: z.string(),
  })),
  learning: z.boolean(),
  rank: rankKey.nullable(),
  badgeKey: z.string().nullable(),
});
export const BuilderJourneyProjectSchema = z.object({
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  firstAt: z.number().int(),
  lastAt: z.number().int(),
  itemIds: z.array(z.string()),
});
export const BuilderJourneySchema = z.object({
  items: z.array(BuilderJourneyItemSchema),
  projects: z.array(BuilderJourneyProjectSchema),
});

// ---------------------------------------------------------------------------
// Badges and missions: GET /api/v1/builder-badges, GET /api/v1/builder-missions (`?locale=vi`)
// ---------------------------------------------------------------------------

export const BuilderBadgeSchema = z.object({
  key: z.enum(BUILDER_BADGE_KEYS),
  numeral: z.string(),
  stage,
  rarity: z.enum(["common", "uncommon", "rare", "legendary"]),
  name: z.string(),
  description: z.string(),
  criteria: z.string(),
  seasonalName: z.string().nullable(),
  earned: z.object({ awardId: z.string(), awardedAt: isoDate, evidenceCount: count }).nullable(),
  seasons: z.array(z.object({ awardId: z.string(), seasonKey: z.string(), awardedAt: isoDate })),
});
export const BuilderMissionSchema = z.object({
  key: z.enum(BUILDER_MISSION_KEYS),
  stage,
  eventType: z.enum(BUILDER_EVENT_TYPE_KEYS),
  status: z.enum(["done", "in_review", "recommended", "available"]),
  revisit: z.boolean(),
  /** Relative link to the evidence form for this mission's event type. */
  href: z.string(),
  completedAt: isoDate.nullable(),
  title: z.string(),
  outcome: z.string(),
});
export const BuilderMissionPlanSchema = z.object({
  currentStage: stage,
  cycle: z.number().int().positive(),
  cycleStartedAt: isoDate.nullable(),
  loopedBack: z.boolean(),
  missions: z.array(BuilderMissionSchema),
  recommended: z.array(z.enum(BUILDER_MISSION_KEYS)),
});

// ---------------------------------------------------------------------------
// Responses per endpoint
// ---------------------------------------------------------------------------

export const BuilderEvidenceListResponseSchema = builderPageSchema(z.array(BuilderEvidenceSchema));
export const BuilderEvidenceResponseSchema = builderDataSchema(BuilderEvidenceSchema);
export const BuilderRankingsResponseSchema = builderDataSchema(BuilderRankingsSchema);
export const BuilderPassportResponseSchema = builderDataSchema(BuilderPassportSchema);
export const BuilderJourneyResponseSchema = builderPageSchema(BuilderJourneySchema);
export const BuilderBadgesResponseSchema = builderDataSchema(z.array(BuilderBadgeSchema));
export const BuilderMissionsResponseSchema = builderDataSchema(BuilderMissionPlanSchema);

export type BuilderStage = z.infer<typeof stage>;
export type BuilderPagination = z.infer<typeof BuilderPaginationSchema>;
export type BuilderError = z.infer<typeof BuilderErrorSchema>;
export type SubmitBuilderEvidence = z.infer<typeof SubmitBuilderEvidenceSchema>;
export type BuilderEvidence = z.infer<typeof BuilderEvidenceSchema>;
export type BuilderBoardEntry = z.infer<typeof BuilderBoardEntrySchema>;
export type BuilderViewerPosition = z.infer<typeof BuilderViewerPositionSchema>;
export type BuilderRankings = z.infer<typeof BuilderRankingsSchema>;
export type BuilderLevel = z.infer<typeof BuilderLevelSchema>;
export type BuilderPrivacy = z.infer<typeof BuilderPrivacySchema>;
export type BuilderPassport = z.infer<typeof BuilderPassportSchema>;
export type BuilderJourneyItem = z.infer<typeof BuilderJourneyItemSchema>;
export type BuilderJourneyProject = z.infer<typeof BuilderJourneyProjectSchema>;
export type BuilderJourney = z.infer<typeof BuilderJourneySchema>;
export type BuilderBadge = z.infer<typeof BuilderBadgeSchema>;
export type BuilderMission = z.infer<typeof BuilderMissionSchema>;
export type BuilderMissionPlan = z.infer<typeof BuilderMissionPlanSchema>;

// ---------------------------------------------------------------------------
// Generic envelope for endpoints without a dedicated response schema here
// ---------------------------------------------------------------------------

/** `{ data, pagination? }` with an unvalidated `data`; extra keys are kept. */
export const BuilderEnvelopeSchema = z
  .object({ data: z.unknown().refine((value) => value !== undefined, "data is required"), pagination: BuilderPaginationSchema.optional() })
  .passthrough();
export type BuilderEnvelope = z.infer<typeof BuilderEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Member request inputs (bodies and queries). None of them carries a verification level, a status or
// an approval: API keys and MCP agents may only submit `self_reported` activity, and the server sets
// the evidence source from the credential.
// ---------------------------------------------------------------------------

const optionalId = z.string().max(300).nullish();
const evidenceLinks = z.array(HttpUrlSchema.max(2048)).max(10);
const occurredAt = z.union([z.string().max(40), z.number()]);
const cursor = z.string().min(1).max(500);

/** Query of `GET /api/v1/builder-evidence`. */
export const BuilderEvidenceListQuerySchema = z.object({
  status: z.enum(BUILDER_EVIDENCE_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: cursor.optional(),
}).strict();

/** JSON body of `PATCH /api/v1/builder-evidence/{id}` (edit while `submitted` or `needs_info`). */
export const EditBuilderEvidenceSchema = z.object({
  title: z.string().min(3).max(140),
  summary: z.string().max(5000),
  occurredAt,
  links: evidenceLinks,
  projectId: optionalId,
  counterparty: optionalId,
  visibility,
  /** File names (as listed in `files`) to delete. */
  removeFiles: z.array(z.string().max(64)).max(10),
}).partial().strict().refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");

/** `POST /api/v1/builder-evidence/{id}/appeal`. */
export const BuilderAppealInputSchema = z.object({ reason: z.string().min(20).max(2000) }).strict();

/** `POST /api/v1/builder-projects`. */
export const CreateBuilderProjectSchema = z.object({
  name: z.string().min(2).max(80),
  summary: z.string().max(500).optional(),
  stage: stage.optional(),
  productId: z.string().max(300).nullish(),
  visibility: visibility.optional(),
}).strict();

/** Query of `GET /api/v1/builder-journey`. */
export const BuilderJourneyQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  cursor: cursor.optional(),
  project: z.string().min(1).max(300).optional(),
}).strict();

/** Query of `GET /api/v1/builder-rankings`. */
export const BuilderRankingsQuerySchema = z.object({
  board: z.enum(BUILDER_BOARD_KEYS).optional(),
  period: z.enum(BUILDER_PERIOD_TYPES).optional(),
  /** Period key such as 2026-W42, 2026-10, 2026 or S2026-1. Defaults to the current period. */
  key: z.string().min(1).max(32).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const BUILDER_LOCALES = ["en", "vi"] as const;
export const BuilderLocaleSchema = z.enum(BUILDER_LOCALES);

export const BUILDER_SEASON_TRACKS = ["open", "validate", "build", "ship", "contribute"] as const;
/** `POST /api/v1/builder-seasons`: join or update the current or next season. */
export const BuilderSeasonEnrollmentInputSchema = z.object({
  seasonKey: z.string().min(1).max(32).optional(),
  track: z.enum(BUILDER_SEASON_TRACKS).optional(),
  goal: z.string().max(280).nullish(),
}).strict();

/** `POST /api/v1/builder-time-capsule`. */
export const BuilderTimeCapsuleInputSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  kind: z.enum(["intent", "reflection"]),
  body: z.string().min(1).max(4000),
  visibility: visibility.optional(),
}).strict();

/** Calendar year (Asia/Ho_Chi_Minh) of Year in Review and Community Wrapped paths. */
export const BuilderYearSchema = z.number().int().min(2026).max(2100);

export const BUILDER_RENDER_FORMATS = ["9x16", "16x9"] as const;
/** `POST /api/v1/builder-year/{year}/render`. */
export const BuilderRenderInputSchema = z.object({ format: z.enum(BUILDER_RENDER_FORMATS) }).strict();

export const BUILDER_YEAR_SCENES = [
  "year_in_numbers", "first_idea", "validation", "pivotal_learning", "mvp", "launch",
  "first_customer", "community_impact", "league_highlights", "next_year",
] as const;
/** `PATCH /api/v1/builder-year/{year}` (signed-in session only). */
export const BuilderYearHiddenScenesInputSchema = z.object({
  hiddenScenes: z.array(z.enum(BUILDER_YEAR_SCENES)).max(20),
}).strict();

/** `POST /api/v1/builder-year/{year}/share` (signed-in session only). */
export const BuilderShareLinkInputSchema = z.object({ locale: BuilderLocaleSchema.optional() }).strict();

/** `PATCH /api/v1/builder-me` (signed-in session only): partial privacy opt-ins. */
export const BuilderPrivacyUpdateInputSchema = z.object({
  privacy: BuilderPrivacySchema.partial().strict(),
}).strict();

/** `POST /api/v1/builder-rewards/{id}/claim` (signed-in session only). */
export const BuilderRewardClaimInputSchema = z.object({ note: z.string().max(500).nullish() }).strict();

// ---------------------------------------------------------------------------
// Admin request inputs (admin session only; API keys and agents are refused by the server)
// ---------------------------------------------------------------------------

/** Query of `GET /api/v1/builder-admin/queue`. */
export const BuilderModerationQueueQuerySchema = z.object({
  view: z.enum(["evidence", "appeals"]).optional(),
  status: z.enum(BUILDER_EVIDENCE_STATUSES).optional(),
  stage: stage.optional(),
  eventType: z.string().min(1).max(64).optional(),
  olderThanHours: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: cursor.optional(),
}).strict();

export const BUILDER_DECISIONS = ["approve", "reject", "needs_info"] as const;
/** `POST /api/v1/builder-admin/evidence/{id}/decision`. */
export const BuilderModerationDecisionInputSchema = z.object({
  decision: z.enum(BUILDER_DECISIONS),
  /** Required for reject and needs_info; `other` needs a note. */
  reasonCodes: z.array(z.string().min(1).max(64)).max(20).optional(),
  note: z.string().max(2000).optional(),
}).strict();

/** `POST /api/v1/builder-admin/evidence/{id}/appeal`. */
export const BuilderAppealResolutionInputSchema = z.object({
  outcome: z.enum(["uphold", "overturn"]),
  resolution: z.string().min(5).max(2000),
  appealId: z.string().min(1).max(300).optional(),
}).strict();

/** `POST /api/v1/builder-admin/backfill`: dry run unless `dryRun: false`. */
export const BuilderBackfillInputSchema = z.object({
  userIds: z.array(z.string().min(1).max(300)).max(500).optional(),
  dryRun: z.boolean().optional(),
}).strict();

export type BuilderEvidenceListQuery = z.infer<typeof BuilderEvidenceListQuerySchema>;
export type EditBuilderEvidence = z.infer<typeof EditBuilderEvidenceSchema>;
export type BuilderAppealInput = z.infer<typeof BuilderAppealInputSchema>;
export type CreateBuilderProject = z.infer<typeof CreateBuilderProjectSchema>;
export type BuilderJourneyQuery = z.infer<typeof BuilderJourneyQuerySchema>;
export type BuilderRankingsQuery = z.infer<typeof BuilderRankingsQuerySchema>;
export type BuilderLocale = z.infer<typeof BuilderLocaleSchema>;
export type BuilderSeasonEnrollmentInput = z.infer<typeof BuilderSeasonEnrollmentInputSchema>;
export type BuilderTimeCapsuleInput = z.infer<typeof BuilderTimeCapsuleInputSchema>;
export type BuilderRenderInput = z.infer<typeof BuilderRenderInputSchema>;
export type BuilderYearHiddenScenesInput = z.infer<typeof BuilderYearHiddenScenesInputSchema>;
export type BuilderShareLinkInput = z.infer<typeof BuilderShareLinkInputSchema>;
export type BuilderPrivacyUpdateInput = z.infer<typeof BuilderPrivacyUpdateInputSchema>;
export type BuilderRewardClaimInput = z.infer<typeof BuilderRewardClaimInputSchema>;
export type BuilderModerationQueueQuery = z.infer<typeof BuilderModerationQueueQuerySchema>;
export type BuilderModerationDecisionInput = z.infer<typeof BuilderModerationDecisionInputSchema>;
export type BuilderAppealResolutionInput = z.infer<typeof BuilderAppealResolutionInputSchema>;
export type BuilderBackfillInput = z.infer<typeof BuilderBackfillInputSchema>;

// ---------------------------------------------------------------------------
// Failures shared by the CLI and MCP surfaces
// ---------------------------------------------------------------------------

/** Shown when a Builder League route answers 404 because the league is hidden from this caller. */
export const BUILDER_LEAGUE_NOT_ENABLED_MESSAGE =
  "Builder League is not enabled on this environment (BUILDER_LEAGUE_ENABLED is off and this account is not an admin or pilot member)";

export interface BuilderApiFailure {
  status: number;
  /** Machine code from the error envelope (`not_found`, `session_required`, `validation_failed`, ...). */
  code?: string;
  details?: unknown;
  /** True when the failure most likely means the league is switched off for this caller. */
  notEnabled: boolean;
  message: string;
}

function formatIssues(details: unknown): string {
  if (!Array.isArray(details) || details.length === 0) return "";
  const issues = details.map((issue) => {
    if (issue && typeof issue === "object" && "message" in issue) {
      const { path, message } = issue as { path?: unknown; message?: unknown };
      return path ? `${String(path)}: ${String(message)}` : String(message);
    }
    return JSON.stringify(issue);
  });
  return ` (${issues.join("; ")})`;
}

/**
 * Converts a non-2xx Builder League response into a structured failure.
 * `resource: true` marks a lookup of one item (evidence id, passport user id, share link), where a
 * 404 can also mean the item does not exist; collection routes only answer 404 while the league is
 * hidden from the caller.
 */
export function describeBuilderApiFailure(
  status: number,
  bodyText: string,
  statusText = "",
  options: { resource?: boolean } = {}
): BuilderApiFailure {
  let raw: unknown;
  try {
    raw = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    raw = undefined;
  }
  const parsed = BuilderErrorSchema.safeParse(raw);
  const code = parsed.success ? parsed.data.error.code : undefined;
  const details = parsed.success ? parsed.data.error.details : undefined;
  const serverMessage = parsed.success ? parsed.data.error.message : (bodyText.trim().slice(0, 500) || statusText || "Request failed");
  const hidden = status === 404 && (code === undefined || code === "not_found");

  let message: string;
  if (hidden && !options.resource) {
    message = `${BUILDER_LEAGUE_NOT_ENABLED_MESSAGE}.`;
  } else if (hidden) {
    message = `Not found, or ${BUILDER_LEAGUE_NOT_ENABLED_MESSAGE}.`;
  } else if (status === 401) {
    message = "Sign in required: send an NLB API key, an OAuth identity or a session cookie.";
  } else if (status === 403 && code === "membership_required") {
    message = "Builder League membership required (an active Premium or VIP membership).";
  } else if (status === 403 && (code === "session_required" || code === "confirmation_requires_session")) {
    message = `${serverMessage} This action needs a signed-in browser session; API keys and MCP agents are refused.`;
  } else {
    message = serverMessage;
  }
  return {
    status,
    code,
    details,
    notEnabled: hidden && !options.resource,
    message: `HTTP ${status}${code ? ` ${code}` : ""}: ${message}${formatIssues(details)}`,
  };
}
