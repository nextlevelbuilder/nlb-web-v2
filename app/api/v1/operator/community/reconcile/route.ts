import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { COMMUNITY_TARGETS, type CommunityTarget } from "@/lib/community/types";
import { enqueueAccessReconcile } from "@/lib/onboarding/jobs";
import { getUser } from "@/lib/operators/http/operator-account-queries";
import { readJsonObject, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { userResource } from "@/lib/operators/http/operator-sensitive-targets";
import { operatorNotFound } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ userId: z.string().trim().min(1).max(200), targets: z.array(z.enum(COMMUNITY_TARGETS as [CommunityTarget, ...CommunityTarget[]])).min(1).optional() })
  .strict();

/**
 * Queue a community access reconcile (Discord, Telegram) for one user; the onboarding runner applies
 * the user's current membership to each target. Answers 202 with the queued targets.
 */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    domain: "community",
    action: "community.access.reconcile",
    prepare: async ({ db }) => {
      const { userId, targets = [...COMMUNITY_TARGETS] } = bodySchema.parse((await readJsonObject(request)).body);
      if (!(await getUser(db, userId))) throw operatorNotFound("User");
      return { resource: userResource(userId), args: { userId, targets }, userId, targets };
    },
    run: async ({ db, now }, { userId, targets }) => {
      await enqueueAccessReconcile(db, userId, targets, now);
      return ok({ userId, targets, queued: true }, undefined, 202);
    },
  });
}
