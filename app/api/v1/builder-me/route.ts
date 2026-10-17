import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { getBuilderSummary } from "@/lib/builder-league/passport";
import { updatePrivacy } from "@/lib/builder-league/privacy";

export const dynamic = "force-dynamic";

// GET /api/v1/builder-me - level, rank checklist, this week's League Score and privacy of the caller
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    return ok(await getBuilderSummary(db, caller.user.id));
  });
}

const patchSchema = z
  .object({
    privacy: z
      .object({
        leaderboardPublic: z.boolean(),
        passportPublic: z.boolean(),
        wrappedPublic: z.boolean(),
        peerMentionsOk: z.boolean(),
        backfillOptIn: z.boolean(),
        redactFinancials: z.boolean(),
      })
      .partial()
      .strict(),
  })
  .strict();

// PATCH /api/v1/builder-me - update privacy opt-ins. Consent is a human decision: sessions only.
export async function PATCH(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:write", db);
    if (caller.authType !== "session") {
      throw new BuilderApiError(403, "session_required", "Privacy settings can only be changed from a signed-in session.");
    }
    enforceUserRateLimit(caller.user.id, "builder-me");
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    await updatePrivacy(db, caller.user.id, body.privacy);
    return ok(await getBuilderSummary(db, caller.user.id));
  });
}
