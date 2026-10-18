import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { SnapshotNotDueError, finalizeDuePeriods, finalizePeriod } from "@/lib/builder-league/snapshots";
import { PERIOD_TYPES } from "@/lib/builder-league/types";
import { periodRange } from "@/lib/builder-league/time-windows";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ periodType: z.enum(PERIOD_TYPES), periodKey: z.string().min(1).max(16) })
  .strict()
  .partial()
  .refine((body) => (body.periodType === undefined) === (body.periodKey === undefined), {
    message: "periodType and periodKey go together",
  });

// POST /api/v1/builder-admin/snapshots/finalize - finalize one period's boards, or every due period
// when the body is empty. Final snapshots are immutable; changes after finalization append revisions.
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-admin-snapshots");
    const text = await request.text();
    let raw: unknown = {};
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch {
        throw new BuilderApiError(400, "invalid_json", "Body must be JSON.");
      }
    }
    const body = bodySchema.parse(raw);
    if (!body.periodType || !body.periodKey) return ok(await finalizeDuePeriods(db));

    try {
      periodRange(body.periodType, body.periodKey);
    } catch {
      throw new BuilderApiError(400, "invalid_period_key", "Invalid period key.");
    }
    try {
      const results = await finalizePeriod(db, body.periodType, body.periodKey);
      return ok({
        periodType: body.periodType,
        periodKey: body.periodKey,
        snapshots: results.map(({ snapshot, write }) => ({
          board: snapshot.board,
          id: snapshot.id,
          revision: snapshot.revision,
          status: snapshot.status,
          eventHash: snapshot.eventHash,
          supersedesId: snapshot.supersedesId,
          write,
        })),
      });
    } catch (err) {
      if (err instanceof SnapshotNotDueError) throw new BuilderApiError(409, "period_not_due", err.message);
      throw err;
    }
  });
}
