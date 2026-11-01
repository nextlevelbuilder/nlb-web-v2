import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { assertPrivacyUserId, deleteBuilderData } from "@/lib/builder-league/privacy-requests";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { privacyDeleteTarget } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorConflict } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ approvalId: z.string().trim().min(1).max(200) }).strict();

/**
 * Delete a member's Builder League data and pseudonymise their history (sensitive
 * `builder_league.privacy.delete`, irreversible). Needs an approval for `{ userId }` from another
 * operator; never on one's own account.
 */
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.privacy.delete",
    prepare: async ({ subject }) => {
      const userId = requirePathParam((await params).userId, "userId");
      assertPrivacyUserId(userId);
      const { approvalId } = bodySchema.parse((await readJsonObject(request)).body);
      if (userId === subject.userId) throw operatorConflict("self_delete", "An operator cannot delete their own Builder League data");
      return { ...privacyDeleteTarget(userId), approvalId, userId };
    },
    run: async ({ db, subject }, { userId }) => ok(await deleteBuilderData(db, userId, { actorId: subject.userId, actorRole: "admin" })),
  });
}
