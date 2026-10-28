import { ok, parseLimit } from "@/lib/builder-league/http";
import { createRound, deriveRoundStatus } from "@/lib/live/polls";
import { buildWeeklyWindow } from "@/lib/live/live-time";
import { LIVE_OPERATOR_RESOURCE, runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { roundCreateSchema } from "@/lib/live/http/live-operator-schemas";
import { listRoundsForOperator } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

/** Rounds newest first with their clock-derived status (`?limit=`, max 100). */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.round.list",
    prepare: async () => {
      const limit = parseLimit(new URL(request.url).searchParams.get("limit"), 20, 100);
      return { resource: LIVE_OPERATOR_RESOURCE, args: { limit }, limit };
    },
    run: async ({ db, now }, { limit }) => {
      const rounds = await listRoundsForOperator(db, limit);
      return ok(rounds.map((round) => ({ ...round, status: deriveRoundStatus(round, now) })));
    },
  });
}

/**
 * Open a voting round over active topics. Give `opensAt`/`closesAt` (ISO with offset) or a local
 * `window` in Asia/Ho_Chi_Minh (`{ opensOn: "2026-11-02", opensAt: "09:00", days: 7 }`). Windows of
 * two rounds never overlap.
 */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.round.create",
    prepare: async () => {
      const input = roundCreateSchema.parse((await readJsonObject(request)).body);
      const window = input.window ? buildWeeklyWindow(input.window) : null;
      const opensAt = window?.opensAt ?? (input.opensAt as Date);
      const closesAt = window?.closesAt ?? (input.closesAt as Date);
      return {
        resource: LIVE_OPERATOR_RESOURCE,
        args: { ...input, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), window: undefined },
        details: { slug: input.slug, topics: input.topicIds.length },
        round: { slug: input.slug, titleEn: input.titleEn, titleVi: input.titleVi, topicIds: input.topicIds, opensAt, closesAt, timezone: window?.timezone },
      };
    },
    run: async ({ db, subject }, { round }) => ok(await createRound({ ...round, createdBy: subject.userId }, db), undefined, 201),
  });
}
