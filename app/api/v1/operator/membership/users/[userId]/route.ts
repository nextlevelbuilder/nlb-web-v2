import { ok } from "@/lib/builder-league/http";
import { getMemberTier } from "@/lib/membership/member-access";
import { listPurchasedEntitlements, listUserGrants } from "@/lib/membership/entitlement-grants";
import { getUser } from "@/lib/operators/http/operator-account-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { userResource } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/**
 * What a user can reach: the effective membership tier, entitlements written by purchases, and manual
 * grants (revoked ones included), kept apart so a grant never reads as a payment.
 */
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  return runOperatorRoute({
    request,
    domain: "membership",
    action: "membership.user.read",
    prepare: async ({ db }) => {
      const user = await getUser(db, requirePathParam((await params).userId, "userId"));
      if (!user) throw operatorNotFound("User");
      return { resource: userResource(user.id), args: { userId: user.id }, userId: user.id };
    },
    run: async ({ db, now }, { userId }) => {
      const [membership, purchased, grants] = await Promise.all([getMemberTier(db, userId, now), listPurchasedEntitlements(db, userId), listUserGrants(db, userId)]);
      return ok({ userId, membership, entitlements: purchased, grants });
    },
  });
}
