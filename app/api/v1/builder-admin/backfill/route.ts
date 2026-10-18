import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { ok } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { runBackfill } from "@/lib/builder-league/backfill";

export const dynamic = "force-dynamic";

/**
 * Opt-in backfill of directory launches already in D1. Dry run unless the body says `dryRun: false`.
 * `userIds` limits the run; by default every member who opted in is processed. Idempotent.
 */
export async function POST(request: Request) {
  return handleWrite(
    request,
    "/studio/builder-league",
    () => requireBuilderLeagueAdmin(request, getDb()),
    async (input, { caller, actorRole }) => {
      const report = await runBackfill(getDb(), input.body, { actorId: caller.user.id, actorRole });
      return {
        response: ok(report),
        notice: report.dryRun ? `backfill_dry_run_${report.totals.planned}` : `backfill_done_${report.totals.created}`,
      };
    }
  );
}
