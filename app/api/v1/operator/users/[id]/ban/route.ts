import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { banUser } from "@/lib/access/user-bans";
import { getUser } from "@/lib/operators/http/operator-account-queries";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { userBanTarget, userBanTargetSchema } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorConflict, operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = userBanTargetSchema.omit({ userId: true }).extend({ approvalId: z.string().trim().min(1).max(200) }).strict();

/**
 * Ban an account (sensitive `users.user.ban`): every credential and `authorize()` refuse it at the next
 * check and its sessions end. Needs an approval for `{ userId, reason, expiresAt }` from another operator.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "users",
    action: "users.user.ban",
    prepare: async ({ db, subject }) => {
      const userId = requirePathParam((await params).id, "id");
      const { approvalId, ...input } = bodySchema.parse((await readJsonObject(request)).body);
      if (userId === subject.userId) throw operatorConflict("cannot_ban_self", "An operator cannot ban their own account");
      const target = await userBanTarget(db, { userId, ...input });
      return { ...target, approvalId, ban: { userId, reason: input.reason, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } };
    },
    run: async ({ db, now }, { ban }) => {
      if (!(await banUser(db, { ...ban, now }))) throw operatorNotFound("User");
      return ok(await getUser(db, ban.userId));
    },
  });
}
