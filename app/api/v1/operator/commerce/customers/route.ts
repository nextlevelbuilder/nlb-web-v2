import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { listCustomers } from "@/lib/operators/http/operator-account-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const userIdSchema = z.string().trim().min(1).max(200).nullable();

/** Polar customers, newest first: `?userId=`, `?limit=` max 100. No email filter, so no email reaches a URL. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "commerce",
    action: "commerce.customer.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const filter = { userId: userIdSchema.parse(query.get("userId")), limit: parseLimit(query.get("limit"), 50, 100) };
      return { resource: operatorDomainResource("commerce"), args: filter, filter };
    },
    run: async ({ db }, { filter }) => ok(await listCustomers(db, filter)),
  });
}
