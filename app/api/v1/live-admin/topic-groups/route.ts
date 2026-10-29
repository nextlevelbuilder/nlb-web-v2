import { ok } from "@/lib/builder-league/http";
import { createTopicGroup } from "@/lib/live/topics";
import { runOperatorRoute, LIVE_OPERATOR_RESOURCE } from "@/lib/live/http/live-operator-route";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { topicGroupCreateSchema } from "@/lib/live/http/live-operator-schemas";
import { listTopicGroupsForOperator } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

/** Every topic group (archived included) with its topics. Operator (`live:manage`) only. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.topic_group.list",
    prepare: async () => ({ resource: LIVE_OPERATOR_RESOURCE, args: {} }),
    run: async ({ db }) => ok(await listTopicGroupsForOperator(db)),
  });
}

/** Create a topic group. */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.topic_group.create",
    prepare: async () => {
      const input = topicGroupCreateSchema.parse((await readJsonObject(request)).body);
      return { resource: LIVE_OPERATOR_RESOURCE, args: input, input };
    },
    run: async ({ db }, { input }) => {
      return ok(await createTopicGroup(input, db), undefined, 201);
    },
  });
}
