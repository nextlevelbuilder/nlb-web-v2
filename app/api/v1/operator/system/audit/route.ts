import { ok, parseCursor, parseLimit } from "@/lib/builder-league/http";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { listAuditPage } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

/**
 * The whole operator audit trail (every domain), newest first: `?resource=` exact resource string,
 * `?cursor=`, `?limit=` max 100. Needs `system:manage`. Rows hold actor ids, actions, decisions and
 * argument hashes; no member personal data. Reading the trail is itself audited.
 */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "system",
    action: "system.audit.read",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const resource = query.get("resource")?.trim().slice(0, 300) || null;
      const limit = parseLimit(query.get("limit"), 50, 100);
      return { resource: operatorDomainResource("system"), args: { resource, limit }, filter: { resource, limit, cursor: parseCursor(query.get("cursor")) } };
    },
    run: async ({ db }, { filter }) => {
      const page = await listAuditPage(db, filter);
      return ok(page.items, page.pagination);
    },
  });
}
