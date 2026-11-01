import { BuilderApiError, ok, parseLimit } from "@/lib/builder-league/http";
import { listOrgAssets, toMemberAsset } from "@/lib/access/http/member-queries";
import { requireAllowed, runMemberRoute } from "@/lib/access/http/member-route";

export const dynamic = "force-dynamic";

/** Assets of an organization the caller belongs to (`?orgId=` required, `org:<id>` read), newest first. */
export async function GET(request: Request) {
  return runMemberRoute(request, async (context) => {
    const query = new URL(request.url).searchParams;
    const orgId = query.get("orgId")?.trim();
    if (!orgId || orgId.length > 200) throw new BuilderApiError(400, "invalid_input", "orgId is required");
    await requireAllowed(context, "read", { kind: "org", id: orgId });
    const rows = await listOrgAssets(context.db, orgId, parseLimit(query.get("limit"), 50, 100));
    return ok(rows.map(toMemberAsset));
  });
}
