import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { revokeShareLink, serializeShareLink } from "@/lib/builder-league/share-links";
import { parseYearParam } from "@/lib/builder-league/wrapped-access";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/builder-year/{year}/share/{id} — revokes one of the caller's share links. */
export async function DELETE(request: Request, context: { params: Promise<{ year: string; id: string }> }) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { year: rawYear, id } = await context.params;
    const year = parseYearParam(rawYear);
    const { caller } = await requireBuilderLeagueUser(request, "builder:write", db);
    const link = await revokeShareLink(db, caller.user.id, id, new Date(), { year });
    return ok({ link: serializeShareLink(link) });
  });
}
