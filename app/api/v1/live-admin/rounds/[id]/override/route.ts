import { ok } from "@/lib/builder-league/http";
import { overrideRoundWinner } from "@/lib/live/poll-tallies";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { roundOverrideSchema } from "@/lib/live/http/live-operator-schemas";
import { overrideTarget } from "@/lib/live/http/live-sensitive-targets";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Replace the winner of a finalized round (sensitive `live.poll.override`). Needs an approval requested
 * by this operator for `{ action: "live.poll.override", target: { roundId, topicId } }` and approved by a
 * different operator; it is consumed once. The counted snapshot is never changed.
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.poll.override",
    prepare: async () => {
      const roundId = requirePathParam((await params).id, "id");
      const input = roundOverrideSchema.parse((await readJsonObject(request)).body);
      const target = overrideTarget(roundId, input.topicId);
      return { ...target, approvalId: input.approvalId, details: { topicId: input.topicId }, roundId, input };
    },
    run: async ({ db, now }, { roundId, input }, grant) =>
      ok(await overrideRoundWinner({ roundId, topicId: input.topicId, reason: input.reason, approvalId: grant.approvalId as string }, db, now)),
  });
}
