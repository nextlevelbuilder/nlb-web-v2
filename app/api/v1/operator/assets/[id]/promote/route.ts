import { ok } from "@/lib/builder-league/http";
import { getAsset } from "@/lib/access/http/member-queries";
import { promoteAssetToPublic } from "@/lib/media/r2";
import { toOperatorAsset } from "@/lib/operators/http/operator-content-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorConflict, operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** Promote a staging asset to the public CDN path; anyone may then download it (`asset:<id>`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "assets",
    action: "assets.asset.promote",
    prepare: async ({ db }) => {
      const asset = await getAsset(db, requirePathParam((await params).id, "id"));
      if (!asset) throw operatorNotFound("Asset");
      if (asset.status !== "staging") throw operatorConflict("asset_not_staging", `The asset is ${asset.status}`);
      return { resource: `asset:${asset.id}`, args: { assetId: asset.id }, details: { orgId: asset.orgId }, assetId: asset.id };
    },
    run: async ({ db }, { assetId }) => ok(toOperatorAsset(await promoteAssetToPublic(assetId, db))),
  });
}
