import { sqliteTable, text, integer, primaryKey, unique, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { products, users } from "./schema";
import type {
  ActorRole,
  BuilderEventKind,
  BuilderEventPayload,
  EvidenceStatus,
  EventSource,
  PeriodType,
  RankKey,
  Stage,
  Verification,
  Visibility,
} from "@/lib/builder-league/types";

/**
 * Builder League tables (D1). Conventions follow `schema.ts`: text UUID ids, integer epoch-ms
 * timestamps, drizzle json text, 0/1 booleans.
 *
 * `builder_events` and `score_ledger` are append-only: corrections and reversals are new rows and no
 * code path issues UPDATE or DELETE on them. Ledger and audit rows keep `user_id` without a foreign key
 * so history survives account deletion, which goes through the privacy-delete routine instead.
 * `users` and `products` are referenced lazily, so the circular import with `schema.ts` is safe.
 */
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull();
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull();

export const scoreRulesets = sqliteTable("score_rulesets", {
  version: text("version").primaryKey(),
  effectiveFrom: integer("effective_from", { mode: "timestamp_ms" }).notNull(),
  checksum: text("checksum").notNull(),
  /** Canonical scoring definition at seed time; the authoritative definition stays in code. */
  definition: text("definition", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const builderProjects = sqliteTable(
  "builder_projects",
  {
    id: id(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary").notNull().default(""),
    stage: text("stage").$type<Stage>().notNull().default("validate"),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    visibility: text("visibility").$type<Visibility>().notNull().default("private"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (t) => [unique("builder_projects_owner_slug_unique").on(t.ownerUserId, t.slug)]
);

/** Every public surface is opt-in; a missing row means fully private. */
export const builderPrivacy = sqliteTable("builder_privacy", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  leaderboardPublic: integer("leaderboard_public", { mode: "boolean" }).notNull().default(false),
  passportPublic: integer("passport_public", { mode: "boolean" }).notNull().default(false),
  wrappedPublic: integer("wrapped_public", { mode: "boolean" }).notNull().default(false),
  peerMentionsOk: integer("peer_mentions_ok", { mode: "boolean" }).notNull().default(false),
  backfillOptIn: integer("backfill_opt_in", { mode: "boolean" }).notNull().default(false),
  redactFinancials: integer("redact_financials", { mode: "boolean" }).notNull().default(true),
  updatedAt: updatedAt(),
});

export const builderPilotMembers = sqliteTable("builder_pilot_members", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  addedBy: text("added_by").notNull(),
  note: text("note"),
  addedAt: integer("added_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
});

export const activityEvidence = sqliteTable(
  "activity_evidence",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    projectId: text("project_id").references(() => builderProjects.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    stage: text("stage").$type<Stage>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    links: text("links", { mode: "json" }).$type<string[]>().notNull().default([]),
    privateObjectKeys: text("private_object_keys", { mode: "json" }).$type<string[]>().notNull().default([]),
    counterpartyUserId: text("counterparty_user_id"),
    counterpartyConfirmedAt: integer("counterparty_confirmed_at", { mode: "timestamp_ms" }),
    status: text("status").$type<EvidenceStatus>().notNull().default("submitted"),
    source: text("source").$type<EventSource>().notNull(),
    visibility: text("visibility").$type<Visibility>().notNull().default("private"),
    /** Client-chosen idempotency key so a retried submission never creates a second row. */
    clientKey: text("client_key").notNull(),
    decisionReason: text("decision_reason"),
    decidedBy: text("decided_by"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    eventId: text("event_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("activity_evidence_user_client_key_unique").on(t.userId, t.clientKey),
    index("activity_evidence_status_created_idx").on(t.status, t.createdAt),
    index("activity_evidence_user_occurred_idx").on(t.userId, t.occurredAt),
  ]
);

export const builderEvents = sqliteTable(
  "builder_events",
  {
    id: id(),
    eventId: text("event_id").notNull().unique(),
    kind: text("kind").$type<BuilderEventKind>().notNull(),
    subjectUserId: text("subject_user_id").notNull(),
    actorUserId: text("actor_user_id"),
    actorRole: text("actor_role").$type<ActorRole>().notNull(),
    projectId: text("project_id"),
    stage: text("stage").$type<Stage>().notNull(),
    eventType: text("event_type").notNull(),
    source: text("source").$type<EventSource>().notNull(),
    externalEventId: text("external_event_id").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
    rulesetVersion: text("ruleset_version").notNull(),
    verification: text("verification").$type<Verification>().notNull(),
    visibility: text("visibility").$type<Visibility>().notNull().default("private"),
    evidenceId: text("evidence_id"),
    supersedesEventId: text("supersedes_event_id"),
    payload: text("payload", { mode: "json" }).$type<BuilderEventPayload>().notNull().default({}),
    provenance: text("provenance", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("builder_events_subject_occurred_idx").on(t.subjectUserId, t.occurredAt)]
);

export const scoreLedger = sqliteTable(
  "score_ledger",
  {
    id: id(),
    userId: text("user_id").notNull(),
    eventId: text("event_id").notNull(),
    awardType: text("award_type").notNull(),
    stage: text("stage").$type<Stage>().notNull(),
    /** Signed: reversals carry the negated amount of the entry they reverse. */
    rp: integer("rp").notNull(),
    rulesetVersion: text("ruleset_version").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    reversesEntryId: text("reverses_entry_id"),
    reason: text("reason"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("score_ledger_user_occurred_idx").on(t.userId, t.occurredAt),
    index("score_ledger_occurred_idx").on(t.occurredAt),
  ]
);

/**
 * Concurrency guard for rolling caps. Each capped award claims one deterministic slot per cap rule
 * (`user|eventType|scope|window|index`) in the same D1 batch as its ledger row, so two concurrent awards
 * competing for the last slot collide on the primary key and only one commits. A reversal releases its
 * slots. This is a lock table, not history: the ledger stays the record of truth.
 */
export const scoreCapSlots = sqliteTable(
  "score_cap_slots",
  {
    slotKey: text("slot_key").primaryKey(),
    userId: text("user_id").notNull(),
    entryId: text("entry_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("score_cap_slots_user_idx").on(t.userId), index("score_cap_slots_entry_idx").on(t.entryId)]
);

export const builderModerationActions = sqliteTable(
  "builder_moderation_actions",
  {
    id: id(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").$type<ActorRole>().notNull(),
    reasonCodes: text("reason_codes", { mode: "json" }).$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("builder_moderation_actions_target_idx").on(t.targetType, t.targetId)]
);

export const evidenceAppeals = sqliteTable("evidence_appeals", {
  id: id(),
  evidenceId: text("evidence_id").references(() => activityEvidence.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<"open" | "upheld" | "overturned" | "withdrawn">().notNull().default("open"),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by"),
  createdAt: createdAt(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
});

export const leagueSnapshots = sqliteTable(
  "league_snapshots",
  {
    id: id(),
    board: text("board").notNull(),
    periodType: text("period_type").$type<PeriodType>().notNull(),
    periodKey: text("period_key").notNull(),
    revision: integer("revision").notNull().default(1),
    status: text("status").$type<"provisional" | "final">().notNull().default("provisional"),
    rulesetVersion: text("ruleset_version").notNull(),
    watermarkAt: integer("watermark_at", { mode: "timestamp_ms" }).notNull(),
    eventHash: text("event_hash").notNull(),
    entries: text("entries", { mode: "json" }).$type<unknown[]>().notNull().default([]),
    supersedesId: text("supersedes_id"),
    createdAt: createdAt(),
  },
  (t) => [unique("league_snapshots_board_period_revision_unique").on(t.board, t.periodType, t.periodKey, t.revision)]
);

export const rankAwards = sqliteTable(
  "rank_awards",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    rank: text("rank").$type<RankKey>().notNull(),
    rulesetVersion: text("ruleset_version").notNull(),
    checklist: text("checklist", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    awardedBy: text("awarded_by"),
    eventId: text("event_id"),
    awardedAt: integer("awarded_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
    frozenAt: integer("frozen_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("rank_awards_user_idx").on(t.userId, t.awardedAt)]
);

export const mentorNominations = sqliteTable(
  "mentor_nominations",
  {
    id: id(),
    nomineeUserId: text("nominee_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    mentorUserId: text("mentor_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    rank: text("rank").$type<RankKey>().notNull(),
    year: integer("year").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [unique("mentor_nominations_unique").on(t.nomineeUserId, t.mentorUserId, t.rank, t.year)]
);

export const badgeAwards = sqliteTable(
  "badge_awards",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    badgeKey: text("badge_key").notNull(),
    seasonKey: text("season_key").notNull().default(""),
    eventIds: text("event_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    awardedAt: integer("awarded_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    revokeReason: text("revoke_reason"),
  },
  (t) => [unique("badge_awards_user_badge_season_unique").on(t.userId, t.badgeKey, t.seasonKey)]
);

export const seasonEnrollments = sqliteTable(
  "season_enrollments",
  {
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    seasonKey: text("season_key").notNull(),
    track: text("track").notNull(),
    goal: text("goal"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.seasonKey] })]
);

export const rewardItems = sqliteTable("reward_items", {
  id: id(),
  key: text("key").notNull().unique(),
  kind: text("kind").notNull(),
  title: text("title", { mode: "json" }).$type<{ en: string; vi: string }>().notNull(),
  description: text("description", { mode: "json" }).$type<{ en: string; vi: string }>().notNull(),
  eligibility: text("eligibility", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  inventory: integer("inventory"),
  budgetNote: text("budget_note"),
  availableFrom: integer("available_from", { mode: "timestamp_ms" }),
  availableUntil: integer("available_until", { mode: "timestamp_ms" }),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rewardClaims = sqliteTable(
  "reward_claims",
  {
    id: id(),
    rewardId: text("reward_id").references(() => rewardItems.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    periodKey: text("period_key").notNull(),
    status: text("status")
      .$type<"requested" | "approved" | "rejected" | "redeemed" | "expired" | "cancelled">()
      .notNull()
      .default("requested"),
    note: text("note"),
    decidedBy: text("decided_by"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("reward_claims_reward_user_period_unique").on(t.rewardId, t.userId, t.periodKey)]
);

export const timeCapsuleEntries = sqliteTable(
  "time_capsule_entries",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    year: integer("year").notNull(),
    kind: text("kind").$type<"intent" | "reflection">().notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").$type<Visibility>().notNull().default("private"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [unique("time_capsule_entries_user_year_kind_version_unique").on(t.userId, t.year, t.kind, t.version)]
);

export const yearlySnapshots = sqliteTable(
  "yearly_snapshots",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    year: integer("year").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"provisional" | "final">().notNull().default("provisional"),
    rulesetVersion: text("ruleset_version").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    provenance: text("provenance", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    hiddenScenes: text("hidden_scenes", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [unique("yearly_snapshots_user_year_version_unique").on(t.userId, t.year, t.version)]
);

export const communityWrappedSnapshots = sqliteTable(
  "community_wrapped_snapshots",
  {
    id: id(),
    year: integer("year").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"provisional" | "final">().notNull().default("provisional"),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("community_wrapped_snapshots_year_version_unique").on(t.year, t.version)]
);

export const builderShareLinks = sqliteTable("builder_share_links", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").$type<"passport" | "year_review">().notNull(),
  year: integer("year"),
  createdAt: createdAt(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});

export const shareAttributions = sqliteTable(
  "share_attributions",
  {
    id: id(),
    shareLinkId: text("share_link_id").references(() => builderShareLinks.id, { onDelete: "cascade" }).notNull(),
    kind: text("kind").$type<"visit" | "signup" | "paid">().notNull(),
    userId: text("user_id"),
    utm: text("utm", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
    visitorHash: text("visitor_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("share_attributions_link_idx").on(t.shareLinkId, t.createdAt)]
);

export const renderJobs = sqliteTable(
  "render_jobs",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    year: integer("year").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    format: text("format").$type<"9x16" | "16x9">().notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status").$type<"queued" | "claimed" | "done" | "failed" | "expired">().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    outputKey: text("output_key"),
    error: text("error"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("render_jobs_status_idx").on(t.status, t.createdAt)]
);
