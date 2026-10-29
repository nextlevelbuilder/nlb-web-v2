import { ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { finalizeRound } from "@/lib/live/poll-tallies";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Freeze the result of a closed round once; later calls return the stored snapshot. */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.round.finalize",
    prepare: async () => {
      const roundId = requirePathParam((await params).id, "id");
      return { resource: resourceKey({ kind: "live_poll", roundId }), args: { roundId }, roundId };
    },
    run: async ({ db, now }, { roundId }) => ok({ roundId, ...(await finalizeRound(roundId, db, now)) }),
  });
}
