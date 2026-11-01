import { ok } from "@/lib/builder-league/http";
import { listMemberships, listOrgProducts } from "@/lib/access/http/member-queries";
import { isAllowed, requireUserId, runMemberRoute } from "@/lib/access/http/member-route";

export const dynamic = "force-dynamic";

/**
 * Directory products of the organizations the signed-in caller belongs to, any status (`?status=`
 * filters, e.g. `published`). Each organization is checked with `org:<id>` read, so bans and scopes apply.
 */
export async function GET(request: Request) {
  return runMemberRoute(request, async (context) => {
    const userId = requireUserId(context);
    const rawStatus = new URL(request.url).searchParams.get("status")?.trim();
    const status = rawStatus && /^[a-z_]{1,40}$/.test(rawStatus) ? rawStatus : undefined;
    const organizations = [];
    for (const membership of await listMemberships(context.db, userId)) {
      if (await isAllowed(context, "read", { kind: "org", id: membership.orgId })) organizations.push(membership);
    }
    const rows = await listOrgProducts(context.db, organizations.map((org) => org.orgId), status);
    return ok({
      organizations,
      products: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    });
  });
}
