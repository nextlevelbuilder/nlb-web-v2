import { subscriptionCancelRoute } from "@/lib/operators/http/operator-subscription-route";

export const dynamic = "force-dynamic";

/** Ask Polar to keep a subscription that was set to end at the period end. */
export const POST = subscriptionCancelRoute(false);
