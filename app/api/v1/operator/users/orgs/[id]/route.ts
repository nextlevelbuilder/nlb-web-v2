import { ok } from "@/lib/builder-league/http";
import { getOrganization } from "@/lib/operators/http/operator-account-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** One organization with its members and their roles. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "users",
    action: "users.org.read",
    prepare: async ({ db }) => {
      const org = await getOrganization(db, requirePathParam((await params).id, "id"));
      if (!org) throw operatorNotFound("Organization");
      return { resource: `org:${org.id}`, args: { orgId: org.id }, org };
    },
    run: async (_ctx, { org }) => ok(org),
  });
}
