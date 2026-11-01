import { ok } from "@/lib/builder-league/http";
import { getProduct } from "@/lib/operators/http/operator-content-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** One directory product, any status, with its current revision and recent submissions. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "directory",
    action: "directory.product.read",
    prepare: async () => {
      const productId = requirePathParam((await params).id, "id");
      return { resource: `product:${productId}`, args: { productId }, productId };
    },
    run: async ({ db }, { productId }) => {
      const product = await getProduct(db, productId);
      if (!product) throw operatorNotFound("Product");
      return ok(product);
    },
  });
}
