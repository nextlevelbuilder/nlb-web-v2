/** Shared handler of the subscription cancel and resume operator routes. */
import { ok } from "@/lib/builder-league/http";
import { setSubscriptionCancelAtPeriodEnd } from "@/lib/commerce/subscription-control";
import { polar } from "@/lib/polar";
import { getSubscription } from "./operator-account-queries";
import { requirePathParam, runOperatorRoute } from "./operator-route";
import { operatorNotFound } from "../operator-service-error";

export function subscriptionCancelRoute(cancel: boolean) {
  return async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
    runOperatorRoute({
      request,
      domain: "commerce",
      action: cancel ? "commerce.subscription.cancel" : "commerce.subscription.resume",
      prepare: async ({ db }) => {
        const subscriptionId = requirePathParam((await params).id, "id");
        const row = await getSubscription(db, subscriptionId);
        if (!row) throw operatorNotFound("Subscription");
        return { resource: `subscription:${subscriptionId}`, args: { subscriptionId }, row };
      },
      run: async ({ db, now }, { row }) =>
        ok(await setSubscriptionCancelAtPeriodEnd(db, polar, row.subscription, { cancel, userId: row.customerUserId, now })),
    });
}
