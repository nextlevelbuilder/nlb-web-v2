import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { livePollRounds, livePollRoundTopics, liveTopics } from "@/lib/db/schema";
import type { LivePollRoundStatus } from "./types";
import { deriveRoundStatus, getMyVote, type LivePollRound } from "./polls";
import { computeRoundTallies, type LivePollTally } from "./poll-tallies";

/**
 * Public voting view. Tally policy: while a round is open (or not yet open) counts are hidden, so
 * early votes do not steer later ones (no bandwagoning); after close the live counts are shown, and
 * once finalized the frozen snapshot is shown. The viewer always sees their own choice.
 */
export interface LivePollTopicView {
  id: string;
  slug: string;
  titleEn: string;
  titleVi: string;
  summaryEn: string;
  summaryVi: string;
}

export interface LivePollRoundView {
  id: string;
  slug: string;
  titleEn: string;
  titleVi: string;
  opensAt: Date;
  closesAt: Date;
  timezone: string;
  status: LivePollRoundStatus;
  topics: LivePollTopicView[];
  talliesVisible: boolean;
  /** Ranked; null while hidden. */
  tallies: LivePollTally[] | null;
  totalVotes: number | null;
  /** Set once finalized (an approved override replaces the counted winner). */
  winnerTopicId: string | null;
  myVoteTopicId: string | null;
}

/**
 * The round to show on the public page: the open round if any, else the next scheduled one, else
 * the most recently closed one. Null when no round exists.
 */
export async function getCurrentPollRound(db: AppDb, now: Date, viewerUserId?: string | null): Promise<LivePollRoundView | null> {
  const [open] = await db
    .select()
    .from(livePollRounds)
    .where(and(lte(livePollRounds.opensAt, now), gt(livePollRounds.closesAt, now)))
    .orderBy(asc(livePollRounds.closesAt))
    .limit(1);
  const [next] = open
    ? [open]
    : await db.select().from(livePollRounds).where(gt(livePollRounds.opensAt, now)).orderBy(asc(livePollRounds.opensAt)).limit(1);
  const [latest] = next
    ? [next]
    : await db.select().from(livePollRounds).where(lte(livePollRounds.closesAt, now)).orderBy(desc(livePollRounds.closesAt)).limit(1);
  return latest ? buildRoundView(db, latest, now, viewerUserId) : null;
}

export async function getPollRoundBySlug(
  db: AppDb,
  slug: string,
  now: Date,
  viewerUserId?: string | null
): Promise<LivePollRoundView | null> {
  const [round] = await db.select().from(livePollRounds).where(eq(livePollRounds.slug, slug)).limit(1);
  return round ? buildRoundView(db, round, now, viewerUserId) : null;
}

/** Past rounds (closed or finalized), newest first, with their visible results. */
export async function listPastPollRounds(db: AppDb, now: Date, limit = 10): Promise<LivePollRoundView[]> {
  const rounds = await db
    .select()
    .from(livePollRounds)
    .where(lte(livePollRounds.closesAt, now))
    .orderBy(desc(livePollRounds.closesAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return Promise.all(rounds.map((round) => buildRoundView(db, round, now, null)));
}

async function buildRoundView(
  db: AppDb,
  round: LivePollRound,
  now: Date,
  viewerUserId?: string | null
): Promise<LivePollRoundView> {
  const status = deriveRoundStatus(round, now);
  const topics = await db
    .select({
      id: liveTopics.id,
      slug: liveTopics.slug,
      titleEn: liveTopics.titleEn,
      titleVi: liveTopics.titleVi,
      summaryEn: liveTopics.summaryEn,
      summaryVi: liveTopics.summaryVi,
    })
    .from(livePollRoundTopics)
    .innerJoin(liveTopics, eq(liveTopics.id, livePollRoundTopics.topicId))
    .where(eq(livePollRoundTopics.roundId, round.id))
    .orderBy(asc(livePollRoundTopics.sortOrder));

  let tallies: LivePollTally[] | null = null;
  if (status === "finalized" && round.resultSnapshot) tallies = round.resultSnapshot.tallies;
  else if (status === "closed") tallies = await computeRoundTallies(db, round.id, now);

  const myVote = viewerUserId ? await getMyVote(db, round.id, viewerUserId) : null;
  return {
    id: round.id,
    slug: round.slug,
    titleEn: round.titleEn,
    titleVi: round.titleVi,
    opensAt: round.opensAt,
    closesAt: round.closesAt,
    timezone: round.timezone,
    status,
    topics,
    talliesVisible: tallies !== null,
    tallies,
    totalVotes: tallies ? tallies.reduce((sum, t) => sum + t.votes, 0) : null,
    winnerTopicId: status === "finalized" ? round.winnerTopicId : null,
    myVoteTopicId: myVote?.topicId ?? null,
  };
}
