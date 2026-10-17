/**
 * Year in Review ("Your Year Among the Stars"): a deterministic yearly snapshot per member, year and
 * version, stored in `yearly_snapshots`.
 *
 * Determinism: the snapshot is a pure function of rows recorded up to a fixed cutoff, so re-running the
 * same version produces byte-identical canonical JSON. Nothing in the data depends on the time the job
 * ran; a new version is stored only when the data actually changes (a late approval or a correction).
 *
 * Cutoffs, all in Asia/Ho_Chi_Minh (UTC+7):
 * - provisional: events that occurred in the year up to Dec 30 23:59:59.999 and were verified by then
 *   (or by now, while the year is still running);
 * - final: after Dec 31 closes plus the moderation grace period (`FINAL_GRACE_DAYS`), covering every
 *   event of the year verified by the end of the grace period. A final snapshot is never replaced.
 *
 * Honesty rules: only verified events count, reversed events drop out, corrections replace what they
 * correct, backfilled events keep their provenance, and a scene without a real milestone is omitted.
 * No figure is invented and no text is generated: titles come from the member's own evidence.
 */
import { and, desc, eq, gte, inArray, like, lte, or } from "drizzle-orm";
import { createHash } from "crypto";
import type { AppDb } from "@/lib/db";
import {
  activityEvidence,
  badgeAwards,
  builderEvents,
  builderPrivacy,
  builderProjects,
  leagueSnapshots,
  rankAwards,
  scoreLedger,
  timeCapsuleEntries,
  users,
  yearlySnapshots,
} from "@/lib/db/schema";
import { canonicalJson, getEffectiveRuleset, getRuleset } from "./ruleset";
import { leagueScore } from "./scoring";
import { localDateKey, periodKey, periodRange } from "./time-windows";
import { BuilderApiError } from "./http";
import { STAGES, type RankKey, type Stage, type Verification, type Visibility } from "./types";

export const YEAR_REVIEW_SCHEMA = 1;
/** Days after Dec 31 (local) during which late moderation still lands in the final snapshot. */
export const FINAL_GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

export const SCENE_KEYS = [
  "year_in_numbers",
  "first_idea",
  "validation",
  "pivotal_learning",
  "mvp",
  "launch",
  "first_customer",
  "community_impact",
  "league_highlights",
  "next_year",
] as const;
export type SceneKey = (typeof SCENE_KEYS)[number];

export function isSceneKey(value: string): value is SceneKey {
  return (SCENE_KEYS as readonly string[]).includes(value);
}

export type SnapshotStatus = "provisional" | "final";

export interface YearWindow {
  year: number;
  /** First millisecond of the local year. */
  start: number;
  /** Dec 30 23:59:59.999 local: the provisional cutoff. */
  provisionalCutoff: number;
  /** Dec 31 23:59:59.999 local. */
  end: number;
  /** When the final snapshot becomes due: end of year plus the grace period. */
  finalAt: number;
}

export function yearWindow(year: number): YearWindow {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new BuilderApiError(400, "invalid_year", "Invalid year");
  const { start, end } = periodRange("year", String(year));
  return {
    year,
    start: start.getTime(),
    provisionalCutoff: end.getTime() - DAY_MS,
    end: end.getTime(),
    finalAt: end.getTime() + 1 + FINAL_GRACE_DAYS * DAY_MS,
  };
}

export function snapshotStatusAt(year: number, now: Date): SnapshotStatus {
  return now.getTime() >= yearWindow(year).finalAt ? "final" : "provisional";
}

/** The fixed cutoff recorded in the data, and the moment rows are read up to (never after `now`). */
export function snapshotCutoff(year: number, now: Date): { status: SnapshotStatus; cutoffAt: number; occurredUntil: number; readUntil: number } {
  const window = yearWindow(year);
  const status = snapshotStatusAt(year, now);
  if (status === "final") return { status, cutoffAt: window.finalAt - 1, occurredUntil: window.end, readUntil: window.finalAt - 1 };
  return { status, cutoffAt: window.provisionalCutoff, occurredUntil: window.provisionalCutoff, readUntil: Math.min(now.getTime(), window.provisionalCutoff) };
}

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export interface YearMilestone {
  eventId: string;
  eventType: string;
  stage: Stage;
  occurredAt: number;
  localDate: string;
  projectId: string | null;
  projectName: string | null;
  title: string | null;
  visibility: Visibility;
  verification: Verification;
  rp: number;
  backfill: boolean;
  provenanceLabel: string | null;
}

export interface YearScene {
  key: SceneKey;
  eventIds: string[];
  occurredAt: number | null;
  facts: Record<string, number | string>;
  /** True when every fact of the scene may appear on the shared (public) version. */
  publicSafe: boolean;
}

export interface CapsuleNote {
  body: string;
  visibility: Visibility;
  version: number;
}

export interface YearStats {
  verifiedMilestones: number;
  byStage: Record<Stage, number>;
  projects: number;
  activeWeeks: number;
  rp: number;
  peopleHelped: number;
  learnings: number;
  backfilled: number;
}

export type ArchetypeKey = "pathfinder" | "maker" | "launcher" | "guide" | "polymath";

export interface YearReviewData {
  schema: number;
  year: number;
  status: SnapshotStatus;
  rulesetVersion: string;
  cutoffAt: number;
  eventHash: string;
  stats: YearStats;
  score: { total: number; components: Record<Stage, number>; normalized: Record<Stage, number> } | null;
  milestones: YearMilestone[];
  badges: { badgeKey: string; seasonKey: string; awardedAt: number }[];
  ranks: { rank: RankKey; awardedAt: number }[];
  leagueHighlights: { board: string; periodType: string; periodKey: string; position: number }[];
  standoutDay: { date: string; count: number; eventIds: string[] } | null;
  standoutEventIds: string[];
  reflection: { intent: CapsuleNote | null; reflection: CapsuleNote | null; nextYearIntent: CapsuleNote | null };
  peerMentions: { userId: string; name: string }[];
  scenes: YearScene[];
  /** A playful summary of this year's activity mix, never a personality or skill label. */
  archetype: { key: ArchetypeKey; basis: Record<Stage, number> } | null;
  provenance: {
    sources: string[];
    backfill: { count: number; labels: string[]; firstAt: number | null; lastAt: number | null } | null;
  };
  /** Missing-data markers: scenes with no real milestone, and where tracking starts. */
  missing: { scenes: SceneKey[]; trackedFrom: string | null; untrackedBeforeTrackedFrom: boolean };
}

// ---------------------------------------------------------------------------
// Pure assembly
// ---------------------------------------------------------------------------

export interface YearReviewInputs {
  year: number;
  status: SnapshotStatus;
  cutoffAt: number;
  rulesetVersion: string;
  milestones: YearMilestone[];
  ledger: { stage: Stage; rp: number }[];
  badges: YearReviewData["badges"];
  ranks: YearReviewData["ranks"];
  leagueHighlights: YearReviewData["leagueHighlights"];
  reflection: YearReviewData["reflection"];
  peerMentions: YearReviewData["peerMentions"];
  /** Distinct members the subject helped (verified peer help), mentioned or not. */
  peopleHelped: number;
}

const byTimeThenId = <T extends { occurredAt: number; eventId: string }>(a: T, b: T) =>
  a.occurredAt - b.occurredAt || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);

function first(milestones: YearMilestone[], types: string[]): YearMilestone | undefined {
  return milestones.find((m) => types.includes(m.eventType));
}

function eventScene(key: SceneKey, picked: YearMilestone[], facts: Record<string, number | string> = {}): YearScene {
  return {
    key,
    eventIds: picked.map((m) => m.eventId),
    occurredAt: picked[0]?.occurredAt ?? null,
    facts,
    publicSafe: picked.every((m) => m.visibility === "public"),
  };
}

function stageCounts(milestones: readonly YearMilestone[]): Record<Stage, number> {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const m of milestones) counts[m.stage] += 1;
  return counts;
}

export function computeStats(milestones: readonly YearMilestone[], peopleHelped: number): YearStats {
  return {
    verifiedMilestones: milestones.length,
    byStage: stageCounts(milestones),
    projects: new Set(milestones.map((m) => m.projectId).filter(Boolean)).size,
    activeWeeks: new Set(milestones.map((m) => periodKey("week", new Date(m.occurredAt)))).size,
    rp: milestones.reduce((sum, m) => sum + m.rp, 0),
    peopleHelped,
    learnings: milestones.filter((m) => m.eventType === "validate_stop_pivot").length,
    backfilled: milestones.filter((m) => m.backfill).length,
  };
}

const ARCHETYPE_BY_STAGE: Record<Stage, ArchetypeKey> = { validate: "pathfinder", build: "maker", ship: "launcher", contribute: "guide" };

/** Deterministic: the dominant stage when it holds at least 40 % of milestones, else "polymath". */
export function computeArchetype(milestones: readonly YearMilestone[]): YearReviewData["archetype"] {
  if (milestones.length < 3) return null;
  const basis = stageCounts(milestones);
  let top: Stage = STAGES[0];
  for (const stage of STAGES) if (basis[stage] > basis[top]) top = stage;
  const key = basis[top] / milestones.length >= 0.4 ? ARCHETYPE_BY_STAGE[top] : "polymath";
  return { key, basis };
}

export function computeStandoutDay(milestones: readonly YearMilestone[]): YearReviewData["standoutDay"] {
  const byDay = new Map<string, string[]>();
  for (const m of milestones) byDay.set(m.localDate, [...(byDay.get(m.localDate) ?? []), m.eventId]);
  let best: YearReviewData["standoutDay"] = null;
  for (const [date, eventIds] of [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!best || eventIds.length > best.count) best = { date, count: eventIds.length, eventIds };
  }
  return best && best.count >= 2 ? best : null;
}

export function buildYearReviewData(inputs: YearReviewInputs): YearReviewData {
  const milestones = [...inputs.milestones].sort(byTimeThenId);
  const ruleset = getRuleset(inputs.rulesetVersion);
  const scenes: YearScene[] = [];

  if (milestones.length > 0) {
    const stats = stageCounts(milestones);
    scenes.push({
      key: "year_in_numbers",
      eventIds: [],
      occurredAt: null,
      facts: { milestones: milestones.length, validate: stats.validate, build: stats.build, ship: stats.ship, contribute: stats.contribute },
      publicSafe: false, // the shared version recomputes these numbers from public milestones only
    });
  }

  const firstIdea = first(milestones, ["validate_problem_signal"]) ?? milestones.find((m) => m.stage === "validate" && m.eventType !== "validate_stop_pivot");
  if (firstIdea) scenes.push(eventScene("first_idea", [firstIdea]));

  // The strongest validation signal of the year: commitment > waitlist > interviews.
  const validation = first(milestones, ["validate_wtp_commitment"]) ?? first(milestones, ["validate_waitlist"]) ?? first(milestones, ["validate_interviews"]);
  if (validation && validation.eventId !== firstIdea?.eventId) scenes.push(eventScene("validation", [validation], { signal: validation.eventType }));

  const pivot = first(milestones, ["validate_stop_pivot"]);
  if (pivot) scenes.push(eventScene("pivotal_learning", [pivot]));

  const mvp = first(milestones, ["build_mvp"]);
  if (mvp) scenes.push(eventScene("mvp", [mvp]));

  const launch = first(milestones, ["ship_product_launch"]);
  if (launch) scenes.push(eventScene("launch", [launch]));

  const payment = first(milestones, ["ship_first_payment"]);
  const realUser = first(milestones, ["build_first_real_user"]);
  const customer = payment ?? realUser;
  if (customer) scenes.push(eventScene("first_customer", [customer], { kind: payment ? "payment" : "user" }));

  const contributions = milestones.filter((m) => m.stage === "contribute");
  if (contributions.length > 0) {
    scenes.push(eventScene("community_impact", contributions, {
      contributions: contributions.length,
      peopleHelped: inputs.peopleHelped,
    }));
  }

  if (inputs.badges.length > 0 || inputs.ranks.length > 0 || inputs.leagueHighlights.length > 0) {
    const bestPlacement = inputs.leagueHighlights[0];
    scenes.push({
      key: "league_highlights",
      eventIds: [],
      occurredAt: null,
      facts: {
        badges: inputs.badges.length,
        ranks: inputs.ranks.length,
        ...(bestPlacement ? { bestPosition: bestPlacement.position, bestBoard: bestPlacement.board, bestPeriod: bestPlacement.periodKey } : {}),
        ...(inputs.ranks.length > 0 ? { latestRank: inputs.ranks[inputs.ranks.length - 1].rank } : {}),
      },
      publicSafe: true,
    });
  }

  const nextNote = inputs.reflection.nextYearIntent ?? inputs.reflection.reflection;
  if (nextNote) {
    scenes.push({
      key: "next_year",
      eventIds: [],
      occurredAt: null,
      facts: { source: inputs.reflection.nextYearIntent ? "intent" : "reflection" },
      publicSafe: nextNote.visibility === "public",
    });
  }

  const present = new Set(scenes.map((s) => s.key));
  const ledgerEntries = inputs.ledger;
  const backfilled = milestones.filter((m) => m.backfill);
  const standoutEventIds = [...milestones]
    .sort((a, b) => b.rp - a.rp || byTimeThenId(a, b))
    .filter((m) => m.rp > 0)
    .slice(0, 3)
    .map((m) => m.eventId);
  const trackedFrom = milestones[0]?.localDate ?? null;

  const sources = new Set<string>(["builder_events"]);
  if (ledgerEntries.length > 0) sources.add("score_ledger");
  if (milestones.some((m) => m.title)) sources.add("activity_evidence");
  if (inputs.badges.length > 0) sources.add("badge_awards");
  if (inputs.ranks.length > 0) sources.add("rank_awards");
  if (inputs.leagueHighlights.length > 0) sources.add("league_snapshots");
  if (inputs.reflection.intent || inputs.reflection.reflection || inputs.reflection.nextYearIntent) sources.add("time_capsule_entries");

  return {
    schema: YEAR_REVIEW_SCHEMA,
    year: inputs.year,
    status: inputs.status,
    rulesetVersion: inputs.rulesetVersion,
    cutoffAt: inputs.cutoffAt,
    eventHash: createHash("sha256").update(milestones.map((m) => m.eventId).join("|")).digest("hex"),
    stats: computeStats(milestones, inputs.peopleHelped),
    score: ledgerEntries.length > 0 ? leagueScore(ledgerEntries, ruleset, "year") : null,
    milestones,
    badges: inputs.badges,
    ranks: inputs.ranks,
    leagueHighlights: inputs.leagueHighlights,
    standoutDay: computeStandoutDay(milestones),
    standoutEventIds,
    reflection: inputs.reflection,
    peerMentions: inputs.peerMentions,
    scenes,
    archetype: computeArchetype(milestones),
    provenance: {
      sources: [...sources].sort(),
      backfill: backfilled.length > 0
        ? {
            count: backfilled.length,
            labels: [...new Set(backfilled.map((m) => m.provenanceLabel ?? "backfill"))].sort(),
            firstAt: backfilled[0].occurredAt,
            lastAt: backfilled[backfilled.length - 1].occurredAt,
          }
        : null,
    },
    missing: {
      scenes: SCENE_KEYS.filter((key) => !present.has(key)),
      trackedFrom,
      untrackedBeforeTrackedFrom: Boolean(trackedFrom && !trackedFrom.endsWith("-01-01")),
    },
  };
}

// ---------------------------------------------------------------------------
// Public (shared) projection
// ---------------------------------------------------------------------------

export interface PublicYearReview {
  year: number;
  status: SnapshotStatus;
  rulesetVersion: string;
  cutoffAt: number;
  stats: Omit<YearStats, "rp" | "backfilled" | "peopleHelped">;
  milestones: Omit<YearMilestone, "rp" | "verification">[];
  badges: YearReviewData["badges"];
  ranks: YearReviewData["ranks"];
  standoutDay: YearReviewData["standoutDay"];
  peerMentions: YearReviewData["peerMentions"];
  nextYearNote: string | null;
  scenes: YearScene[];
  archetype: YearReviewData["archetype"];
  provenance: YearReviewData["provenance"];
  missing: YearReviewData["missing"];
}

/**
 * The shared version: smaller and redacted. Only public milestones and public-safe scenes the member
 * did not hide; numbers are recomputed from public milestones so private activity never leaks through
 * a count; no RP, score, summaries or private reflections.
 */
export function toPublicYearReview(data: YearReviewData, hiddenScenes: readonly string[]): PublicYearReview {
  const hidden = new Set(hiddenScenes);
  const milestones = data.milestones.filter((m) => m.visibility === "public");
  const publicIds = new Set(milestones.map((m) => m.eventId));
  const stats = computeStats(milestones, 0);
  const scenes: YearScene[] = [];
  if (milestones.length > 0 && !hidden.has("year_in_numbers")) {
    scenes.push({
      key: "year_in_numbers",
      eventIds: [],
      occurredAt: null,
      facts: { milestones: stats.verifiedMilestones, ...stats.byStage },
      publicSafe: true,
    });
  }
  for (const scene of data.scenes) {
    if (scene.key === "year_in_numbers" || hidden.has(scene.key) || !scene.publicSafe) continue;
    if (!scene.eventIds.every((id) => publicIds.has(id))) continue;
    const facts = scene.key === "community_impact" ? { contributions: scene.eventIds.length } : scene.facts;
    scenes.push({ ...scene, facts });
  }
  const nextNote = data.reflection.nextYearIntent ?? data.reflection.reflection;
  const { rp: _rp, backfilled: _backfilled, peopleHelped: _helped, ...publicStats } = stats;
  const shown = (key: SceneKey) => scenes.some((s) => s.key === key);
  const backfilled = milestones.filter((m) => m.backfill);
  return {
    year: data.year,
    status: data.status,
    rulesetVersion: data.rulesetVersion,
    cutoffAt: data.cutoffAt,
    stats: publicStats,
    milestones: milestones.map(({ rp: _r, verification: _v, ...rest }) => rest),
    // Each detail travels only with the scene that shows it, so a hidden scene leaks nothing.
    badges: shown("league_highlights") ? data.badges : [],
    ranks: shown("league_highlights") ? data.ranks : [],
    standoutDay: computeStandoutDay(milestones),
    peerMentions: shown("community_impact") ? data.peerMentions : [],
    nextYearNote: shown("next_year") && nextNote?.visibility === "public" ? nextNote.body : null,
    scenes,
    archetype: computeArchetype(milestones),
    provenance: {
      sources: data.provenance.sources,
      backfill: backfilled.length === 0 ? null : {
        count: backfilled.length,
        labels: [...new Set(backfilled.map((m) => m.provenanceLabel ?? "backfill"))].sort(),
        firstAt: backfilled[0].occurredAt,
        lastAt: backfilled[backfilled.length - 1].occurredAt,
      },
    },
    missing: {
      scenes: SCENE_KEYS.filter((key) => !shown(key)),
      trackedFrom: milestones[0]?.localDate ?? null,
      untrackedBeforeTrackedFrom: Boolean(milestones[0] && !milestones[0].localDate.endsWith("-01-01")),
    },
  };
}

// ---------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------

const MILESTONE_KINDS = ["activity", "backfill", "correction"] as const;
const VERIFIED: Verification[] = ["peer_confirmed", "moderator_verified", "system_verified"];

function provenanceLabel(raw: Record<string, unknown> | null | undefined): string | null {
  const value = raw?.source ?? raw?.label ?? raw?.importSource;
  return typeof value === "string" && value ? value : null;
}

async function latestCapsule(db: AppDb, userId: string, year: number, kind: "intent" | "reflection", readUntil: number): Promise<CapsuleNote | null> {
  const [row] = await db
    .select({ body: timeCapsuleEntries.body, visibility: timeCapsuleEntries.visibility, version: timeCapsuleEntries.version })
    .from(timeCapsuleEntries)
    .where(and(
      eq(timeCapsuleEntries.userId, userId),
      eq(timeCapsuleEntries.year, year),
      eq(timeCapsuleEntries.kind, kind),
      lte(timeCapsuleEntries.createdAt, new Date(readUntil))
    ))
    .orderBy(desc(timeCapsuleEntries.version))
    .limit(1);
  return row ?? null;
}

function positionOf(entries: unknown[], userId: string): number | null {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Record<string, unknown> | null;
    if (!entry || entry.userId !== userId) continue;
    const pos = entry.position ?? entry.rank ?? entry.place;
    return typeof pos === "number" && Number.isFinite(pos) ? pos : i + 1;
  }
  return null;
}

/** Best final placements of the year (top 10), latest revision per board and period. */
async function readLeagueHighlights(db: AppDb, userId: string, year: number, readUntil: number): Promise<YearReviewData["leagueHighlights"]> {
  const rows = await db
    .select()
    .from(leagueSnapshots)
    .where(and(
      eq(leagueSnapshots.status, "final"),
      lte(leagueSnapshots.createdAt, new Date(readUntil)),
      or(like(leagueSnapshots.periodKey, `${year}%`), like(leagueSnapshots.periodKey, `S${year}-%`))
    ));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.board}|${row.periodType}|${row.periodKey}`;
    const current = latest.get(key);
    if (!current || row.revision > current.revision) latest.set(key, row);
  }
  const highlights: YearReviewData["leagueHighlights"] = [];
  for (const row of latest.values()) {
    const position = positionOf(Array.isArray(row.entries) ? row.entries : [], userId);
    if (position !== null && position <= 10) highlights.push({ board: row.board, periodType: row.periodType, periodKey: row.periodKey, position });
  }
  return highlights
    .sort((a, b) => a.position - b.position || a.periodKey.localeCompare(b.periodKey) || a.board.localeCompare(b.board))
    .slice(0, 5);
}

/**
 * Verified, non-superseded milestone events of `userId` that occurred in the window and were recorded
 * by `readUntil`. Reversals and corrections only count when recorded by `readUntil` too.
 */
export async function readVerifiedMilestoneEvents(
  db: AppDb,
  where: { userId?: string; occurredFrom: number; occurredUntil: number; readUntil: number }
) {
  const subject = where.userId ? [eq(builderEvents.subjectUserId, where.userId)] : [];
  const events = await db
    .select()
    .from(builderEvents)
    .where(and(
      ...subject,
      gte(builderEvents.occurredAt, new Date(where.occurredFrom)),
      lte(builderEvents.occurredAt, new Date(where.occurredUntil)),
      lte(builderEvents.receivedAt, new Date(where.readUntil)),
      inArray(builderEvents.kind, [...MILESTONE_KINDS]),
      inArray(builderEvents.verification, VERIFIED)
    ));
  const superseding = await db
    .select({ supersedes: builderEvents.supersedesEventId })
    .from(builderEvents)
    .where(and(
      ...subject,
      lte(builderEvents.receivedAt, new Date(where.readUntil)),
      inArray(builderEvents.kind, ["reversal", "correction"])
    ));
  const superseded = new Set(superseding.map((row) => row.supersedes).filter((id): id is string => Boolean(id)));
  return events.filter((event) => !superseded.has(event.id));
}

/** Builds the snapshot data from D1 without writing anything. */
export async function computeYearReview(db: AppDb, userId: string, year: number, now: Date): Promise<YearReviewData> {
  const window = yearWindow(year);
  const { status, cutoffAt, occurredUntil, readUntil } = snapshotCutoff(year, now);
  const events = await readVerifiedMilestoneEvents(db, { userId, occurredFrom: window.start, occurredUntil, readUntil });

  const [ledgerRows, projects, evidenceRows, badgeRows, rankRows, leagueHighlights, intent, reflection, nextYearIntent] = await Promise.all([
    db
      .select({ eventId: scoreLedger.eventId, stage: scoreLedger.stage, rp: scoreLedger.rp })
      .from(scoreLedger)
      .where(and(
        eq(scoreLedger.userId, userId),
        gte(scoreLedger.occurredAt, new Date(window.start)),
        lte(scoreLedger.occurredAt, new Date(occurredUntil)),
        lte(scoreLedger.createdAt, new Date(readUntil))
      )),
    db.select({ id: builderProjects.id, name: builderProjects.name }).from(builderProjects).where(eq(builderProjects.ownerUserId, userId)),
    db
      .select({ id: activityEvidence.id, title: activityEvidence.title, counterpartyUserId: activityEvidence.counterpartyUserId })
      .from(activityEvidence)
      .where(eq(activityEvidence.userId, userId)),
    db
      .select()
      .from(badgeAwards)
      .where(and(eq(badgeAwards.userId, userId), gte(badgeAwards.awardedAt, new Date(window.start)), lte(badgeAwards.awardedAt, new Date(Math.min(occurredUntil, readUntil))))),
    db
      .select()
      .from(rankAwards)
      .where(and(eq(rankAwards.userId, userId), gte(rankAwards.awardedAt, new Date(window.start)), lte(rankAwards.awardedAt, new Date(Math.min(occurredUntil, readUntil))))),
    readLeagueHighlights(db, userId, year, readUntil),
    latestCapsule(db, userId, year, "intent", readUntil),
    latestCapsule(db, userId, year, "reflection", readUntil),
    latestCapsule(db, userId, year + 1, "intent", readUntil),
  ]);

  const rpByEvent = new Map<string, number>();
  for (const row of ledgerRows) rpByEvent.set(row.eventId, (rpByEvent.get(row.eventId) ?? 0) + row.rp);
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));

  const milestones: YearMilestone[] = events.map((event) => {
    const evidence = event.evidenceId ? evidenceById.get(event.evidenceId) : undefined;
    const backfill = event.kind === "backfill" || event.source === "backfill";
    return {
      eventId: event.id,
      eventType: event.eventType,
      stage: event.stage,
      occurredAt: event.occurredAt.getTime(),
      localDate: localDateKey(event.occurredAt),
      projectId: event.projectId,
      projectName: event.projectId ? projectNames.get(event.projectId) ?? null : null,
      title: evidence?.title ?? null,
      visibility: event.visibility,
      verification: event.verification,
      rp: rpByEvent.get(event.id) ?? 0,
      backfill,
      provenanceLabel: backfill ? provenanceLabel(event.provenance) : null,
    };
  });

  // People helped: counterparties of verified peer help, from the event payload or its evidence.
  const helped = new Set<string>();
  for (const event of events) {
    if (event.eventType !== "contribute_peer_help") continue;
    const fromPayload = typeof event.payload?.counterpartyUserId === "string" ? event.payload.counterpartyUserId : null;
    const fromEvidence = event.evidenceId ? evidenceById.get(event.evidenceId)?.counterpartyUserId ?? null : null;
    const peer = fromPayload ?? fromEvidence;
    if (peer && peer !== userId) helped.add(peer);
  }
  const peerMentions: YearReviewData["peerMentions"] = [];
  if (helped.size > 0) {
    const consenting = await db
      .select({ userId: users.id, name: users.name })
      .from(users)
      .innerJoin(builderPrivacy, eq(builderPrivacy.userId, users.id))
      .where(and(inArray(users.id, [...helped]), eq(builderPrivacy.peerMentionsOk, true)));
    peerMentions.push(...consenting.sort((a, b) => (a.userId < b.userId ? -1 : 1)));
  }

  const rulesetVersion = getEffectiveRuleset(new Date(Math.min(cutoffAt, window.end))).version;
  return buildYearReviewData({
    year,
    status,
    cutoffAt,
    rulesetVersion,
    milestones,
    ledger: ledgerRows.map(({ stage, rp }) => ({ stage, rp })),
    badges: badgeRows
      .filter((b) => !b.revokedAt || b.revokedAt.getTime() > readUntil)
      .map((b) => ({ badgeKey: b.badgeKey, seasonKey: b.seasonKey, awardedAt: b.awardedAt.getTime() }))
      .sort((a, b) => a.awardedAt - b.awardedAt || a.badgeKey.localeCompare(b.badgeKey)),
    ranks: rankRows.map((r) => ({ rank: r.rank, awardedAt: r.awardedAt.getTime() })).sort((a, b) => a.awardedAt - b.awardedAt),
    leagueHighlights,
    reflection: { intent, reflection, nextYearIntent },
    peerMentions,
    peopleHelped: helped.size,
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export type YearlySnapshot = typeof yearlySnapshots.$inferSelect;

export async function getLatestYearSnapshot(db: AppDb, userId: string, year: number): Promise<YearlySnapshot | null> {
  const [row] = await db
    .select()
    .from(yearlySnapshots)
    .where(and(eq(yearlySnapshots.userId, userId), eq(yearlySnapshots.year, year)))
    .orderBy(desc(yearlySnapshots.version))
    .limit(1);
  return row ?? null;
}

export async function getYearSnapshotVersion(db: AppDb, userId: string, year: number, version: number): Promise<YearlySnapshot | null> {
  const [row] = await db
    .select()
    .from(yearlySnapshots)
    .where(and(eq(yearlySnapshots.userId, userId), eq(yearlySnapshots.year, year), eq(yearlySnapshots.version, version)))
    .limit(1);
  return row ?? null;
}

export function snapshotData(row: YearlySnapshot): YearReviewData {
  return row.data as unknown as YearReviewData;
}

/**
 * Stores a new snapshot version when the data changed, otherwise returns the latest one. A final
 * snapshot is immutable: once it exists it is always returned as is. Hidden scenes carry over.
 */
export async function ensureYearSnapshot(db: AppDb, userId: string, year: number, now: Date): Promise<{ snapshot: YearlySnapshot; created: boolean }> {
  const latest = await getLatestYearSnapshot(db, userId, year);
  if (latest?.status === "final") return { snapshot: latest, created: false };
  const data = await computeYearReview(db, userId, year, now);
  if (latest && canonicalJson(latest.data) === canonicalJson(data)) return { snapshot: latest, created: false };

  const version = (latest?.version ?? 0) + 1;
  const [inserted] = await db
    .insert(yearlySnapshots)
    .values({
      userId,
      year,
      version,
      status: data.status,
      rulesetVersion: data.rulesetVersion,
      data: data as unknown as Record<string, unknown>,
      provenance: { generator: "year-review", schema: YEAR_REVIEW_SCHEMA, eventHash: data.eventHash, cutoffAt: data.cutoffAt },
      hiddenScenes: latest?.hiddenScenes ?? [],
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { snapshot: inserted, created: true };
  // A concurrent run stored the same version first.
  const concurrent = await getLatestYearSnapshot(db, userId, year);
  if (!concurrent) throw new Error("yearly snapshot insert conflicted but no row was found");
  return { snapshot: concurrent, created: false };
}

/** Scene visibility is a member preference, applied to every stored version of the year. */
export async function setHiddenScenes(db: AppDb, userId: string, year: number, hiddenScenes: string[]): Promise<string[]> {
  const unknown = hiddenScenes.filter((key) => !isSceneKey(key));
  if (unknown.length > 0) throw new BuilderApiError(400, "invalid_scene", "Unknown scene key", { unknown });
  const clean = SCENE_KEYS.filter((key) => hiddenScenes.includes(key));
  const updated = await db
    .update(yearlySnapshots)
    .set({ hiddenScenes: clean })
    .where(and(eq(yearlySnapshots.userId, userId), eq(yearlySnapshots.year, year)))
    .returning({ id: yearlySnapshots.id });
  if (updated.length === 0) throw new BuilderApiError(404, "snapshot_not_found", "No Year in Review for this year yet.");
  return clean;
}

/** Members with at least one verified milestone event in the year, for the finalize job. */
export async function listYearParticipants(db: AppDb, year: number, readUntil: number): Promise<string[]> {
  const window = yearWindow(year);
  const rows = await db
    .selectDistinct({ userId: builderEvents.subjectUserId })
    .from(builderEvents)
    .where(and(
      gte(builderEvents.occurredAt, new Date(window.start)),
      lte(builderEvents.occurredAt, new Date(window.end)),
      lte(builderEvents.receivedAt, new Date(readUntil)),
      inArray(builderEvents.kind, [...MILESTONE_KINDS]),
      inArray(builderEvents.verification, VERIFIED)
    ));
  return rows.map((row) => row.userId).sort();
}
