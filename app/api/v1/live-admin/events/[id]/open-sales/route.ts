import { ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { openSales } from "@/lib/live/events";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `scheduled → sales_open`: needs the Polar product and both recording notices; creates `capacity`
 * seat rows in the same batch. Idempotent on an event already on sale (fills in missing seats only).
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.open_sales",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      return { resource: resourceKey({ kind: "live_event", id }), args: { id }, id };
    },
    run: async ({ db, now }, { id }) => ok(await openSales(id, db, now)),
  });
}
