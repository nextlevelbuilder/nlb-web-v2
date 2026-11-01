/**
 * Operator refund of any stored Polar order. Polar is the source of truth for money: this asks Polar to
 * refund and changes nothing locally. The `order.refunded` webhook then updates the order and revokes
 * whatever it paid for (course entitlement, Live ticket, membership), so a refund Polar rejects never
 * leaves access revoked.
 */
import type { Polar } from "@polar-sh/sdk";
import { BuilderApiError } from "@/lib/builder-league/http";
import type { orders } from "@/lib/db/schema";
import { LIVE_REFUND_REASONS, type LivePolarRefundsClient, type LiveRefundReason } from "@/lib/live/http/live-ticket-refund";

export type PolarRefundsClient = LivePolarRefundsClient;
export const ORDER_REFUND_REASONS = LIVE_REFUND_REASONS;
export type OrderRefundReason = LiveRefundReason;

type OrderRow = typeof orders.$inferSelect;

export interface OrderRefundRequested {
  orderId: string;
  refundId: string;
  /** Polar's refund status (`pending`, `succeeded`, …). */
  refundStatus: string;
  amount: number;
  currency: string;
  /** The local order status, unchanged until the webhook confirms the refund. */
  orderStatus: string;
}

function statusCodeOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    const value = (error as { statusCode: unknown }).statusCode;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

const errorNameOf = (error: unknown) => (error instanceof Error ? error.name : "");

/**
 * Requests a refund of `amount` (minor units), or of everything still refundable when `amount` is null.
 * 409 `already_refunded` when nothing is left, `refund_amount_too_high` above the refundable rest.
 */
export async function requestOrderRefund(
  order: OrderRow,
  client: PolarRefundsClient,
  options: { reason: OrderRefundReason; amount: number | null; comment?: string }
): Promise<OrderRefundRequested> {
  if (order.status === "refunded") throw new BuilderApiError(409, "already_refunded", "This order is already refunded");

  let remote: Awaited<ReturnType<Polar["orders"]["get"]>>;
  try {
    remote = await client.orders.get({ id: order.polarOrderId });
  } catch (error) {
    console.error("Polar order lookup failed for refund:", { orderId: order.id, statusCode: statusCodeOf(error) });
    if (statusCodeOf(error) === 404) throw new BuilderApiError(404, "order_not_found", "The payment order was not found in Polar");
    throw new BuilderApiError(502, "refund_failed", "Could not reach the payment provider; retry later");
  }

  // Polar refunds pre-tax amounts and refunds tax proportionally (`refundedAmount` excludes tax).
  const refundable = remote.netAmount - remote.refundedAmount;
  if (refundable <= 0) throw new BuilderApiError(409, "already_refunded", "Nothing is left to refund on this order");
  const amount = options.amount ?? refundable;
  if (amount > refundable) throw new BuilderApiError(409, "refund_amount_too_high", `At most ${refundable} is refundable`);

  try {
    const refund = await client.refunds.create({
      orderId: remote.id,
      reason: options.reason,
      amount,
      comment: options.comment ?? null,
      metadata: { kind: "operator_refund", orderId: order.id },
    });
    if (!refund) throw new Error("Polar returned no refund");
    return { orderId: order.id, refundId: refund.id, refundStatus: refund.status, amount: refund.amount, currency: refund.currency, orderStatus: order.status };
  } catch (error) {
    console.error("Polar refund failed for order:", { orderId: order.id, statusCode: statusCodeOf(error), name: errorNameOf(error) });
    if (errorNameOf(error) === "RefundedAlready") throw new BuilderApiError(409, "already_refunded", "Polar reports this order as already refunded");
    if (errorNameOf(error) === "RefundAmountTooHigh") throw new BuilderApiError(409, "refund_amount_too_high", "Polar refused the refund amount");
    throw new BuilderApiError(502, "refund_failed", "The payment provider refused the refund; retry later");
  }
}
