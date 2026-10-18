import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { listPilotMembers, updatePilotMembers } from "@/lib/builder-league/moderation";

export const dynamic = "force-dynamic";

/** Pilot allowlist (who may use the league while `BUILDER_LEAGUE_ENABLED` is off). */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireBuilderLeagueAdmin(request, db);
    const rows = await listPilotMembers(db);
    return ok(rows.map((row) => ({ ...row, addedAt: row.addedAt.toISOString() })));
  });
}

/** `{ action: "add" | "remove", userId | email, note? }`; audited, idempotent. */
export async function POST(request: Request) {
  return handleWrite(
    request,
    "/studio/builder-league/moderation",
    () => requireBuilderLeagueAdmin(request, getDb()),
    async (input, { caller, actorRole }) => {
      const result = await updatePilotMembers(getDb(), input.body, { actorId: caller.user.id, actorRole });
      return { response: ok(result), notice: result.action === "add" ? "pilot_added" : "pilot_removed" };
    }
  );
}
