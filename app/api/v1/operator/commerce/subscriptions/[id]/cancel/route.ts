import { subscriptionCancelRoute } from "@/lib/operators/http/operator-subscription-route";

export const dynamic = "force-dynamic";

/** Ask Polar to end the subscription at the current period end; access lasts until then. */
export const POST = subscriptionCancelRoute(true);
