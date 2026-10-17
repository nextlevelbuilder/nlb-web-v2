/**
 * Builder League badges. The catalogue lives in code; awards live in `badge_awards`
 * (unique user + badge + season, `season_key = ''` for the lifetime badge).
 *
 * Rules:
 * - Triggers read only the verified history (`verified-history.ts`). Paying, logging in, posting volume
 *   (`ship_public_post`) and Discord activity counts never trigger a badge, and membership tier is
 *   never read here.
 * - `evaluateBadges` is idempotent: awards are inserted with ON CONFLICT DO NOTHING and each new award
 *   appends one `builder_events` row of kind `badge` (deduped on badge + season). A revoked award keeps
 *   its row, so re-evaluation never re-grants it.
 * - Revocation needs an admin, a reason and writes the moderator audit row in the same batch.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { AppDb } from "@/lib/db";
import { badgeAwards, builderPilotMembers, users } from "@/lib/db/schema";
import { moderationActionInsert } from "./audit";
import { BuilderApiError } from "./http";
import { recordBuilderEvent } from "./ledger";
import { periodKey, periodRange } from "./time-windows";
import { SEASON_EPOCH, meetsVerification } from "./ruleset";
import { getVerifiedHistory, type VerifiedEvent } from "./verified-history";
import type { ActorRole, EventTypeKey, Stage, Verification } from "./types";

export type BadgeAward = typeof badgeAwards.$inferSelect;
export type BadgeRarity = "common" | "uncommon" | "rare" | "legendary";

export const BADGE_KEYS = [
  "signal_hunter",
  "idea_slayer",
  "first_builder",
  "first_ship",
  "first_dollar",
  "growth_explorer",
  "community_hero",
  "comeback_builder",
  "nlb_pioneer",
] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

export interface LocalizedText {
  en: string;
  vi: string;
}

export interface BadgeContext {
  events: VerifiedEvent[];
  isPilot: boolean;
}

export interface BadgeDefinition {
  key: BadgeKey;
  /** Catalogue plate number, shown as a mono roman numeral. */
  numeral: string;
  stage: Stage;
  rarity: BadgeRarity;
  name: LocalizedText;
  description: LocalizedText;
  /** What has to be verified, in plain words. */
  criteria: LocalizedText;
  /** Minimum verification of every evidence event, on top of what the ruleset requires. */
  requiredVerification: Verification;
  /** Seasonal variant: the same trigger evaluated on one season's events, awarded once per season. */
  seasonal: { name: LocalizedText } | null;
  /** Returns the ids of the events that prove the badge, or null when not earned. */
  trigger: (context: BadgeContext) => string[] | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Comeback: verified activity after at least this many inactive weeks. */
export const COMEBACK_GAP_WEEKS = 8;
const COMMUNITY_HERO = { events: 5, counterparties: 3, weeks: 3 } as const;
const SIGNAL_HUNTER_SIGNALS = 3;

const ofType = (events: VerifiedEvent[], ...types: EventTypeKey[]) => events.filter((e) => types.includes(e.eventType));
const firstOf = (events: VerifiedEvent[], ...types: EventTypeKey[]) => {
  const match = ofType(events, ...types)[0];
  return match ? [match.id] : null;
};

export const BADGES: readonly BadgeDefinition[] = [
  {
    key: "signal_hunter",
    numeral: "I",
    stage: "validate",
    rarity: "common",
    name: { en: "Signal Hunter", vi: "Thợ săn tín hiệu" },
    description: {
      en: "Went looking for a real problem before writing code.",
      vi: "Đi tìm một vấn đề có thật trước khi viết dòng code nào.",
    },
    criteria: {
      en: `${SIGNAL_HUNTER_SIGNALS} verified problem signals, or one verified interview round.`,
      vi: `${SIGNAL_HUNTER_SIGNALS} tín hiệu vấn đề đã xác minh, hoặc một đợt phỏng vấn đã xác minh.`,
    },
    requiredVerification: "moderator_verified",
    seasonal: { name: { en: "Season Signal Hunter", vi: "Thợ săn tín hiệu mùa" } },
    trigger: ({ events }) => {
      const interviews = ofType(events, "validate_interviews");
      if (interviews.length > 0) return [interviews[0].id];
      const signals = ofType(events, "validate_problem_signal");
      return signals.length >= SIGNAL_HUNTER_SIGNALS ? signals.slice(0, SIGNAL_HUNTER_SIGNALS).map((e) => e.id) : null;
    },
  },
  {
    key: "idea_slayer",
    numeral: "II",
    stage: "validate",
    rarity: "uncommon",
    name: { en: "Idea Slayer", vi: "Kẻ diệt ý tưởng" },
    description: {
      en: "Stopped or pivoted an idea because the evidence said so.",
      vi: "Dừng hoặc xoay hướng một ý tưởng vì bằng chứng nói vậy.",
    },
    criteria: {
      en: "One moderator-verified stop or pivot decision backed by evidence.",
      vi: "Một quyết định dừng hoặc xoay hướng có bằng chứng, được moderator xác minh.",
    },
    requiredVerification: "moderator_verified",
    seasonal: { name: { en: "Season Idea Slayer", vi: "Kẻ diệt ý tưởng mùa" } },
    trigger: ({ events }) => firstOf(events, "validate_stop_pivot"),
  },
  {
    key: "first_builder",
    numeral: "III",
    stage: "build",
    rarity: "common",
    name: { en: "First Builder", vi: "Người dựng đầu tiên" },
    description: { en: "Put a working MVP in front of people.", vi: "Đưa một MVP chạy được tới tay người dùng." },
    criteria: { en: "One verified MVP.", vi: "Một MVP đã xác minh." },
    requiredVerification: "moderator_verified",
    seasonal: null,
    trigger: ({ events }) => firstOf(events, "build_mvp"),
  },
  {
    key: "first_ship",
    numeral: "IV",
    stage: "ship",
    rarity: "uncommon",
    name: { en: "First Ship", vi: "Chuyến ship đầu tiên" },
    description: { en: "Launched a product in public.", vi: "Ra mắt sản phẩm công khai." },
    criteria: { en: "One verified product launch.", vi: "Một lần ra mắt sản phẩm đã xác minh." },
    requiredVerification: "moderator_verified",
    seasonal: { name: { en: "Season Ship", vi: "Ship trong mùa" } },
    trigger: ({ events }) => firstOf(events, "ship_product_launch"),
  },
  {
    key: "first_dollar",
    numeral: "V",
    stage: "ship",
    rarity: "rare",
    name: { en: "First Dollar", vi: "Đồng tiền đầu tiên" },
    description: { en: "A customer paid for what you built.", vi: "Một khách hàng đã trả tiền cho thứ bạn làm ra." },
    criteria: {
      en: "One moderator-verified first payment from a real customer (not yourself, not refunded).",
      vi: "Một khoản thanh toán đầu tiên từ khách hàng thật, được moderator xác minh (không tự mua, không hoàn tiền).",
    },
    requiredVerification: "moderator_verified",
    seasonal: null,
    trigger: ({ events }) => firstOf(events, "ship_first_payment"),
  },
  {
    key: "growth_explorer",
    numeral: "VI",
    stage: "ship",
    rarity: "uncommon",
    name: { en: "Growth Explorer", vi: "Nhà thám hiểm tăng trưởng" },
    description: {
      en: "Ran a distribution experiment and wrote up what happened.",
      vi: "Chạy một thử nghiệm phân phối và viết lại kết quả.",
    },
    criteria: { en: "One verified distribution case study.", vi: "Một case study phân phối đã xác minh." },
    requiredVerification: "moderator_verified",
    seasonal: null,
    trigger: ({ events }) => firstOf(events, "ship_distribution_case_study"),
  },
  {
    key: "community_hero",
    numeral: "VII",
    stage: "contribute",
    rarity: "rare",
    name: { en: "Community Hero", vi: "Người hùng cộng đồng" },
    description: {
      en: "Kept helping other builders, week after week.",
      vi: "Bền bỉ giúp đỡ các builder khác, tuần này qua tuần khác.",
    },
    criteria: {
      en: `${COMMUNITY_HERO.events} confirmed peer-help sessions for ${COMMUNITY_HERO.counterparties} different builders across ${COMMUNITY_HERO.weeks} different weeks.`,
      vi: `${COMMUNITY_HERO.events} lần giúp đỡ được xác nhận cho ${COMMUNITY_HERO.counterparties} builder khác nhau trong ${COMMUNITY_HERO.weeks} tuần khác nhau.`,
    },
    requiredVerification: "peer_confirmed",
    seasonal: { name: { en: "Season Hero", vi: "Người hùng mùa" } },
    trigger: ({ events }) => {
      const help = ofType(events, "contribute_peer_help").filter((e) => e.counterpartyUserId);
      const counterparties = new Set(help.map((e) => e.counterpartyUserId));
      const weeks = new Set(help.map((e) => periodKey("week", e.occurredAt)));
      if (help.length < COMMUNITY_HERO.events || counterparties.size < COMMUNITY_HERO.counterparties || weeks.size < COMMUNITY_HERO.weeks) {
        return null;
      }
      return help.map((e) => e.id);
    },
  },
  {
    key: "comeback_builder",
    numeral: "VIII",
    stage: "contribute",
    rarity: "uncommon",
    name: { en: "Comeback Builder", vi: "Builder trở lại" },
    description: {
      en: "Came back to building after a long break.",
      vi: "Quay lại làm sản phẩm sau một quãng nghỉ dài.",
    },
    criteria: {
      en: `Verified progress after at least ${COMEBACK_GAP_WEEKS} weeks without any.`,
      vi: `Có tiến độ đã xác minh sau ít nhất ${COMEBACK_GAP_WEEKS} tuần không hoạt động.`,
    },
    requiredVerification: "peer_confirmed",
    seasonal: null,
    trigger: ({ events }) => {
      for (let i = 1; i < events.length; i++) {
        if (events[i].occurredAt.getTime() - events[i - 1].occurredAt.getTime() >= COMEBACK_GAP_WEEKS * WEEK_MS) {
          return [events[i - 1].id, events[i].id];
        }
      }
      return null;
    },
  },
  {
    key: "nlb_pioneer",
    numeral: "IX",
    stage: "contribute",
    rarity: "legendary",
    name: { en: "NLB Pioneer", vi: "Người tiên phong NLB" },
    description: {
      en: "Joined the Builder League pilot and made verified progress in its first season.",
      vi: "Tham gia thí điểm Builder League và có tiến độ đã xác minh ngay mùa đầu tiên.",
    },
    criteria: {
      en: "Pilot member with at least one verified event in the first season.",
      vi: "Thành viên thí điểm có ít nhất một sự kiện đã xác minh trong mùa đầu tiên.",
    },
    requiredVerification: "peer_confirmed",
    seasonal: null,
    trigger: ({ events, isPilot }) => {
      if (!isPilot) return null;
      const { start, end } = periodRange("season", FIRST_SEASON_KEY);
      const inFirst = events.find((e) => e.occurredAt >= start && e.occurredAt <= end);
      return inFirst ? [inFirst.id] : null;
    },
  },
];

export const FIRST_SEASON_KEY = periodKey("season", new Date(SEASON_EPOCH));

export function getBadge(key: string): BadgeDefinition | undefined {
  return BADGES.find((badge) => badge.key === key);
}

export function isBadgeKey(value: string): value is BadgeKey {
  return (BADGE_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface BadgeCandidate {
  badgeKey: BadgeKey;
  seasonKey: string;
  eventIds: string[];
  /** When the badge was earned: the latest evidence event. */
  earnedAt: Date;
}

/** Pure: every badge (lifetime and seasonal) the given verified history earns. */
export function computeBadgeCandidates(context: BadgeContext): BadgeCandidate[] {
  const candidates: BadgeCandidate[] = [];
  const byId = new Map(context.events.map((e) => [e.id, e]));
  const push = (badge: BadgeDefinition, seasonKey: string, eventIds: string[] | null) => {
    if (!eventIds || eventIds.length === 0) return;
    const earnedAt = new Date(Math.max(...eventIds.map((id) => byId.get(id)?.occurredAt.getTime() ?? 0)));
    candidates.push({ badgeKey: badge.key, seasonKey, eventIds, earnedAt });
  };
  const bySeason = new Map<string, VerifiedEvent[]>();
  for (const event of context.events) {
    const key = periodKey("season", event.occurredAt);
    if (key === "S0") continue;
    bySeason.set(key, [...(bySeason.get(key) ?? []), event]);
  }
  for (const badge of BADGES) {
    const eligible = context.events.filter((e) => meetsVerification(e.verification, badge.requiredVerification));
    push(badge, "", badge.trigger({ ...context, events: eligible }));
    if (!badge.seasonal) continue;
    for (const [seasonKey, seasonEvents] of bySeason) {
      const seasonEligible = seasonEvents.filter((e) => meetsVerification(e.verification, badge.requiredVerification));
      push(badge, seasonKey, badge.trigger({ ...context, events: seasonEligible }));
    }
  }
  return candidates;
}

async function isPilotMember(db: AppDb, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: builderPilotMembers.userId })
    .from(builderPilotMembers)
    .where(eq(builderPilotMembers.userId, userId))
    .limit(1);
  return Boolean(row);
}

function badgeEventType(key: BadgeKey): string {
  return `badge:${key}`;
}

/**
 * Grants every badge the member's verified history earns and has not been granted (or revoked) before.
 * Safe to call on every read, after every moderation decision and from cron. Returns the new awards.
 */
export async function evaluateBadges(db: AppDb, userId: string): Promise<BadgeAward[]> {
  const [events, isPilot] = await Promise.all([getVerifiedHistory(db, userId), isPilotMember(db, userId)]);
  const candidates = computeBadgeCandidates({ events, isPilot });
  const created: BadgeAward[] = [];
  for (const candidate of candidates) {
    const [award] = await db
      .insert(badgeAwards)
      .values({
        id: crypto.randomUUID(),
        userId,
        badgeKey: candidate.badgeKey,
        seasonKey: candidate.seasonKey,
        eventIds: candidate.eventIds,
        awardedAt: new Date(),
      })
      .onConflictDoNothing({ target: [badgeAwards.userId, badgeAwards.badgeKey, badgeAwards.seasonKey] })
      .returning();
    if (!award) continue;
    created.push(award);
    await recordBadgeEvent(db, award, candidate.earnedAt);
  }
  return created;
}

async function recordBadgeEvent(db: AppDb, award: BadgeAward, earnedAt: Date): Promise<void> {
  const badge = getBadge(award.badgeKey)!;
  await recordBuilderEvent(db, {
    kind: "badge",
    subjectUserId: award.userId,
    actorUserId: null,
    actorRole: "system",
    stage: badge.stage,
    eventType: badgeEventType(badge.key),
    source: "system",
    externalEventId: `badge:${badge.key}:${award.seasonKey || "lifetime"}`,
    occurredAt: earnedAt,
    verification: "system_verified",
    payload: { badgeKey: badge.key, seasonKey: award.seasonKey, awardId: award.id, evidenceEventIds: award.eventIds },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every award of the member, newest first. Revoked awards are included with `revokedAt` set. */
export async function getBadgeAwards(db: AppDb, userId: string, { includeRevoked = false } = {}): Promise<BadgeAward[]> {
  const conditions = [eq(badgeAwards.userId, userId)];
  if (!includeRevoked) conditions.push(isNull(badgeAwards.revokedAt));
  return db.select().from(badgeAwards).where(and(...conditions)).orderBy(desc(badgeAwards.awardedAt));
}

export interface BadgeView {
  key: BadgeKey;
  numeral: string;
  stage: Stage;
  rarity: BadgeRarity;
  name: string;
  description: string;
  criteria: string;
  seasonalName: string | null;
  earned: { awardId: string; awardedAt: string; evidenceCount: number } | null;
  seasons: { awardId: string; seasonKey: string; awardedAt: string }[];
}

/** Catalogue joined with the member's standing awards, localised. */
export function buildBadgeViews(awards: BadgeAward[], locale: "en" | "vi"): BadgeView[] {
  return BADGES.map((badge) => {
    const mine = awards.filter((a) => a.badgeKey === badge.key && !a.revokedAt);
    const lifetime = mine.find((a) => a.seasonKey === "");
    return {
      key: badge.key,
      numeral: badge.numeral,
      stage: badge.stage,
      rarity: badge.rarity,
      name: badge.name[locale],
      description: badge.description[locale],
      criteria: badge.criteria[locale],
      seasonalName: badge.seasonal?.name[locale] ?? null,
      earned: lifetime
        ? { awardId: lifetime.id, awardedAt: lifetime.awardedAt.toISOString(), evidenceCount: lifetime.eventIds.length }
        : null,
      seasons: mine
        .filter((a) => a.seasonKey !== "")
        .map((a) => ({ awardId: a.id, seasonKey: a.seasonKey, awardedAt: a.awardedAt.toISOString() }))
        .sort((a, b) => a.seasonKey.localeCompare(b.seasonKey, "en", { numeric: true })),
    };
  });
}

export interface BadgeShareCard {
  awardId: string;
  badgeKey: BadgeKey;
  numeral: string;
  name: string;
  seasonKey: string | null;
  rarity: BadgeRarity;
  stage: Stage;
  awardedAt: string;
  holderName: string;
  /** Number of verified events behind the badge; the events themselves stay private. */
  evidenceCount: number;
}

/**
 * Data for a shareable badge card. Only the holder can build it; the card carries counts, never the
 * underlying evidence.
 */
export async function getBadgeShareCard(
  db: AppDb,
  awardId: string,
  viewerId: string,
  locale: "en" | "vi"
): Promise<BadgeShareCard | null> {
  const [row] = await db
    .select({ award: badgeAwards, holderName: users.name })
    .from(badgeAwards)
    .innerJoin(users, eq(users.id, badgeAwards.userId))
    .where(eq(badgeAwards.id, awardId))
    .limit(1);
  if (!row || row.award.revokedAt || row.award.userId !== viewerId) return null;
  const badge = getBadge(row.award.badgeKey);
  if (!badge) return null;
  const seasonKey = row.award.seasonKey || null;
  return {
    awardId: row.award.id,
    badgeKey: badge.key,
    numeral: badge.numeral,
    name: seasonKey && badge.seasonal ? badge.seasonal.name[locale] : badge.name[locale],
    seasonKey,
    rarity: badge.rarity,
    stage: badge.stage,
    awardedAt: row.award.awardedAt.toISOString(),
    holderName: row.holderName,
    evidenceCount: row.award.eventIds.length,
  };
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

export interface RevokeBadgeInput {
  awardId: string;
  actorId: string;
  actorRole: ActorRole;
  reason: string;
}

/**
 * Revokes an award (admin only). The award row stays with `revoked_at` and the reason, so the badge is
 * never re-granted by evaluation; a `badge` event records the revocation for the journey. Idempotent.
 */
export async function revokeBadge(db: AppDb, input: RevokeBadgeInput): Promise<BadgeAward> {
  if (input.actorRole !== "admin") throw new BuilderApiError(403, "admin_required", "Only admins can revoke badges.");
  const reason = input.reason.trim();
  if (!reason) throw new BuilderApiError(400, "reason_required", "A revocation needs a reason.");
  const [award] = await db.select().from(badgeAwards).where(eq(badgeAwards.id, input.awardId)).limit(1);
  if (!award) throw new BuilderApiError(404, "award_not_found", "Badge award not found.");
  if (award.revokedAt) return award;

  const now = new Date();
  const statements: BatchItem<"sqlite">[] = [
    db
      .update(badgeAwards)
      .set({ revokedAt: now, revokeReason: reason })
      .where(and(eq(badgeAwards.id, award.id), isNull(badgeAwards.revokedAt))),
    moderationActionInsert(db, {
      targetType: "badge_award",
      targetId: award.id,
      action: "revoke",
      actorId: input.actorId,
      actorRole: input.actorRole,
      reasonCodes: ["badge_revoked"],
      notes: reason,
    }),
  ];
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  const badge = getBadge(award.badgeKey);
  if (badge) {
    await recordBuilderEvent(db, {
      kind: "badge",
      subjectUserId: award.userId,
      actorUserId: input.actorId,
      actorRole: "admin",
      stage: badge.stage,
      eventType: badgeEventType(badge.key),
      source: "moderator",
      externalEventId: `badge-revoke:${award.id}`,
      occurredAt: now,
      verification: "moderator_verified",
      payload: { badgeKey: badge.key, seasonKey: award.seasonKey, awardId: award.id, revoked: true, note: reason },
    });
  }
  const [updated] = await db.select().from(badgeAwards).where(eq(badgeAwards.id, award.id)).limit(1);
  return updated;
}
