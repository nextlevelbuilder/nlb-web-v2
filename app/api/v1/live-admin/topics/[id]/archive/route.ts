import { ok } from "@/lib/builder-league/http";
import { archiveTopic } from "@/lib/live/topics";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Archive a topic: it stays attached to past rounds but cannot join new ones. */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.topic.archive",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      return { resource: `live:topic:${id}`, args: { id }, id };
    },
    run: async ({ db, now }, { id }) => ok(await archiveTopic(id, db, now)),
  });
}
