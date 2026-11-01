import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { polar } from "@/lib/polar";
import { resyncMembershipSubscriptions } from "@/lib/membership/polar-resync";
import { operatorDomainResource, readJsonObject, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ limit: z.number().int().min(1).max(500).optional() }).strict();

/** Re-read live membership subscriptions from Polar now (the hourly job does the same, capped). */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    domain: "membership",
    action: "membership.subscription.resync",
    prepare: async () => {
      const { limit = 100 } = bodySchema.parse((await readJsonObject(request)).body);
      return { resource: operatorDomainResource("membership"), args: { limit }, limit };
    },
    run: async ({ db, now }, { limit }) => ok(await resyncMembershipSubscriptions(db, polar, { limit, now })),
  });
}
