import { ok } from "@/lib/builder-league/http";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { ticketRefundSchema } from "@/lib/live/http/live-operator-schemas";
import { loadTicketForRefund, refundTarget } from "@/lib/live/http/live-sensitive-targets";
import { requestLiveTicketRefund } from "@/lib/live/http/live-ticket-refund";
import { getLivePolarClient } from "@/lib/live/http/live-external-clients";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Refund a ticket's Polar order (sensitive `live.ticket.refund`): needs an approval for
 * `{ action: "live.ticket.refund", target: { ticketId } }` decided by a different operator. Works for
 * active, cancelled and exception tickets. Polar stays the source of truth: the ticket is not changed
 * here; the `order.refunded` webhook revokes it, its entitlement and its seat. Answers 202.
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.ticket.refund",
    prepare: async ({ db }) => {
      const ticketId = requirePathParam((await params).id, "id");
      const input = ticketRefundSchema.parse((await readJsonObject(request)).body);
      const ticket = await loadTicketForRefund(db, ticketId);
      return { ...refundTarget(ticket), approvalId: input.approvalId, details: { ticketStatus: ticket.status, reason: input.reason }, ticket, input };
    },
    run: async (_ctx, { ticket, input }) => {
      const refund = await requestLiveTicketRefund(ticket, await getLivePolarClient(), { reason: input.reason, comment: input.comment });
      return ok(refund, undefined, 202);
    },
  });
}
