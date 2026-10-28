import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type {
  LiveAttendeeRegistrationStatus,
  LiveEventStatus,
  LiveMeetingProviderName,
  LivePollRoundStatus,
  LiveReservationStatus,
  LiveSeatState,
  LiveTicketStatus,
  LiveTopicStatus,
} from "@/lib/live/types";
import type { OperatorApprovalStatus, OperatorCapability } from "@/lib/access/types";

/**
 * NLB Live and platform-operator tables (D1). Conventions follow `schema.ts`: text UUID ids, integer
 * epoch-ms timestamps, drizzle json text, 0/1 booleans. Decisions live in docs/live-and-access-adr.md.
 *
 * - Payment state stays canonical in `orders` and access in `entitlements` (`live:ticket:<eventId>`);
 *   `live_tickets` links an order to a seat and keeps the ticket history.
 * - `live_seats` holds one row per seat. A seat is claimed with one conditional UPDATE, which is atomic
 *   in SQLite, so concurrent checkouts can never hold or sell more seats than the event has.
 * - `operator_audit_logs` is append-only: no code path issues UPDATE or DELETE on it.
 * User ids are kept without foreign keys so history survives account deletion.
 */
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull();
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull();

// ==========================================
// Platform operators, approvals and audit
// ==========================================

/** Explicit operator grants, independent of `users.role`. Revoked rows are kept for history. */
export const platformOperators = sqliteTable("platform_operators", {
  userId: text("user_id").primaryKey(),
  /** Exact capabilities such as `live:manage`; there is no wildcard capability. */
  capabilities: text("capabilities", { mode: "json" }).$type<OperatorCapability[]>().notNull(),
  grantedBy: text("granted_by").notNull(),
  note: text("note"),
  grantedAt: createdAt(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  updatedAt: updatedAt(),
});

/**
 * Time-limited, argument-bound approval for one sensitive action. Consumed once with a conditional
 * UPDATE (status `approved`, not expired, same `args_hash`), so a replayed approval changes no rows.
 */
export const operatorApprovals = sqliteTable(
  "operator_approvals",
  {
    id: id(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    /** sha256 of the canonical JSON arguments the approval covers. */
    argsHash: text("args_hash").notNull(),
    reason: text("reason").notNull(),
    requestedBy: text("requested_by").notNull(),
    decidedBy: text("decided_by"),
    status: text("status").$type<OperatorApprovalStatus>().notNull().default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("operator_approvals_status_idx").on(t.status, t.expiresAt)]
);

/** Append-only record of every operator decision, allowed or denied. */
export const operatorAuditLogs = sqliteTable(
  "operator_audit_logs",
  {
    id: id(),
    actorUserId: text("actor_user_id"),
    actorAuthType: text("actor_auth_type").notNull(),
    clientId: text("client_id"),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    decision: text("decision").$type<"allow" | "deny">().notNull(),
    reason: text("reason"),
    argsHash: text("args_hash"),
    approvalId: text("approval_id"),
    /** Small, non-personal summary of what changed (ids, before/after status). */
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("operator_audit_logs_resource_idx").on(t.resource, t.createdAt),
    index("operator_audit_logs_actor_idx").on(t.actorUserId, t.createdAt),
  ]
);

// ==========================================
// Live topics and weekly polls
// ==========================================

export const liveTopicGroups = sqliteTable("live_topic_groups", {
  id: id(),
  slug: text("slug").notNull().unique(),
  titleEn: text("title_en").notNull(),
  titleVi: text("title_vi").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").$type<LiveTopicStatus>().notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const liveTopics = sqliteTable(
  "live_topics",
  {
    id: id(),
    groupId: text("group_id").references(() => liveTopicGroups.id).notNull(),
    slug: text("slug").notNull().unique(),
    titleEn: text("title_en").notNull(),
    titleVi: text("title_vi").notNull(),
    summaryEn: text("summary_en").notNull().default(""),
    summaryVi: text("summary_vi").notNull().default(""),
    status: text("status").$type<LiveTopicStatus>().notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("live_topics_group_idx").on(t.groupId, t.status)]
);

/**
 * One weekly voting round. Open/closed is derived from `opens_at`/`closes_at` (stored UTC, configured
 * in `timezone`); `finalized` freezes `result_snapshot`, which never changes afterwards except through
 * an approved, audited override.
 */
export const livePollRounds = sqliteTable(
  "live_poll_rounds",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    titleEn: text("title_en").notNull(),
    titleVi: text("title_vi").notNull(),
    opensAt: integer("opens_at", { mode: "timestamp_ms" }).notNull(),
    closesAt: integer("closes_at", { mode: "timestamp_ms" }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
    status: text("status").$type<LivePollRoundStatus>().notNull().default("scheduled"),
    resultSnapshot: text("result_snapshot", { mode: "json" }).$type<LivePollResultSnapshot>(),
    winnerTopicId: text("winner_topic_id"),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    overrideReason: text("override_reason"),
    overrideApprovalId: text("override_approval_id"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("live_poll_rounds_window_idx").on(t.opensAt, t.closesAt)]
);

export interface LivePollResultSnapshot {
  /** Ordered by rank (tie-break applied). */
  tallies: { topicId: string; votes: number; firstVoteAt: number | null }[];
  totalVotes: number;
  tieBreak: "earliest_current_vote_then_topic_id";
  computedAt: number;
}

export const livePollRoundTopics = sqliteTable(
  "live_poll_round_topics",
  {
    roundId: text("round_id").references(() => livePollRounds.id).notNull(),
    topicId: text("topic_id").references(() => liveTopics.id).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.topicId] })]
);

/** One current vote per account per round; changing the vote before close rewrites the row. */
export const liveVotes = sqliteTable(
  "live_votes",
  {
    roundId: text("round_id").references(() => livePollRounds.id).notNull(),
    userId: text("user_id").notNull(),
    topicId: text("topic_id").references(() => liveTopics.id).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.userId] }), index("live_votes_topic_idx").on(t.roundId, t.topicId)]
);

// ==========================================
// Live events, seats, tickets and meetings
// ==========================================

export const liveEvents = sqliteTable(
  "live_events",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    titleEn: text("title_en").notNull(),
    titleVi: text("title_vi").notNull(),
    descriptionEn: text("description_en").notNull().default(""),
    descriptionVi: text("description_vi").notNull().default(""),
    topicId: text("topic_id").references(() => liveTopics.id),
    pollRoundId: text("poll_round_id").references(() => livePollRounds.id),
    status: text("status").$type<LiveEventStatus>().notNull().default("draft"),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
    hostName: text("host_name").notNull(),
    capacity: integer("capacity").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    /** Polar one-off product for this event's ticket; immutable once sales open. */
    polarProductId: text("polar_product_id").unique(),
    /** Optional Polar discount ids applied at checkout for members (configured per event). */
    premiumDiscountId: text("premium_discount_id"),
    vipDiscountId: text("vip_discount_id"),
    meetingProvider: text("meeting_provider").$type<LiveMeetingProviderName>().notNull().default("zoom"),
    refundPolicyEn: text("refund_policy_en").notNull().default(""),
    refundPolicyVi: text("refund_policy_vi").notNull().default(""),
    /** Buyers must accept recording and later replay resale before checkout. */
    recordingNoticeEn: text("recording_notice_en").notNull().default(""),
    recordingNoticeVi: text("recording_notice_vi").notNull().default(""),
    /** Course video this event was released into (P2); null until then. */
    courseVideoId: text("course_video_id"),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("live_events_status_starts_idx").on(t.status, t.startsAt)]
);

/** One row per seat, created when sales open. See the module comment for the claim rule. */
export const liveSeats = sqliteTable(
  "live_seats",
  {
    eventId: text("event_id").references(() => liveEvents.id).notNull(),
    seatNo: integer("seat_no").notNull(),
    state: text("state").$type<LiveSeatState>().notNull().default("free"),
    holderUserId: text("holder_user_id"),
    reservationId: text("reservation_id"),
    ticketId: text("ticket_id"),
    /** Hold expiry; null for free and ticketed seats. */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.seatNo] }), index("live_seats_state_idx").on(t.eventId, t.state)]
);

export const liveTicketReservations = sqliteTable(
  "live_ticket_reservations",
  {
    id: id(),
    eventId: text("event_id").references(() => liveEvents.id).notNull(),
    userId: text("user_id").notNull(),
    seatNo: integer("seat_no").notNull(),
    status: text("status").$type<LiveReservationStatus>().notNull().default("held"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    polarCheckoutId: text("polar_checkout_id"),
    recordingConsentAt: integer("recording_consent_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("live_reservations_user_idx").on(t.eventId, t.userId, t.status)]
);

/** A paid seat. `polar_order_id` is unique, so a redelivered order can never create a second ticket. */
export const liveTickets = sqliteTable(
  "live_tickets",
  {
    id: id(),
    eventId: text("event_id").references(() => liveEvents.id).notNull(),
    userId: text("user_id"),
    polarOrderId: text("polar_order_id").notNull().unique(),
    reservationId: text("reservation_id"),
    seatNo: integer("seat_no"),
    status: text("status").$type<LiveTicketStatus>().notNull(),
    /** Why a paid order could not become an active ticket (sold out, no account); needs reconciliation. */
    exceptionReason: text("exception_reason"),
    recordingConsentAt: integer("recording_consent_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("live_tickets_event_user_idx").on(t.eventId, t.userId, t.status)]
);

/** Provider meeting for an event. Host credentials and host start URLs are never stored. */
export const liveMeetings = sqliteTable("live_meetings", {
  eventId: text("event_id").primaryKey().references(() => liveEvents.id),
  provider: text("provider").$type<LiveMeetingProviderName>().notNull(),
  providerMeetingId: text("provider_meeting_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Per-attendee provider registration. The personal join URL is stored encrypted (lib/crypto). */
export const liveAttendeeRegistrations = sqliteTable(
  "live_attendee_registrations",
  {
    eventId: text("event_id").references(() => liveEvents.id).notNull(),
    userId: text("user_id").notNull(),
    ticketId: text("ticket_id").notNull(),
    providerRegistrantId: text("provider_registrant_id"),
    joinUrlCiphertext: text("join_url_ciphertext"),
    status: text("status").$type<LiveAttendeeRegistrationStatus>().notNull(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })]
);

/** First time an authorized attendee fetched join access; aggregate counts only leave the database. */
export const liveAttendance = sqliteTable(
  "live_attendance",
  {
    eventId: text("event_id").references(() => liveEvents.id).notNull(),
    userId: text("user_id").notNull(),
    firstJoinAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })]
);

