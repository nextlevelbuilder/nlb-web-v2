import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { searchOrganizations } from "@/lib/operators/http/operator-account-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const qSchema = z.string().trim().min(1).max(200).nullable();

/** Organizations, newest first: `?q=` matches a slug or name prefix; `?limit=` max 100. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "users",
    action: "users.org.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const filter = { q: qSchema.parse(query.get("q")), limit: parseLimit(query.get("limit"), 50, 100) };
      return { resource: operatorDomainResource("users"), args: filter, filter };
    },
    run: async ({ db }, { filter }) => ok(await searchOrganizations(db, filter)),
  });
}
