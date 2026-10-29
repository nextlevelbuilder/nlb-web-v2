import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { livePollRounds, livePollRoundTopics, liveTopics, liveVotes } from "@/lib/db/schema";
import { createRateLimiter, type RateLimiter } from "@/lib/builder-league/http";
import type { LivePollRoundStatus } from "./types";
import { LIVE_TIMEZONE } from "./types";
import { LiveError, liveInvalid, liveNotFound } from "./live-errors";
import { requireDate, requireSlug, requireText, withUniqueConflict } from "./live-validation";

/**
 * Weekly voting rounds and votes. A round is open for `opens_at <= now < closes_at`; `finalized`
 * (set by `finalizeRound`) is terminal. One current vote per account per round: the primary key
 * `(round_id, user_id)` plus an upsert means a changed vote rewrites the row, never adds one.
 */
export type LivePollRound = typeof livePollRounds.$inferSelect;

export function deriveRoundStatus(
  round: Pick<LivePollRound, "status" | "opensAt" | "closesAt">,
  now: Date
): LivePollRoundStatus {
  if (round.status === "finalized") return "finalized";
  if (now.getTime() < round.opensAt.getTime()) return "scheduled";
  if (now.getTime() < round.closesAt.getTime()) return "open";
  return "closed";
}

export interface CreateRoundInput {
  slug: string;
  titleEn: string;
  titleVi: string;
  opensAt: Date;
  closesAt: Date;
  topicIds: string[];
  createdBy: string;
  timezone?: string;
}

/**
 * Create a round with its topic list in one batch. Windows may not overlap another round, so
 * "the current round" always has one answer. Every topic must exist and be active.
 */
export async function createRound(input: CreateRoundInput, db: AppDb): Promise<LivePollRound> {
  const opensAt = requireDate(input.opensAt, "opensAt");
  const closesAt = requireDate(input.closesAt, "closesAt");
  if (closesAt.getTime() <= opensAt.getTime()) throw liveInvalid("closesAt must be after opensAt");
  const topicIds = Array.isArray(input.topicIds) ? [...new Set(input.topicIds)] : [];
  if (topicIds.length < 1 || topicIds.length > 50) throw liveInvalid("A round needs between 1 and 50 distinct topics");

  const topics = await db
    .select({ id: liveTopics.id })
    .from(liveTopics)
    .where(and(inArray(liveTopics.id, topicIds), eq(liveTopics.status, "active")));
  if (topics.length !== topicIds.length) throw liveInvalid("Every topic must exist and be active");

  const [overlap] = await db
    .select({ id: livePollRounds.id })
    .from(livePollRounds)
    .where(and(lt(livePollRounds.opensAt, closesAt), gt(livePollRounds.closesAt, opensAt)))
    .limit(1);
  if (overlap) throw new LiveError(409, "round_overlap", "Another round overlaps this window");

  const id = crypto.randomUUID();
  const values = {
    id,
    slug: requireSlug(input.slug),
    titleEn: requireText(input.titleEn, "titleEn"),
    titleVi: requireText(input.titleVi, "titleVi"),
    opensAt,
    closesAt,
    timezone: input.timezone ?? LIVE_TIMEZONE,
    createdBy: requireText(input.createdBy, "createdBy"),
  };
  await withUniqueConflict("Round", () =>
    db.batch([
      db.insert(livePollRounds).values(values),
      db.insert(livePollRoundTopics).values(topicIds.map((topicId, sortOrder) => ({ roundId: id, topicId, sortOrder }))),
    ])
  );
  const [row] = await db.select().from(livePollRounds).where(eq(livePollRounds.id, id)).limit(1);
  return row;
}

/** Per-isolate guard against vote spam (the ADR's per-user rate limit). */
const defaultVoteLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export interface CastVoteInput {
  roundId: string;
  userId: string;
  topicId: string;
  now: Date;
}

export interface CastVoteResult {
  roundId: string;
  topicId: string;
  /** When the current choice was made; unchanged when the user re-submits the same topic. */
  votedAt: Date;
  changed: boolean;
}

/**
 * Record or change the caller's vote. The write itself re-checks the window in SQL, so a vote that
 * races the close is refused rather than counted after it. Re-voting the same topic keeps the
 * original time, which the tie-break ("earliest current vote") relies on.
 */
export async function castVote(
  input: CastVoteInput,
  db: AppDb,
  limiter: RateLimiter = defaultVoteLimiter
): Promise<CastVoteResult> {
  const { roundId, userId, topicId, now } = input;
  if (!userId || !topicId || !roundId) throw liveInvalid("roundId, userId and topicId are required");
  if (!limiter.check(`live-vote:${userId}`)) {
    throw new LiveError(429, "rate_limited", "Too many votes. Please wait a minute and try again.");
  }

  const [round] = await db.select().from(livePollRounds).where(eq(livePollRounds.id, roundId)).limit(1);
  if (!round) throw liveNotFound("Round");
  if (deriveRoundStatus(round, now) !== "open") throw new LiveError(409, "round_not_open", "Voting is not open for this round");

  const [inRound] = await db
    .select({ topicId: livePollRoundTopics.topicId })
    .from(livePollRoundTopics)
    .where(and(eq(livePollRoundTopics.roundId, roundId), eq(livePollRoundTopics.topicId, topicId)))
    .limit(1);
  if (!inRound) throw new LiveError(422, "topic_not_in_round", "This topic is not part of the round");

  const at = now.getTime();
  const result = await db.run(sql`
    INSERT INTO live_votes (round_id, user_id, topic_id, created_at, updated_at)
    SELECT ${roundId}, ${userId}, ${topicId}, ${at}, ${at}
    WHERE EXISTS (
      SELECT 1 FROM live_poll_rounds
      WHERE id = ${roundId} AND status != 'finalized' AND opens_at <= ${at} AND closes_at > ${at}
    )
    ON CONFLICT (round_id, user_id) DO UPDATE SET topic_id = excluded.topic_id, updated_at = excluded.updated_at
    WHERE live_votes.topic_id != excluded.topic_id`);

  const [vote] = await db
    .select()
    .from(liveVotes)
    .where(and(eq(liveVotes.roundId, roundId), eq(liveVotes.userId, userId)))
    .limit(1);
  if (result.meta.changes === 1 && vote) return { roundId, topicId: vote.topicId, votedAt: vote.updatedAt, changed: true };
  // No row changed: either the same topic was re-submitted, or the round closed in between.
  if (vote && vote.topicId === topicId) return { roundId, topicId, votedAt: vote.updatedAt, changed: false };
  throw new LiveError(409, "round_not_open", "Voting is not open for this round");
}

/** The caller's current choice in a round, or null. */
export async function getMyVote(db: AppDb, roundId: string, userId: string): Promise<{ topicId: string; votedAt: Date } | null> {
  const [vote] = await db
    .select({ topicId: liveVotes.topicId, votedAt: liveVotes.updatedAt })
    .from(liveVotes)
    .where(and(eq(liveVotes.roundId, roundId), eq(liveVotes.userId, userId)))
    .limit(1);
  return vote ?? null;
}
