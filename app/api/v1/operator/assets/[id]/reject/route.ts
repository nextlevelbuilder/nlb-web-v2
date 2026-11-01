import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { getAsset } from "@/lib/access/http/member-queries";
import { rejectStagingAsset } from "@/lib/media/r2";
import { toOperatorAsset } from "@/lib/operators/http/operator-content-queries";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorConflict, operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

/** Reject a staging asset; it is never promoted and stays private to its organization. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "assets",
    action: "assets.asset.reject",
    prepare: async ({ db }) => {
      const asset = await getAsset(db, requirePathParam((await params).id, "id"));
      if (!asset) throw operatorNotFound("Asset");
      const { reason } = bodySchema.parse((await readJsonObject(request)).body);
      return { resource: `asset:${asset.id}`, args: { assetId: asset.id, reason }, details: { orgId: asset.orgId }, assetId: asset.id };
    },
    run: async ({ db }, { assetId }) => {
      const rejected = await rejectStagingAsset(assetId, db);
      if (!rejected) throw operatorConflict("asset_not_staging", "Only staging assets can be rejected");
      return ok(toOperatorAsset(rejected));
    },
  });
}
