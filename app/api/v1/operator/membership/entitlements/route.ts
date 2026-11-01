import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { listEntitlements } from "@/lib/operators/http/operator-account-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const filterSchema = z.object({
  userId: z.string().trim().min(1).max(200).nullable(),
  featureKey: z.string().trim().min(1).max(200).nullable(),
  all: z.enum(["true", "false"]).nullable().transform((value) => value === "true"),
});

/**
 * Entitlements written by purchases, newest first: `?userId=`, `?featureKey=`, `?all=true` to include
 * inactive ones, `?limit=` max 100. Manual grants are listed per user on `…/membership/users/{userId}`.
 */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "membership",
    action: "membership.entitlement.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const filter = {
        ...filterSchema.parse({ userId: query.get("userId"), featureKey: query.get("featureKey"), all: query.get("all") }),
        limit: parseLimit(query.get("limit"), 50, 100),
      };
      return { resource: operatorDomainResource("membership"), args: filter, filter };
    },
    run: async ({ db }, { filter }) => ok(await listEntitlements(db, filter)),
  });
}
