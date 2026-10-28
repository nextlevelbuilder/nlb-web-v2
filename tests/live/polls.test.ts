import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { liveVotes } from "@/lib/db/schema";
import { castVote, createRound, deriveRoundStatus } from "@/lib/live/polls";
import { finalizeRound, overrideRoundWinner, rankTallies } from "@/lib/live/poll-tallies";
import { getPollRoundBySlug } from "@/lib/live/poll-read-models";
import { createRateLimiter } from "@/lib/builder-league/http";
import { HOUR, nextSeq, seedTopics, seedUser } from "./live-fixtures";

const unlimited = createRateLimiter({ limit: 10_000, windowMs: 60_000 });
const T0 = Date.UTC(2031, 0, 5, 2, 0);
const at = (h: number) => new Date(T0 + h * HOUR);

async function seedRound(topicCount = 3) {
  const topicIds = await seedTopics(topicCount);
  const n = nextSeq();
  // Each round gets its own week so windows never overlap across tests.
  const opensAt = new Date(T0 + n * 30 * 24 * HOUR);
  const round = await createRound(
    { slug: `round-${n}`, titleEn: "Week", titleVi: "Tuần", opensAt, closesAt: new Date(opensAt.getTime() + 168 * HOUR), topicIds, createdBy: "op" },
    getDb()
  );
  const rel = (h: number) => new Date(opensAt.getTime() + h * HOUR);
  return { round, topicIds, rel };
}

const vote = (roundId: string, userId: string, topicId: string, now: Date) =>
  castVote({ roundId, userId, topicId, now }, getDb(), unlimited);

describe("voting rounds", () => {
  it("derives status from the clock", async () => {
    const { round, rel } = await seedRound();
    expect(deriveRoundStatus(round, rel(-1))).toBe("scheduled");
    expect(deriveRoundStatus(round, rel(0))).toBe("open");
    expect(deriveRoundStatus(round, rel(168))).toBe("closed");
    expect(deriveRoundStatus({ ...round, status: "finalized" }, rel(1))).toBe("finalized");
  });

  it("refuses overlapping windows and topics that are not active", async () => {
    const { round, topicIds } = await seedRound();
    await expect(
      createRound(
        { slug: `overlap-${nextSeq()}`, titleEn: "x", titleVi: "x", opensAt: round.opensAt, closesAt: round.closesAt, topicIds, createdBy: "op" },
        getDb()
      )
    ).rejects.toMatchObject({ code: "round_overlap" });
    await expect(
      createRound({ slug: `bad-${nextSeq()}`, titleEn: "x", titleVi: "x", opensAt: at(-100), closesAt: at(-99), topicIds: ["nope"], createdBy: "op" }, getDb())
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("keeps one vote per user, allows changes before close and refuses after", async () => {
    const { round, topicIds, rel } = await seedRound();
    const user = await seedUser("voter");
    await expect(vote(round.id, user.id, topicIds[0], rel(-1))).rejects.toMatchObject({ code: "round_not_open" });

    const first = await vote(round.id, user.id, topicIds[0], rel(1));
    expect(first).toMatchObject({ topicId: topicIds[0], changed: true });
    const same = await vote(round.id, user.id, topicIds[0], rel(2));
    expect(same).toMatchObject({ changed: false });
    expect(same.votedAt.getTime()).toBe(rel(1).getTime());
    const changed = await vote(round.id, user.id, topicIds[1], rel(3));
    expect(changed).toMatchObject({ topicId: topicIds[1], changed: true });

    const rows = await getDb().select().from(liveVotes).where(and(eq(liveVotes.roundId, round.id), eq(liveVotes.userId, user.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].topicId).toBe(topicIds[1]);

    await expect(vote(round.id, user.id, topicIds[2], rel(168))).rejects.toMatchObject({ code: "round_not_open" });
    const [after] = await getDb().select().from(liveVotes).where(and(eq(liveVotes.roundId, round.id), eq(liveVotes.userId, user.id)));
    expect(after.topicId).toBe(topicIds[1]);
  });

  it("refuses a topic that is not in the round", async () => {
    const { round, rel } = await seedRound();
    const [outside] = await seedTopics(1);
    const user = await seedUser("voter");
    await expect(vote(round.id, user.id, outside, rel(1))).rejects.toMatchObject({ code: "topic_not_in_round" });
  });

  it("rate limits a single user", async () => {
    const { round, topicIds, rel } = await seedRound();
    const user = await seedUser("spam");
    const tight = createRateLimiter({ limit: 2, windowMs: 60_000 });
    await castVote({ roundId: round.id, userId: user.id, topicId: topicIds[0], now: rel(1) }, getDb(), tight);
    await castVote({ roundId: round.id, userId: user.id, topicId: topicIds[1], now: rel(1) }, getDb(), tight);
    await expect(
      castVote({ roundId: round.id, userId: user.id, topicId: topicIds[2], now: rel(1) }, getDb(), tight)
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("tallies and finalization", () => {
  it("ranks by votes, then earliest current vote, then topic id", () => {
    const ranked = rankTallies([
      { topicId: "c", votes: 2, firstVoteAt: 50 },
      { topicId: "b", votes: 2, firstVoteAt: 10 },
      { topicId: "a", votes: 0, firstVoteAt: null },
      { topicId: "e", votes: 3, firstVoteAt: 99 },
      { topicId: "d", votes: 2, firstVoteAt: 10 },
      { topicId: "0", votes: 0, firstVoteAt: null },
    ]);
    expect(ranked.map((t) => t.topicId)).toEqual(["e", "b", "d", "c", "0", "a"]);
    // Deterministic for any input order.
    expect(rankTallies([...ranked].reverse()).map((t) => t.topicId)).toEqual(ranked.map((t) => t.topicId));
  });

  it("hides tallies while open, then freezes the snapshot once", async () => {
    const { round, topicIds, rel } = await seedRound();
    const [u1, u2, u3] = [await seedUser("v"), await seedUser("v"), await seedUser("v")];
    await vote(round.id, u1.id, topicIds[1], rel(1));
    await vote(round.id, u2.id, topicIds[2], rel(2));
    await vote(round.id, u3.id, topicIds[1], rel(3));

    const open = await getPollRoundBySlug(getDb(), round.slug, rel(4), u1.id);
    expect(open).toMatchObject({ status: "open", talliesVisible: false, tallies: null, myVoteTopicId: topicIds[1] });

    await expect(finalizeRound(round.id, getDb(), rel(10))).rejects.toMatchObject({ code: "round_not_closed" });
    const first = await finalizeRound(round.id, getDb(), rel(170));
    expect(first.alreadyFinalized).toBe(false);
    expect(first.winnerTopicId).toBe(topicIds[1]);
    expect(first.snapshot.totalVotes).toBe(3);
    expect(first.snapshot.tallies.map((t) => t.topicId)).toEqual([topicIds[1], topicIds[2], topicIds[0]]);

    const second = await finalizeRound(round.id, getDb(), rel(200));
    expect(second.alreadyFinalized).toBe(true);
    expect(second.snapshot).toEqual(first.snapshot);

    const view = await getPollRoundBySlug(getDb(), round.slug, rel(201), null);
    expect(view).toMatchObject({ status: "finalized", talliesVisible: true, winnerTopicId: topicIds[1], totalVotes: 3 });
  });

  it("records an override beside the frozen snapshot", async () => {
    const { round, topicIds, rel } = await seedRound();
    const user = await seedUser("v");
    await vote(round.id, user.id, topicIds[0], rel(1));
    await expect(
      overrideRoundWinner({ roundId: round.id, topicId: topicIds[2], reason: "Host unavailable", approvalId: "appr-1" }, getDb())
    ).rejects.toMatchObject({ code: "round_not_finalized" });
    const { snapshot } = await finalizeRound(round.id, getDb(), rel(169));
    const overridden = await overrideRoundWinner(
      { roundId: round.id, topicId: topicIds[2], reason: "Host unavailable", approvalId: "appr-1" },
      getDb()
    );
    expect(overridden).toMatchObject({ winnerTopicId: topicIds[2], overrideReason: "Host unavailable", overrideApprovalId: "appr-1" });
    expect(overridden.resultSnapshot).toEqual(snapshot);
  });
});
