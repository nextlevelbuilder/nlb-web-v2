import { ok } from "@/lib/builder-league/http";
import { createTopic } from "@/lib/live/topics";
import { LIVE_OPERATOR_RESOURCE, runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { topicCreateSchema } from "@/lib/live/http/live-operator-schemas";
import { listTopicsForOperator } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

/** Topics (archived included), optionally for one group (`?groupId=`). */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.topic.list",
    prepare: async () => {
      const groupId = new URL(request.url).searchParams.get("groupId")?.trim().slice(0, 200) || null;
      return { resource: LIVE_OPERATOR_RESOURCE, args: { groupId }, groupId };
    },
    run: async ({ db }, { groupId }) => ok(await listTopicsForOperator(db, groupId)),
  });
}

/** Create a topic in an active group. */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.topic.create",
    prepare: async () => {
      const input = topicCreateSchema.parse((await readJsonObject(request)).body);
      return { resource: `live:topic_group:${input.groupId}`, args: input, input };
    },
    run: async ({ db, subject }, { input }) => ok(await createTopic({ ...input, createdBy: subject.userId }, db), undefined, 201),
  });
}
