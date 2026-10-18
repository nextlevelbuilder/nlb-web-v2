import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody } from "@/lib/builder-league/progression-api";
import { assertPrivacyUserId, deleteBuilderData } from "@/lib/builder-league/privacy-requests";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

const DeleteBodySchema = z.object({ confirm: z.string().min(1).max(128) }).strict();

/**
 * Admin: deletes a member's Builder League data and pseudonymises their history. Irreversible, so the
 * body must repeat the member id (`{ "confirm": "<userId>" }`) and must be JSON, which browsers cannot
 * send cross-site without a CORS preflight.
 */
export async function POST(request: Request, { params }: Params) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller, actorRole } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-privacy");
    const { userId } = await params;
    assertPrivacyUserId(userId);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      throw new BuilderApiError(415, "json_required", "Send the confirmation as application/json.");
    }
    const body = DeleteBodySchema.parse(await readJsonBody(request));
    if (body.confirm !== userId) {
      throw new BuilderApiError(400, "confirmation_mismatch", "The confirm field must repeat the member id from the path.");
    }
    if (userId === caller.user.id) {
      throw new BuilderApiError(400, "self_delete", "Admins cannot run a privacy deletion on their own account; ask another admin.");
    }
    const result = await deleteBuilderData(db, userId, { actorId: caller.user.id, actorRole });
    return ok(result);
  });
}
