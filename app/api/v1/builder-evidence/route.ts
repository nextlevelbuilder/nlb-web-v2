import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok, parseCursor, parseLimit, withBuilderErrors } from "@/lib/builder-league/http";
import { handleWrite, localePrefixOf } from "@/lib/builder-league/evidence-http";
import { latestAppeals, listOwnEvidence, parseEvidenceStatus, submitEvidence, toEvidenceDto } from "@/lib/builder-league/evidence";

export const dynamic = "force-dynamic";

/** The caller's own evidence, newest first. */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const { items, nextCursor } = await listOwnEvidence(db, caller.user.id, {
      status: parseEvidenceStatus(url.searchParams.get("status")),
      limit,
      cursor: parseCursor(url.searchParams.get("cursor")),
    });
    const appeals = await latestAppeals(db, items.map((item) => item.id));
    return ok(items.map((item) => toEvidenceDto(item, "owner", appeals.get(item.id))), { nextCursor, limit });
  });
}

/**
 * Submits evidence as JSON or multipart form (fields plus `files`). Idempotent on `clientKey` (or the
 * `Idempotency-Key` header): a retry returns the stored evidence with 200 instead of 201.
 */
export async function POST(request: Request) {
  return handleWrite(
    request,
    "/builder-league/evidence",
    () => requireBuilderLeagueUser(request, "builder:write", getDb()),
    async (input, { caller, actorRole }) => {
      enforceUserRateLimit(caller.user.id, "builder-evidence");
      const { evidence, created } = await submitEvidence(
        getDb(),
        { userId: caller.user.id, actorRole },
        input.body,
        { files: input.files, idempotencyKey: request.headers.get("idempotency-key") }
      );
      return {
        response: ok(toEvidenceDto(evidence, "owner"), undefined, created ? 201 : 200),
        notice: created ? "submitted" : "already_submitted",
        // Forms post from the "new" page so errors return there; success goes to the evidence itself.
        redirectTo: `${localePrefixOf(input.returnTo)}/builder-league/evidence/${evidence.id}`,
      };
    }
  );
}
