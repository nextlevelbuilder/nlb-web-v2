import { ok, parseCursor, parseLimit } from "@/lib/builder-league/http";
import { LIVE_OPERATOR_RESOURCE, runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { listAuditPage } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

/**
 * Operator audit trail, newest first (`?resource=` exact resource string, `?cursor=`, `?limit=` max 100).
 * Rows hold actor ids, actions, decisions and argument hashes; no member personal data.
 */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.audit.read",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const resource = query.get("resource")?.trim().slice(0, 300) || null;
      const cursor = parseCursor(query.get("cursor"));
      const limit = parseLimit(query.get("limit"), 50, 100);
      return { resource: LIVE_OPERATOR_RESOURCE, args: { resource, limit }, filter: { resource, cursor, limit } };
    },
    run: async ({ db }, { filter }) => {
      const page = await listAuditPage(db, filter);
      return ok(page.items, page.pagination);
    },
  });
}
