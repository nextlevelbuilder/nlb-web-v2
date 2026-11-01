import { ok } from "@/lib/builder-league/http";
import { getMemberTier } from "@/lib/membership/member-access";
import { getOperatorCapabilities } from "@/lib/operators/operator-grants";
import { getUser, listUserOrganizations } from "@/lib/operators/http/operator-account-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { userResource } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** One account with its ban state, effective membership tier, operator capabilities and organizations. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "users",
    action: "users.user.read",
    prepare: async ({ db }) => {
      const user = await getUser(db, requirePathParam((await params).id, "id"));
      if (!user) throw operatorNotFound("User");
      return { resource: userResource(user.id), args: { userId: user.id }, user };
    },
    run: async ({ db, now }, { user }) => {
      const [membership, capabilities, organizations] = await Promise.all([
        getMemberTier(db, user.id, now),
        getOperatorCapabilities(db, user.id),
        listUserOrganizations(db, user.id),
      ]);
      return ok({ ...user, membership, capabilities, organizations });
    },
  });
}
