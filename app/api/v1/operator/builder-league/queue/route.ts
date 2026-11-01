import { ok, parseCursor, parseLimit } from "@/lib/builder-league/http";
import { toEvidenceDto } from "@/lib/builder-league/evidence";
import { QueueQuerySchema, listModerationQueue } from "@/lib/builder-league/moderation";
import { listOpenAppeals, toAppealDto } from "@/lib/builder-league/appeals";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

/**
 * Evidence moderation queue, oldest first: `status` (default submitted), `stage`, `eventType`,
 * `olderThanHours`, keyset `cursor`. `?view=appeals` lists open appeals instead.
 */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.queue.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const appeals = query.get("view") === "appeals";
      const filters = QueueQuerySchema.parse({
        status: query.get("status") || undefined,
        stage: query.get("stage") || undefined,
        eventType: query.get("eventType") || undefined,
        olderThanHours: query.get("olderThanHours") || undefined,
      });
      const limit = parseLimit(query.get("limit"));
      return { resource: operatorDomainResource("builder_league"), args: { appeals, ...filters, limit }, appeals, filters, limit, cursor: parseCursor(query.get("cursor")) };
    },
    run: async ({ db }, { appeals, filters, limit, cursor }) => {
      if (appeals) {
        const rows = await listOpenAppeals(db, limit);
        return ok(
          rows.map((row) => ({ appeal: toAppealDto(row.appeal), evidence: toEvidenceDto(row.evidence, "admin"), appellantName: row.appellantName })),
          { nextCursor: null, limit }
        );
      }
      const page = await listModerationQueue(db, { ...filters, limit, cursor });
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
    },
  });
}
