import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { readJsonBody, serializeCapsuleEntry } from "@/lib/builder-league/progression-api";
import { getCapsuleYear, saveCapsuleEntry, writableYears, type CapsuleInput } from "@/lib/builder-league/time-capsule";

export const dynamic = "force-dynamic";

function parseYear(value: string | null): number {
  if (!value) return writableYears()[1];
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BuilderApiError(400, "invalid_year", "Year must be between 2000 and 2100.");
  }
  return year;
}

/** The caller's intent, reflection and version history for `?year=` (default: this year, Vietnam time). */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const capsule = await getCapsuleYear(db, caller.user.id, parseYear(new URL(request.url).searchParams.get("year")));
    return ok({
      year: capsule.year,
      writableYears: writableYears(),
      intent: serializeCapsuleEntry(capsule.intent),
      reflection: serializeCapsuleEntry(capsule.reflection),
      history: capsule.history.map(serializeCapsuleEntry),
    });
  });
}

/** Saves a new version of the caller's intent or reflection. */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:write", db);
    enforceUserRateLimit(caller.user.id, "builder-time-capsule");
    // `saveCapsuleEntry` validates the body with `capsuleInputSchema`.
    const entry = await saveCapsuleEntry(db, caller.user.id, (await readJsonBody(request)) as CapsuleInput);
    return ok(serializeCapsuleEntry(entry), undefined, 201);
  });
}
