import { ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { loadEvent, updateEvent } from "@/lib/live/events";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { eventUpdateSchema } from "@/lib/live/http/live-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One event by id, drafts included. */
export async function GET(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.read",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      return { resource: resourceKey({ kind: "live_event", id }), args: { id }, id };
    },
    run: async ({ db }, { id }) => ok(await loadEvent(db, id)),
  });
}

/**
 * Edit an event. Drafts and scheduled events accept any field; once sales open price, currency and
 * capacity are locked (capacity grows through `/capacity`). Live and later events are read-only.
 */
export async function PATCH(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.update",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      const { body } = await readJsonObject(request);
      const patch = eventUpdateSchema.parse(body);
      return { resource: resourceKey({ kind: "live_event", id }), args: { id, ...body }, details: { fields: Object.keys(patch) }, id, patch };
    },
    run: async ({ db, now }, { id, patch }) => ok(await updateEvent(id, patch, db, now)),
  });
}
