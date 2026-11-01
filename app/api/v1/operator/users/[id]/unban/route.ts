import { ok } from "@/lib/builder-league/http";
import { unbanUser } from "@/lib/access/user-bans";
import { getUser } from "@/lib/operators/http/operator-account-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { userResource } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** Lift a ban. Restoring access needs no second approval; the audit row still records who did it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "users",
    action: "users.user.unban",
    prepare: async ({ db }) => {
      const user = await getUser(db, requirePathParam((await params).id, "id"));
      if (!user) throw operatorNotFound("User");
      return { resource: userResource(user.id), args: { userId: user.id }, userId: user.id };
    },
    run: async ({ db, now }, { userId }) => {
      if (!(await unbanUser(db, userId, now))) throw operatorNotFound("User");
      return ok(await getUser(db, userId));
    },
  });
}
