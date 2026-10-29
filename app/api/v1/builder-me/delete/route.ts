import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody } from "@/lib/builder-league/progression-api";
import { deleteOwnBuilderData } from "@/lib/builder-league/privacy-requests";

export const dynamic = "force-dynamic";

const DeleteBodySchema = z.object({ confirm: z.string().min(1).max(32) }).strict();

/**
 * POST /api/v1/builder-me/delete - the caller deletes their own Builder League data and pseudonymises
 * their history (the admin routine, scoped to the caller). Irreversible, so it is session-only (API keys
 * and MCP agents are refused), the body must be JSON (`{ "confirm": "DELETE" }`) and admins are refused.
 */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller, access } = await requireBuilderLeagueUser(request, "builder:write", db);
    if (caller.authType !== "session") {
      throw new BuilderApiError(403, "session_required", "League data can only be deleted from a signed-in session.");
    }
    enforceUserRateLimit(caller.user.id, "builder-privacy-self");
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      throw new BuilderApiError(415, "json_required", "Send the confirmation as application/json.");
    }
    const body = DeleteBodySchema.parse(await readJsonBody(request));
    const result = await deleteOwnBuilderData(db, { userId: caller.user.id, isAdmin: access.isAdmin, confirm: body.confirm });
    return ok(result);
  });
}
