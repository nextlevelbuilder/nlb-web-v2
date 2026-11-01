import { ok } from "@/lib/builder-league/http";
import { getOrder } from "@/lib/operators/http/operator-account-queries";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** One stored Polar order with its customer. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "commerce",
    action: "commerce.order.read",
    prepare: async ({ db }) => {
      const row = await getOrder(db, requirePathParam((await params).id, "id"));
      if (!row) throw operatorNotFound("Order");
      return { resource: `order:${row.order.id}`, args: { orderId: row.order.id }, row };
    },
    run: async (_ctx, { row }) => ok({ ...row.order, customerEmail: row.customerEmail, customerUserId: row.customerUserId }),
  });
}
