import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { listProducts } from "@/lib/operators/http/operator-content-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const statusSchema = z.string().regex(/^[a-z_]{1,40}$/).nullable();

/** Directory products of every organization, any status (`?status=`), `?limit=` max 100. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "directory",
    action: "directory.product.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const args = { status: statusSchema.parse(query.get("status")), limit: parseLimit(query.get("limit"), 50, 100) };
      return { resource: operatorDomainResource("directory"), args };
    },
    run: async ({ db }, { args }) => ok(await listProducts(db, args)),
  });
}
