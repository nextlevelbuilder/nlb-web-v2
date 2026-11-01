import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { listAssets, toOperatorAsset } from "@/lib/operators/http/operator-content-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const filterSchema = z.object({
  status: z.enum(["staging", "approved", "rejected"]).nullable(),
  orgId: z.string().trim().min(1).max(200).nullable(),
});

/** Uploaded assets of every organization, newest first: `?status=`, `?orgId=`, `?limit=` max 100. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "assets",
    action: "assets.asset.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const filter = filterSchema.parse({ status: query.get("status"), orgId: query.get("orgId") });
      return { resource: operatorDomainResource("assets"), args: { ...filter, limit: parseLimit(query.get("limit"), 50, 100) } };
    },
    run: async ({ db }, { args }) => ok((await listAssets(db, args)).map(toOperatorAsset)),
  });
}
