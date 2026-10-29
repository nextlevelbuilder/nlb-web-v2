import { ok } from "@/lib/builder-league/http";
import { updateTopic } from "@/lib/live/topics";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { topicUpdateSchema } from "@/lib/live/http/live-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Update a topic's titles or summaries (the slug and group are fixed). */
export async function PATCH(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.topic.update",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      const patch = topicUpdateSchema.parse((await readJsonObject(request)).body);
      return { resource: `live:topic:${id}`, args: { id, ...patch }, id, patch };
    },
    run: async ({ db, now }, { id, patch }) => ok(await updateTopic(id, patch, db, now)),
  });
}
