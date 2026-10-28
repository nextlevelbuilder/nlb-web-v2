import { ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { setEventCapacity } from "@/lib/live/events";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { eventCapacitySchema } from "@/lib/live/http/live-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Set capacity. Before sales any value from 1; once on sale it only grows (new seats added atomically). */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.capacity",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      const { capacity } = eventCapacitySchema.parse((await readJsonObject(request)).body);
      return { resource: resourceKey({ kind: "live_event", id }), args: { id, capacity }, details: { capacity }, id, capacity };
    },
    run: async ({ db, now }, { id, capacity }) => ok(await setEventCapacity(id, capacity, db, now)),
  });
}
