import { ok } from "@/lib/builder-league/http";
import { runLiveSweeps } from "@/lib/live/live-cron";
import { LIVE_OPERATOR_RESOURCE, runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { getLiveMeetingProvider } from "@/lib/live/http/live-external-clients";

export const dynamic = "force-dynamic";

/**
 * Run the Live housekeeping sweep now (the cron runs it every minute): return expired seat holds to the
 * pool and cancel provider registrants of revoked tickets. Idempotent.
 */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.sweep.run",
    prepare: async () => ({ resource: LIVE_OPERATOR_RESOURCE, args: {} }),
    run: async ({ db, now }) => ok(await runLiveSweeps(db, now, getLiveMeetingProvider())),
  });
}
