import { ok } from "@/lib/builder-league/http";
import { getSubscription } from "@/lib/operators/http/operator-account-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** One stored subscription with the linked user. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "commerce",
    action: "commerce.subscription.read",
    prepare: async () => {
      const subscriptionId = requirePathParam((await params).id, "id");
      return { resource: `subscription:${subscriptionId}`, args: { subscriptionId }, subscriptionId };
    },
    run: async ({ db }, { subscriptionId }) => {
      const row = await getSubscription(db, subscriptionId);
      if (!row) throw operatorNotFound("Subscription");
      return ok({ ...row.subscription, customerUserId: row.customerUserId });
    },
  });
}
