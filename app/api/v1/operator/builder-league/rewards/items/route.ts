import { ok } from "@/lib/builder-league/http";
import { serializeAdminRewardItem } from "@/lib/builder-league/progression-api";
import { listRewardItems, rewardItemInputSchema, upsertRewardItem } from "@/lib/builder-league/rewards";
import { operatorDomainResource, readJsonObject, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

/** Every reward catalogue item, active or not. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.reward.list",
    prepare: async () => ({ resource: operatorDomainResource("builder_league"), args: {} }),
    run: async ({ db }) => ok((await listRewardItems(db)).map(serializeAdminRewardItem)),
  });
}

/** Create or update a catalogue item by `key`; recorded in the Builder League audit too. */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.reward.upsert",
    prepare: async () => {
      const input = rewardItemInputSchema.parse((await readJsonObject(request)).body);
      return { resource: `builder_league:reward:${input.key}`, args: { key: input.key }, input };
    },
    run: async ({ db, subject }, { input }) => ok(serializeAdminRewardItem(await upsertRewardItem(db, input, { actorId: subject.userId, actorRole: "admin" }))),
  });
}
