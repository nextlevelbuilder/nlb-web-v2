import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { livePollRounds, livePollRoundTopics, liveVotes, users, type LivePollResultSnapshot } from "@/lib/db/schema";
import { LiveError, liveInvalid, liveNotFound } from "./live-errors";
import { deriveRoundStatus, type LivePollRound } from "./polls";

/**
 * Tallies, finalization and the approved winner override. Ranking (ADR "Live voting"): votes
 * descending, then the topic whose earliest current vote is earliest, then topic id ascending —
 * deterministic for any data.
 */
export type LivePollTally = LivePollResultSnapshot["tallies"][number];

export function rankTallies(tallies: readonly LivePollTally[]): LivePollTally[] {
  return [...tallies].sort((a, b) => {
    if (a.votes !== b.votes) return b.votes - a.votes;
    const af = a.firstVoteAt ?? Number.POSITIVE_INFINITY;
    const bf = b.firstVoteAt ?? Number.POSITIVE_INFINITY;
    if (af !== bf) return af - bf;
    return a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : 0;
  });
}

/**
 * Live counts for every topic in the round (zero-vote topics included), ranked. Votes of accounts that
 * are banned at `now` (ban not expired) are not counted, so the frozen snapshot never includes them.
 */
export async function computeRoundTallies(db: AppDb, roundId: string, now: Date = new Date()): Promise<LivePollTally[]> {
  const topics = await db
    .select({ topicId: livePollRoundTopics.topicId })
    .from(livePollRoundTopics)
    .where(eq(livePollRoundTopics.roundId, roundId))
    .orderBy(asc(livePollRoundTopics.sortOrder));
  const counts = await db
    .select({
      topicId: liveVotes.topicId,
      votes: sql<number>`count(*)`,
      firstVoteAt: sql<number>`min(${liveVotes.updatedAt})`,
    })
    .from(liveVotes)
    .where(
      and(
        eq(liveVotes.roundId, roundId),
        sql`not exists (
          select 1 from ${users} where ${users.id} = ${liveVotes.userId} and ${users.banned} = 1
            and (${users.banExpires} is null or ${users.banExpires} > ${now.getTime()})
        )`
      )
    )
    .groupBy(liveVotes.topicId);
  const byTopic = new Map(counts.map((c) => [c.topicId, c]));
  return rankTallies(
    topics.map(({ topicId }) => {
      const c = byTopic.get(topicId);
      return { topicId, votes: c ? Number(c.votes) : 0, firstVoteAt: c ? Number(c.firstVoteAt) : null };
    })
  );
}

export function buildSnapshot(tallies: LivePollTally[], now: Date): LivePollResultSnapshot {
  return {
    tallies,
    totalVotes: tallies.reduce((sum, t) => sum + t.votes, 0),
    tieBreak: "earliest_current_vote_then_topic_id",
    computedAt: now.getTime(),
  };
}

export interface FinalizeResult {
  snapshot: LivePollResultSnapshot;
  winnerTopicId: string | null;
  /** True when the round had already been finalized and nothing changed. */
  alreadyFinalized: boolean;
}

/**
 * Freeze the result of a closed round once. The conditional UPDATE (`status != 'finalized'`) lets
 * exactly one caller write the snapshot; any later or concurrent call returns the stored one. A round
 * without votes is finalized with no winner.
 */
export async function finalizeRound(roundId: string, db: AppDb, now: Date = new Date()): Promise<FinalizeResult> {
  const round = await loadRound(db, roundId);
  if (round.status === "finalized") return storedResult(round);
  if (deriveRoundStatus(round, now) !== "closed") {
    throw new LiveError(409, "round_not_closed", "A round can only be finalized after it closes");
  }
  const tallies = await computeRoundTallies(db, roundId, now);
  const snapshot = buildSnapshot(tallies, now);
  const winnerTopicId = tallies[0] && tallies[0].votes > 0 ? tallies[0].topicId : null;
  const [written] = await db
    .update(livePollRounds)
    .set({ status: "finalized", resultSnapshot: snapshot, winnerTopicId, finalizedAt: now, updatedAt: now })
    .where(and(eq(livePollRounds.id, roundId), ne(livePollRounds.status, "finalized")))
    .returning();
  if (written) return { snapshot, winnerTopicId, alreadyFinalized: false };
  return storedResult(await loadRound(db, roundId));
}

export interface OverrideWinnerInput {
  roundId: string;
  topicId: string;
  reason: string;
  /** The consumed `operator_approvals` id; the caller enforces and audits the approval. */
  approvalId: string;
}

/**
 * Replace the winner of a finalized round. The snapshot (the counted result) is never changed; the
 * override is recorded beside it with its reason and approval.
 */
export async function overrideRoundWinner(input: OverrideWinnerInput, db: AppDb, now: Date = new Date()): Promise<LivePollRound> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 500) throw liveInvalid("reason is required (max 500 characters)");
  if (!input.approvalId) throw liveInvalid("approvalId is required");
  const round = await loadRound(db, input.roundId);
  if (round.status !== "finalized") throw new LiveError(409, "round_not_finalized", "Only a finalized round can be overridden");
  const [inRound] = await db
    .select({ topicId: livePollRoundTopics.topicId })
    .from(livePollRoundTopics)
    .where(and(eq(livePollRoundTopics.roundId, input.roundId), eq(livePollRoundTopics.topicId, input.topicId)))
    .limit(1);
  if (!inRound) throw new LiveError(422, "topic_not_in_round", "This topic is not part of the round");
  const [row] = await db
    .update(livePollRounds)
    .set({ winnerTopicId: input.topicId, overrideReason: reason, overrideApprovalId: input.approvalId, updatedAt: now })
    .where(and(eq(livePollRounds.id, input.roundId), eq(livePollRounds.status, "finalized")))
    .returning();
  if (!row) throw new LiveError(409, "round_not_finalized", "Only a finalized round can be overridden");
  return row;
}

async function loadRound(db: AppDb, roundId: string): Promise<LivePollRound> {
  const [round] = await db.select().from(livePollRounds).where(eq(livePollRounds.id, roundId)).limit(1);
  if (!round) throw liveNotFound("Round");
  return round;
}

function storedResult(round: LivePollRound): FinalizeResult {
  if (!round.resultSnapshot) throw new LiveError(409, "conflict", "Finalized round has no snapshot");
  return { snapshot: round.resultSnapshot, winnerTopicId: round.winnerTopicId, alreadyFinalized: true };
}
