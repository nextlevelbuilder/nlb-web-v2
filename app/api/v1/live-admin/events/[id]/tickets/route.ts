import { ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { loadEvent } from "@/lib/live/events";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { listEventTickets } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Ticket ledger of an event for reconciliation: every ticket (exceptions first) with id, status,
 * seat, Polar order id and user id only (no names or emails), plus counts by status.
 */
export async function GET(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.ticket.list",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      return { resource: resourceKey({ kind: "live_ticket", eventId: id }), args: { eventId: id }, id };
    },
    run: async ({ db }, { id }) => {
      await loadEvent(db, id);
      return ok({ eventId: id, ...(await listEventTickets(db, id)) });
    },
  });
}
