import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { computeRankingSnapshot } from "@/lib/domain/rankings";
import { operatorDomainResource, readJsonObject, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    windowType: z.enum(["daily", "weekly", "monthly"]),
    windowDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

/** Freeze a directory leaderboard snapshot for a window; `/api/v1/leaderboards` serves the newest one. */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    domain: "directory",
    action: "directory.ranking.compute",
    prepare: async () => {
      const input = bodySchema.parse((await readJsonObject(request)).body);
      return { resource: operatorDomainResource("directory"), args: { windowType: input.windowType, windowDate: input.windowDate ?? null }, input };
    },
    run: async ({ db }, { input }) => ok(await computeRankingSnapshot(input, db), undefined, 201),
  });
}
