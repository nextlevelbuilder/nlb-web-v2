import { BuilderApiError, ok } from "@/lib/builder-league/http";
import { getAsset, toMemberAsset } from "@/lib/access/http/member-queries";
import { requireAllowed, requirePathParam, runMemberRoute } from "@/lib/access/http/member-route";

export const dynamic = "force-dynamic";

/**
 * One asset, allowed by `asset:<id>` download: promoted assets for anyone, other assets for members of
 * the owning organization. A missing asset is denied as `not_available` (403) like any asset the policy
 * cannot place, so ids cannot be probed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runMemberRoute(request, async (context) => {
    const id = requirePathParam((await params).id, "id");
    await requireAllowed(context, "download", { kind: "asset", id });
    const asset = await getAsset(context.db, id);
    if (!asset) throw new BuilderApiError(404, "not_found", "Asset not found");
    return ok(toMemberAsset(asset));
  });
}
