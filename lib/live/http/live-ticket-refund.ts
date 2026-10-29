/**
 * Operator refund of a Live ticket through Polar. Polar is the source of truth for money: this asks
 * Polar to refund the remaining amount of the ticket's order and changes nothing locally. The
 * `order.refunded` webhook (lib/live/live-webhook-tickets.ts) then revokes the ticket, entitlement and
 * seat, so a refund Polar rejects never leaves a ticket marked refunded.
 */
import type { Polar } from "@polar-sh/sdk";
import { BuilderApiError } from "@/lib/builder-league/http";
import type { liveTickets } from "@/lib/db/schema";
import { LIVE_TICKET_PRODUCT_KIND } from "@/lib/live/types";

export interface LivePolarRefundsClient {
  orders: Pick<Polar["orders"], "get">;
  refunds: Pick<Polar["refunds"], "create">;
}

type RefundReason = Parameters<Polar["refunds"]["create"]>[0]["reason"];

export const LIVE_REFUND_REASONS = [
  "duplicate",
  "fraudulent",
  "customer_request",
  "service_disruption",
  "satisfaction_guarantee",
  "other",
] as const satisfies readonly RefundReason[];

export type LiveRefundReason = (typeof LIVE_REFUND_REASONS)[number];

export interface LiveRefundRequested {
  ticketId: string;
  eventId: string;
  refundId: string;
  /** Polar's refund status (`pending`, `succeeded`, …). */
  refundStatus: string;
  amount: number;
  currency: string;
  /** The local ticket status, unchanged until the webhook confirms the refund. */
  ticketStatus: string;
}

type TicketRow = typeof liveTickets.$inferSelect;

function statusCodeOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    const value = (error as { statusCode: unknown }).statusCode;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : "";
}

/**
 * Requests a full refund of what is still refundable on the ticket's Polar order. Refuses a ticket
 * already refunded locally or an order with nothing left to refund (409 `already_refunded`).
 */
export async function requestLiveTicketRefund(
  ticket: TicketRow,
  client: LivePolarRefundsClient,
  options: { reason: LiveRefundReason; comment?: string }
): Promise<LiveRefundRequested> {
  if (ticket.status === "refunded") throw new BuilderApiError(409, "already_refunded", "This ticket is already refunded");

  let order: Awaited<ReturnType<Polar["orders"]["get"]>>;
  try {
    order = await client.orders.get({ id: ticket.polarOrderId });
  } catch (error) {
    console.error("Polar order lookup failed for live refund:", { ticketId: ticket.id, statusCode: statusCodeOf(error) });
    if (statusCodeOf(error) === 404) throw new BuilderApiError(404, "order_not_found", "The payment order was not found in Polar");
    throw new BuilderApiError(502, "refund_failed", "Could not reach the payment provider; retry later");
  }

  // Polar refunds pre-tax amounts and refunds tax proportionally (`refundedAmount` excludes tax).
  const amount = order.netAmount - order.refundedAmount;
  if (amount <= 0) throw new BuilderApiError(409, "already_refunded", "Nothing is left to refund on this order");

  try {
    const refund = await client.refunds.create({
      orderId: order.id,
      reason: options.reason,
      amount,
      comment: options.comment ?? null,
      metadata: { kind: LIVE_TICKET_PRODUCT_KIND, ticketId: ticket.id, eventId: ticket.eventId },
    });
    if (!refund) throw new Error("Polar returned no refund");
    return {
      ticketId: ticket.id,
      eventId: ticket.eventId,
      refundId: refund.id,
      refundStatus: refund.status,
      amount: refund.amount,
      currency: refund.currency,
      ticketStatus: ticket.status,
    };
  } catch (error) {
    const statusCode = statusCodeOf(error);
    console.error("Polar refund failed for live ticket:", { ticketId: ticket.id, statusCode, name: errorNameOf(error) });
    if (errorNameOf(error) === "RefundedAlready") throw new BuilderApiError(409, "already_refunded", "Polar reports this order as already refunded");
    if (errorNameOf(error) === "RefundAmountTooHigh") throw new BuilderApiError(409, "refund_amount_too_high", "Polar refused the refund amount");
    throw new BuilderApiError(502, "refund_failed", "The payment provider refused the refund; retry later");
  }
}
