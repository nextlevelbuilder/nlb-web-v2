import { ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { loadEvent } from "@/lib/live/events";
import { ensureLiveTicketPolarProduct } from "@/lib/live/live-polar-product";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { getLivePolarClient } from "@/lib/live/http/live-external-clients";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Ensure the event has its one-time Polar ticket product (draft or scheduled events only). Idempotent:
 * an existing product id is returned without calling Polar. The price is locked afterwards.
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.polar_product",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      return { resource: resourceKey({ kind: "live_event", id }), args: { id }, id };
    },
    run: async ({ db }, { id }) => {
      const event = await loadEvent(db, id);
      const polarProductId = await ensureLiveTicketPolarProduct(event, db, await getLivePolarClient());
      return ok({ eventId: id, polarProductId });
    },
  });
}
