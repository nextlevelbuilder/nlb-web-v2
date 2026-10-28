import { ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { transitionEvent } from "@/lib/live/event-lifecycle";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { eventTransitionSchema } from "@/lib/live/http/live-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Move an event along the state machine: `to` is `scheduled`, `live`, `ended` or `archived`. Opening
 * sales and cancelling have side effects and use `/open-sales` and `/cancel`.
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.transition",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      const { to } = eventTransitionSchema.parse((await readJsonObject(request)).body);
      return { resource: resourceKey({ kind: "live_event", id }), args: { id, to }, details: { to }, id, to };
    },
    run: async ({ db, now }, { id, to }) => ok(await transitionEvent(id, to, db, now)),
  });
}
