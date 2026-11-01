import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { polar } from "@/lib/polar";
import { requestOrderRefund } from "@/lib/commerce/order-refunds";
import { getOrder } from "@/lib/operators/http/operator-account-queries";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { orderRefundTarget, orderRefundTargetSchema } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = orderRefundTargetSchema
  .omit({ orderId: true })
  .extend({ comment: z.string().trim().max(500).optional(), approvalId: z.string().trim().min(1).max(200) })
  .strict();

/**
 * Ask Polar to refund an order (sensitive `commerce.order.refund`). Answers 202: Polar's
 * `order.refunded` webhook then updates the order and revokes what it paid for. Needs an approval for
 * `{ orderId, reason, amount }`; `amount` null refunds everything still refundable.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "commerce",
    action: "commerce.order.refund",
    prepare: async ({ db }) => {
      const orderId = requirePathParam((await params).id, "id");
      const { approvalId, comment, ...input } = bodySchema.parse((await readJsonObject(request)).body);
      const row = await getOrder(db, orderId);
      if (!row) throw operatorNotFound("Order");
      return { ...(await orderRefundTarget(db, { orderId, ...input })), approvalId, order: row.order, refund: { ...input, comment } };
    },
    run: async (_ctx, { order, refund }) => ok(await requestOrderRefund(order, polar, refund), undefined, 202),
  });
}
