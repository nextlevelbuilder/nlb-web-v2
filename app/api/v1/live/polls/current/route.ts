import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { getCurrentPollRound } from "@/lib/live/poll-read-models";
import { getMyVote } from "@/lib/live/polls";
import { withLiveErrors } from "@/lib/live/http/live-http-errors";
import { assertLiveEnabled, memberDelegationScope, resolveLiveSubject } from "@/lib/live/http/live-request-context";
import { checkAccess } from "@/lib/live/http/live-member-access";

export const dynamic = "force-dynamic";

/**
 * The round to show: the open one, else the next scheduled, else the latest closed (null when none).
 * Counts stay hidden while a round is open. A signed-in caller sees their own choice
 * (`myVoteTopicId`, only when `authorize()` lets them vote) and `viewer.canVote` says whether a vote
 * would be accepted by the policy (the round must also be open).
 */
export async function GET(request: Request) {
  return withLiveErrors(async () => {
    assertLiveEnabled();
    const db = getDb();
    const now = new Date();
    const { subject } = await resolveLiveSubject(request, db, memberDelegationScope(request));
    const round = await getCurrentPollRound(db, now, null);
    if (!round) return ok(null);

    const decision = await checkAccess(db, subject, "vote", { kind: "live_poll", roundId: round.id }, now);
    const myVote = decision.allow && subject.userId ? await getMyVote(db, round.id, subject.userId) : null;
    return ok({
      ...round,
      myVoteTopicId: myVote?.topicId ?? null,
      viewer: {
        signedIn: subject.userId !== null,
        canVote: decision.allow && round.status === "open",
        reason: decision.allow ? null : decision.reason,
      },
    });
  });
}
