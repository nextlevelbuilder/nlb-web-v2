import { ok } from "@/lib/builder-league/http";
import { updateTopicGroup } from "@/lib/live/topics";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { topicGroupUpdateSchema } from "@/lib/live/http/live-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Update a topic group's titles or sort order (the slug is fixed). */
export async function PATCH(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.topic_group.update",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      const patch = topicGroupUpdateSchema.parse((await readJsonObject(request)).body);
      return { resource: `live:topic_group:${id}`, args: { id, ...patch }, id, patch };
    },
    run: async ({ db, now }, { id, patch }) => ok(await updateTopicGroup(id, patch, db, now)),
  });
}
