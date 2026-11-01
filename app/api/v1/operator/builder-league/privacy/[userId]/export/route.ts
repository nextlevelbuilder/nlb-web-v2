import { ok } from "@/lib/builder-league/http";
import { recordModerationAction } from "@/lib/builder-league/audit";
import { assertPrivacyUserId, exportBuilderData } from "@/lib/builder-league/privacy-requests";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { userResource } from "@/lib/operators/http/operator-sensitive-targets";

export const dynamic = "force-dynamic";

/** Everything the Builder League stores about one member (privacy export); also recorded in its own audit. */
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.privacy.export",
    prepare: async () => {
      const userId = requirePathParam((await params).userId, "userId");
      assertPrivacyUserId(userId);
      return { resource: userResource(userId), args: { userId }, userId };
    },
    run: async ({ db, subject, now }, { userId }) => {
      const data = await exportBuilderData(db, userId, now);
      await recordModerationAction(db, { targetType: "privacy_request", targetId: userId, action: "export", actorId: subject.userId, actorRole: "admin" });
      return ok(data);
    },
  });
}
