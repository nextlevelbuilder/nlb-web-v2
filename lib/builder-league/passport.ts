/**
 * Builder Passport: one member's level, rank, stage mix, verified milestones, badges, projects and
 * proof links.
 *
 * Two views:
 * - private (the member themself, or an admin): everything verified, plus the privacy switches;
 * - public (anyone else, only when `passport_public` is on): verified milestones whose event is
 *   `public`, whose evidence (if any) is public and approved, public non-archived projects, and badges.
 *   With `redact_financials` on, payment and willingness-to-pay milestones show only their type.
 * Nothing private is ever copied into the public view: it is built from an allowlist, not by deleting
 * fields from the private view.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { activityEvidence, badgeAwards, builderEvents, builderProjects, scoreLedger, users } from "@/lib/db/schema";
import { STAGES, type RankKey, type Stage, type Visibility } from "./types";
import { getEffectiveRuleset } from "./ruleset";
import { leagueScore, levelProgress, type LevelProgress, type RankRequirement } from "./scoring";
import { getPrivacy, type BuilderPrivacy } from "./privacy";
import { evaluateRank, getCurrentRank } from "./ranks";
import { periodKey, periodRange } from "./time-windows";

/** Milestones whose details may reveal revenue; redacted publicly while `redact_financials` is on. */
const FINANCIAL_EVENT_TYPES = new Set(["ship_first_payment", "validate_wtp_commitment"]);
const MAX_MILESTONES = 50;
const MAX_PROOF_LINKS = 20;

export interface PassportMilestone {
  eventId: string;
  eventType: string;
  stage: Stage;
  occurredAt: string;
  rp: number;
  projectId: string | null;
  /** Evidence title; null when it is not shareable in this view. */
  title: string | null;
  links: string[];
  /** Private view only. */
  visibility?: Visibility;
}

export interface PassportProject {
  id: string;
  name: string;
  slug: string;
  summary: string;
  stage: Stage;
  productId: string | null;
  /** Private view only. */
  visibility?: Visibility;
}

export interface PassportBadge {
  badgeKey: string;
  seasonKey: string;
  awardedAt: string;
}

export interface Passport {
  view: "public" | "private";
  user: { id: string; name: string; image: string | null; memberSince: string };
  rp: number;
  level: LevelProgress;
  rank: { key: RankKey; awardedAt: string | null };
  /** Net lifetime RP per stage (floored at 0) and each stage's share of the total. */
  stageMix: Record<Stage, { rp: number; share: number }>;
  milestones: PassportMilestone[];
  badges: PassportBadge[];
  projects: PassportProject[];
  proofLinks: string[];
  /** Private view only. */
  privacy?: Omit<BuilderPrivacy, "userId" | "updatedAt">;
}

export interface PassportViewer {
  id: string;
  isAdmin?: boolean;
}

export interface PassportOptions {
  /** `public` forces the public view even for the owner (used on public pages). */
  audience?: "auto" | "public";
  now?: Date;
}

const iso = (value: Date) => value.toISOString();

/**
 * The passport `viewer` may see, or null when the member does not exist or has not opted in and the
 * viewer is neither the member nor an admin.
 */
export async function getPassport(
  db: AppDb,
  userId: string,
  viewer: PassportViewer | null,
  options: PassportOptions = {}
): Promise<Passport | null> {
  const now = options.now ?? new Date();
  const [account] = await db
    .select({ id: users.id, name: users.name, image: users.image, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return null;
  const privacy = await getPrivacy(db, userId);
  const privileged = options.audience !== "public" && Boolean(viewer && (viewer.id === userId || viewer.isAdmin));
  if (!privileged && !privacy.passportPublic) return null;
  const isPublicView = !privileged;

  const ledger = await db
    .select({
      id: scoreLedger.id,
      eventId: scoreLedger.eventId,
      awardType: scoreLedger.awardType,
      stage: scoreLedger.stage,
      rp: scoreLedger.rp,
      reversesEntryId: scoreLedger.reversesEntryId,
      occurredAt: scoreLedger.occurredAt,
    })
    .from(scoreLedger)
    .where(eq(scoreLedger.userId, userId));
  const rp = ledger.reduce((sum, row) => sum + row.rp, 0);
  const stageRp = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
  for (const row of ledger) if (row.stage in stageRp) stageRp[row.stage] += row.rp;
  const positiveTotal = STAGES.reduce((sum, stage) => sum + Math.max(0, stageRp[stage]), 0);
  const stageMix = Object.fromEntries(
    STAGES.map((stage) => {
      const value = Math.max(0, stageRp[stage]);
      return [stage, { rp: value, share: positiveTotal > 0 ? Math.round((value / positiveTotal) * 1000) / 1000 : 0 }];
    })
  ) as Passport["stageMix"];

  // Verified milestones: award entries that were not reversed (manual adjustments are not milestones).
  const reversed = new Set(ledger.filter((row) => row.reversesEntryId).map((row) => row.reversesEntryId!));
  const awards = ledger
    .filter((row) => !row.reversesEntryId && !reversed.has(row.id) && row.rp > 0 && row.awardType !== "adjustment")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const eventIds = [...new Set(awards.map((row) => row.eventId))];
  const events = new Map<string, typeof builderEvents.$inferSelect>();
  for (let i = 0; i < eventIds.length; i += 90) {
    const rows = await db.select().from(builderEvents).where(inArray(builderEvents.id, eventIds.slice(i, i + 90)));
    for (const row of rows) events.set(row.id, row);
  }
  const evidenceIds = [...new Set([...events.values()].map((event) => event.evidenceId).filter((id): id is string => Boolean(id)))];
  const evidence = new Map<string, { title: string; links: string[]; visibility: Visibility; status: string }>();
  for (let i = 0; i < evidenceIds.length; i += 90) {
    const rows = await db
      .select({
        id: activityEvidence.id,
        userId: activityEvidence.userId,
        title: activityEvidence.title,
        links: activityEvidence.links,
        visibility: activityEvidence.visibility,
        status: activityEvidence.status,
      })
      .from(activityEvidence)
      .where(inArray(activityEvidence.id, evidenceIds.slice(i, i + 90)));
    for (const row of rows) if (row.userId === userId) evidence.set(row.id, row);
  }

  const milestones: PassportMilestone[] = [];
  for (const award of awards) {
    if (milestones.length >= MAX_MILESTONES) break;
    const event = events.get(award.eventId);
    if (!event || event.subjectUserId !== userId || !["activity", "backfill", "correction"].includes(event.kind)) continue;
    const proof = event.evidenceId ? evidence.get(event.evidenceId) : undefined;
    if (isPublicView) {
      if (event.visibility !== "public") continue;
      if (event.evidenceId && (!proof || proof.visibility !== "public" || proof.status !== "approved")) continue;
      const redacted = privacy.redactFinancials && FINANCIAL_EVENT_TYPES.has(event.eventType);
      milestones.push({
        eventId: event.eventId,
        eventType: event.eventType,
        stage: event.stage,
        occurredAt: iso(event.occurredAt),
        rp: award.rp,
        projectId: null,
        title: redacted ? null : proof?.title ?? null,
        links: redacted ? [] : proof?.links ?? [],
      });
    } else {
      milestones.push({
        eventId: event.eventId,
        eventType: event.eventType,
        stage: event.stage,
        occurredAt: iso(event.occurredAt),
        rp: award.rp,
        projectId: event.projectId,
        title: proof?.title ?? null,
        links: proof?.links ?? [],
        visibility: event.visibility,
      });
    }
  }

  const projectRows = await db
    .select()
    .from(builderProjects)
    .where(and(eq(builderProjects.ownerUserId, userId), isNull(builderProjects.archivedAt)));
  const projects: PassportProject[] = projectRows
    .filter((project) => !isPublicView || project.visibility === "public")
    .map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      summary: project.summary,
      stage: project.stage,
      productId: project.productId,
      ...(isPublicView ? {} : { visibility: project.visibility }),
    }));
  if (isPublicView) {
    // Only link milestones to projects that are themselves public.
    const publicProjectIds = new Set(projects.map((project) => project.id));
    for (const milestone of milestones) {
      const event = [...events.values()].find((e) => e.eventId === milestone.eventId);
      milestone.projectId = event?.projectId && publicProjectIds.has(event.projectId) ? event.projectId : null;
    }
  }

  const badges = (
    await db
      .select({ badgeKey: badgeAwards.badgeKey, seasonKey: badgeAwards.seasonKey, awardedAt: badgeAwards.awardedAt })
      .from(badgeAwards)
      .where(and(eq(badgeAwards.userId, userId), isNull(badgeAwards.revokedAt)))
  ).map((badge) => ({ badgeKey: badge.badgeKey, seasonKey: badge.seasonKey, awardedAt: iso(badge.awardedAt) }));

  const proofLinks = [...new Set(milestones.flatMap((milestone) => milestone.links))].slice(0, MAX_PROOF_LINKS);
  const rank = await getCurrentRank(db, userId);
  const passport: Passport = {
    view: isPublicView ? "public" : "private",
    user: { id: account.id, name: account.name, image: account.image ?? null, memberSince: iso(account.createdAt) },
    rp,
    level: levelProgress(rp, getEffectiveRuleset(now)),
    rank: { key: rank.rank, awardedAt: rank.award ? iso(rank.award.awardedAt) : null },
    stageMix,
    milestones,
    badges,
    projects,
    proofLinks,
  };
  if (!isPublicView) {
    const { userId: _userId, updatedAt: _updatedAt, ...switches } = privacy;
    passport.privacy = switches;
  }
  return passport;
}

// ---------------------------------------------------------------------------
// Member summary (`GET /api/v1/builder-me`, the `/builder-league` home)
// ---------------------------------------------------------------------------

export interface BuilderSummary {
  userId: string;
  rp: number;
  level: LevelProgress;
  rank: {
    current: RankKey;
    awardedAt: string | null;
    eligible: RankKey;
    next: RankKey | null;
    /** Requirements of the next rank (empty at Legend). */
    nextRequirements: RankRequirement[];
    inactive: boolean;
    lastActivityAt: string | null;
  };
  week: { periodKey: string; score: number; components: Record<Stage, number> };
  /** Evidence still waiting on a moderator or on the member (`submitted`, `needs_info`). */
  pendingEvidence: number;
  privacy: Omit<BuilderPrivacy, "userId" | "updatedAt">;
  rulesetVersion: string;
}

/** Read-only summary of the signed-in member. It never awards a rank. */
export async function getBuilderSummary(db: AppDb, userId: string, now = new Date()): Promise<BuilderSummary> {
  const ruleset = getEffectiveRuleset(now);
  const evaluation = await evaluateRank(db, userId, { now, dryRun: true });
  const held = await getCurrentRank(db, userId);
  const weekKey = periodKey("week", now);
  const range = periodRange("week", weekKey);
  const weekRows = await db
    .select({ stage: scoreLedger.stage, rp: scoreLedger.rp })
    .from(scoreLedger)
    .where(and(eq(scoreLedger.userId, userId), gte(scoreLedger.occurredAt, range.start), lte(scoreLedger.occurredAt, range.end)));
  const week = leagueScore(weekRows, ruleset, "week");
  const [pending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activityEvidence)
    .where(and(eq(activityEvidence.userId, userId), inArray(activityEvidence.status, ["submitted", "needs_info"])));
  const privacy = await getPrivacy(db, userId);
  const { userId: _userId, updatedAt: _updatedAt, ...switches } = privacy;
  const next = evaluation.checklist.checks.find((check) => check.rank === evaluation.checklist.nextRank);
  return {
    userId,
    rp: evaluation.stats.rp,
    level: levelProgress(evaluation.stats.rp, ruleset),
    rank: {
      current: held.rank,
      awardedAt: held.award ? iso(held.award.awardedAt) : null,
      eligible: evaluation.checklist.eligibleRank,
      next: evaluation.checklist.nextRank,
      nextRequirements: next?.requirements ?? [],
      inactive: evaluation.inactive,
      lastActivityAt: evaluation.lastActivityAt ? iso(evaluation.lastActivityAt) : null,
    },
    week: { periodKey: weekKey, score: week.total, components: week.components },
    pendingEvidence: Number(pending?.count ?? 0),
    privacy: switches,
    rulesetVersion: ruleset.version,
  };
}
