import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { revokeEntitlementGrant } from "@/lib/membership/entitlement-grants";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { entitlementRevokeTarget } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorConflict } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ approvalId: z.string().trim().min(1).max(200) }).strict();

/** Revoke a manual grant (sensitive `membership.entitlement.revoke`); the row is kept as history. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "membership",
    action: "membership.entitlement.revoke",
    prepare: async ({ db }) => {
      const grantId = requirePathParam((await params).id, "id");
      const { approvalId } = bodySchema.parse((await readJsonObject(request)).body);
      return { ...(await entitlementRevokeTarget(db, grantId)), approvalId, grantId };
    },
    run: async ({ db, subject, now }, { grantId }) => {
      const grant = await revokeEntitlementGrant(db, { grantId, revokedBy: subject.userId, now });
      if (!grant) throw operatorConflict("grant_revoked", "This grant is already revoked");
      return ok(grant);
    },
  });
}
