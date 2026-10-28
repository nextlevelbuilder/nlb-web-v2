/**
 * Boundary validation for `/api/v1/live-admin` bodies. Shapes are checked here (unknown keys refused);
 * the domain services still enforce their own rules (slug format, lengths, state machine). Instants are
 * ISO 8601 strings with an explicit offset (`2026-11-02T20:00:00+07:00` or `…Z`), so an operator
 * entering Asia/Ho_Chi_Minh wall-clock time cannot be misread as UTC. Rounds may instead give a weekly
 * window in local time, converted with `buildWeeklyWindow`.
 */
import { z } from "zod";
import { LIVE_SENSITIVE_ACTIONS } from "./live-sensitive-targets";
import { LIVE_REFUND_REASONS } from "./live-ticket-refund";

const text = (max = 200) => z.string().max(max);
const id = z.string().trim().min(1).max(200);
const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const nullableId = id.nullable();

export const topicGroupCreateSchema = z
  .object({ slug: text(120), titleEn: text(), titleVi: text(), sortOrder: z.number().int().optional() })
  .strict();

export const topicGroupUpdateSchema = z
  .object({ titleEn: text().optional(), titleVi: text().optional(), sortOrder: z.number().int().optional() })
  .strict();

export const topicCreateSchema = z
  .object({ groupId: id, slug: text(120), titleEn: text(), titleVi: text(), summaryEn: text(2000).optional(), summaryVi: text(2000).optional() })
  .strict();

export const topicUpdateSchema = z
  .object({ titleEn: text().optional(), titleVi: text().optional(), summaryEn: text(2000).optional(), summaryVi: text(2000).optional() })
  .strict();

const weeklyWindowSchema = z
  .object({
    opensOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm"),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm").optional(),
    days: z.number().int().min(1).max(31).optional(),
  })
  .strict();

export const roundCreateSchema = z
  .object({
    slug: text(120),
    titleEn: text(),
    titleVi: text(),
    topicIds: z.array(id).min(1).max(50),
    opensAt: instant.optional(),
    closesAt: instant.optional(),
    /** Local wall-clock window in Asia/Ho_Chi_Minh, instead of `opensAt`/`closesAt`. */
    window: weeklyWindowSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.window) !== Boolean(value.opensAt && value.closesAt), {
    message: "Give either window or both opensAt and closesAt",
  });

/** `approvalId` is optional at the boundary so a missing one is refused by the guard (409 `approval_required`) and audited. */
const approvalId = id.optional();

export const roundOverrideSchema = z
  .object({ topicId: id, reason: z.string().trim().min(1).max(500), approvalId })
  .strict();

const eventFields = {
  titleEn: text(),
  titleVi: text(),
  descriptionEn: text(10_000),
  descriptionVi: text(10_000),
  topicId: nullableId,
  pollRoundId: nullableId,
  startsAt: instant,
  endsAt: instant,
  hostName: text(),
  capacity: z.number().int(),
  priceCents: z.number().int(),
  currency: z.string().regex(/^[a-z]{3}$/, "lowercase ISO currency code"),
  premiumDiscountId: nullableId,
  vipDiscountId: nullableId,
  refundPolicyEn: text(5000),
  refundPolicyVi: text(5000),
  recordingNoticeEn: text(5000),
  recordingNoticeVi: text(5000),
};

export const eventCreateSchema = z
  .object({
    slug: text(120),
    ...eventFields,
    descriptionEn: eventFields.descriptionEn.optional(),
    descriptionVi: eventFields.descriptionVi.optional(),
    topicId: eventFields.topicId.optional(),
    pollRoundId: eventFields.pollRoundId.optional(),
    currency: eventFields.currency.optional(),
    premiumDiscountId: eventFields.premiumDiscountId.optional(),
    vipDiscountId: eventFields.vipDiscountId.optional(),
    refundPolicyEn: eventFields.refundPolicyEn.optional(),
    refundPolicyVi: eventFields.refundPolicyVi.optional(),
    recordingNoticeEn: eventFields.recordingNoticeEn.optional(),
    recordingNoticeVi: eventFields.recordingNoticeVi.optional(),
  })
  .strict();

export const eventUpdateSchema = z.object(eventFields).partial().strict();

export const eventTransitionSchema = z.object({ to: z.enum(["scheduled", "live", "ended", "archived"]) }).strict();

export const eventCapacitySchema = z.object({ capacity: z.number().int() }).strict();

export const eventCancelSchema = z.object({ approvalId }).strict();

export const ticketRefundSchema = z
  .object({ approvalId, reason: z.enum(LIVE_REFUND_REASONS).default("customer_request"), comment: z.string().max(500).optional() })
  .strict();

export const approvalRequestSchema = z
  .object({
    action: z.enum(LIVE_SENSITIVE_ACTIONS),
    /** `{ ticketId }`, `{ eventId }` or `{ roundId, topicId }` depending on `action`. */
    target: z.record(z.unknown()),
    reason: z.string().trim().min(1).max(500),
    ttlMinutes: z.number().int().min(1).max(24 * 60).optional(),
  })
  .strict();

export const approvalDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]) }).strict();
