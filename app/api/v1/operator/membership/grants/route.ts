import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { grantEntitlement } from "@/lib/membership/entitlement-grants";
import { readJsonObject, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { entitlementGrantTarget, entitlementGrantTargetSchema } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorConflict } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = entitlementGrantTargetSchema
  .extend({ reason: z.string().trim().min(1).max(500), approvalId: z.string().trim().min(1).max(200) })
  .strict();

/**
 * Grant one video or replay to a user by hand (sensitive `membership.entitlement.grant`). The grant is
 * its own record, never an order or purchase. Needs an approval for `{ userId, featureKey, validUntil }`.
 */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    domain: "membership",
    action: "membership.entitlement.grant",
    prepare: async ({ db }) => {
      const { approvalId, reason, ...target } = bodySchema.parse((await readJsonObject(request)).body);
      return { ...(await entitlementGrantTarget(db, target)), approvalId, details: { featureKey: target.featureKey }, input: { ...target, reason } };
    },
    run: async ({ db, subject }, { input, approvalId }) => {
      const grant = await grantEntitlement(db, {
        userId: input.userId,
        featureKey: input.featureKey,
        reason: input.reason,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        grantedBy: subject.userId,
        approvalId,
      });
      if (!grant) throw operatorConflict("grant_exists", "The user already holds a live grant for this feature");
      return ok(grant, undefined, 201);
    },
  });
}
