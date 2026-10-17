import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { localYear } from "@/lib/builder-league/time-windows";
import { isReviewableYear, parseYearParam } from "@/lib/builder-league/wrapped-access";
import { ensureYearSnapshot, setHiddenScenes, snapshotData, toPublicYearReview, type YearlySnapshot } from "@/lib/builder-league/year-review";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ year: string }> };

function serialize(snapshot: YearlySnapshot) {
  const data = snapshotData(snapshot);
  return {
    year: snapshot.year,
    version: snapshot.version,
    status: snapshot.status,
    rulesetVersion: snapshot.rulesetVersion,
    createdAt: snapshot.createdAt.toISOString(),
    hiddenScenes: snapshot.hiddenScenes,
    review: data,
    shared: toPublicYearReview(data, snapshot.hiddenScenes),
  };
}

async function resolveYear(context: Context): Promise<number> {
  const year = parseYearParam((await context.params).year);
  if (!isReviewableYear(year, localYear(new Date()))) throw new BuilderApiError(404, "not_found", "Not found");
  return year;
}

/** GET /api/v1/builder-year/{year} — the caller's Year in Review (latest snapshot version). */
export async function GET(request: Request, context: Context) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const year = await resolveYear(context);
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const { snapshot } = await ensureYearSnapshot(db, caller.user.id, year, new Date());
    return ok(serialize(snapshot));
  });
}

const PatchBody = z.object({ hiddenScenes: z.array(z.string().max(40)).max(20) });

/** PATCH /api/v1/builder-year/{year} — choose which scenes stay out of the shared version and video. */
export async function PATCH(request: Request, context: Context) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const year = await resolveYear(context);
    const { caller, actorRole } = await requireBuilderLeagueUser(request, "builder:write", db);
    if (actorRole === "api" || actorRole === "agent") throw new BuilderApiError(403, "session_required", "Only the member can change sharing.");
    enforceUserRateLimit(caller.user.id, "builder-year");
    const body = PatchBody.parse(await request.json().catch(() => ({})));
    await ensureYearSnapshot(db, caller.user.id, year, new Date());
    const hiddenScenes = await setHiddenScenes(db, caller.user.id, year, body.hiddenScenes);
    return ok({ hiddenScenes });
  });
}
