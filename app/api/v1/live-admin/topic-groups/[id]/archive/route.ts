import { ok } from "@/lib/builder-league/http";
import { archiveTopicGroup } from "@/lib/live/topics";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Archive a topic group and every topic in it. Past rounds keep their topics. */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.topic_group.archive",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      return { resource: `live:topic_group:${id}`, args: { id }, id };
    },
    run: async ({ db, now }, { id }) => {
      await archiveTopicGroup(id, db, now);
      return ok({ id, status: "archived" });
    },
  });
}
