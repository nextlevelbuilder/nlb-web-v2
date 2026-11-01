import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { searchUsers } from "@/lib/operators/http/operator-account-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const qSchema = z.string().trim().min(1).max(200).nullable();

/** Accounts, newest first: `?q=` matches the id exactly or an email/name prefix; `?limit=` max 100. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "users",
    action: "users.user.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const q = qSchema.parse(query.get("q"));
      // The search term can be an email: the audit row records only whether one was given.
      return { resource: operatorDomainResource("users"), args: { search: q !== null }, filter: { q, limit: parseLimit(query.get("limit"), 50, 100) } };
    },
    run: async ({ db }, { filter }) => ok(await searchUsers(db, filter)),
  });
}
