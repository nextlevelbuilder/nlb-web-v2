import { ok, parseLimit } from "@/lib/builder-league/http";
import { getLiveFunnelMetrics } from "@/lib/live/live-funnel-metrics";
import { LIVE_OPERATOR_RESOURCE, runOperatorRoute } from "@/lib/live/http/live-operator-route";

export const dynamic = "force-dynamic";

/** Funnel aggregates: voters per round, holds, tickets by status and attendees per event. Counts only. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.metrics.read",
    prepare: async () => {
      const limit = parseLimit(new URL(request.url).searchParams.get("limit"), 20, 100);
      return { resource: LIVE_OPERATOR_RESOURCE, args: { limit }, limit };
    },
    run: async ({ db, now }, { limit }) => ok(await getLiveFunnelMetrics(db, now, limit)),
  });
}
