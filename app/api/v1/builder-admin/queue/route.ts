import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { ok, parseCursor, parseLimit, withBuilderErrors } from "@/lib/builder-league/http";
import { toEvidenceDto } from "@/lib/builder-league/evidence";
import { QueueQuerySchema, listModerationQueue } from "@/lib/builder-league/moderation";
import { listOpenAppeals, toAppealDto } from "@/lib/builder-league/appeals";

export const dynamic = "force-dynamic";

/**
 * Admin moderation queue, oldest first. `view=appeals` lists open appeals instead.
 * Filters: `status` (default submitted), `stage`, `eventType`, `olderThanHours`; keyset `cursor`.
 */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireBuilderLeagueAdmin(request, db);
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    if (url.searchParams.get("view") === "appeals") {
      const rows = await listOpenAppeals(db, limit);
      return ok(
        rows.map((row) => ({ appeal: toAppealDto(row.appeal), evidence: toEvidenceDto(row.evidence, "admin"), appellantName: row.appellantName })),
        { nextCursor: null, limit }
      );
    }
    const query = QueueQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      stage: url.searchParams.get("stage") || undefined,
      eventType: url.searchParams.get("eventType") || undefined,
      olderThanHours: url.searchParams.get("olderThanHours") || undefined,
    });
    const page = await listModerationQueue(db, { ...query, limit, cursor: parseCursor(url.searchParams.get("cursor")) });
    return ok(
      page.items.map((item) => ({
        evidence: toEvidenceDto(item.evidence, "admin"),
        submitterName: item.submitterName,
        projectName: item.projectName,
        rulesetVersion: item.rulesetVersion,
        rp: item.rp,
        requiredVerification: item.requiredVerification,
        awaitingCounterparty: item.awaitingCounterparty,
      })),
      { nextCursor: page.nextCursor, limit: page.limit }
    );
  });
}
