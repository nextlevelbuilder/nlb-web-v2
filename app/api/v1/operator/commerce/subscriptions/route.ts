import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { listSubscriptions } from "@/lib/operators/http/operator-account-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const optionalId = z.string().trim().min(1).max(200).nullable();
const filterSchema = z.object({ userId: optionalId, customerId: optionalId, status: z.string().trim().min(1).max(50).nullable() });

/** Stored Polar subscriptions, newest first: `?userId=`, `?customerId=`, `?status=`, `?limit=` max 100. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "commerce",
    action: "commerce.subscription.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const filter = {
        ...filterSchema.parse({ userId: query.get("userId"), customerId: query.get("customerId"), status: query.get("status") }),
        limit: parseLimit(query.get("limit"), 50, 100),
      };
      return { resource: operatorDomainResource("commerce"), args: filter, filter };
    },
    run: async ({ db }, { filter }) => ok(await listSubscriptions(db, filter)),
  });
}
