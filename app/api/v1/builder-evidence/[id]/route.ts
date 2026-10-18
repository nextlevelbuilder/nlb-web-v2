import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { editEvidence, getEvidenceForViewer, latestAppeals, toEvidenceDto, withdrawEvidence } from "@/lib/builder-league/evidence";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Owner, admin or the named counterparty (without private files); everyone else gets 404. */
export async function GET(request: Request, { params }: Params) {
  return withBuilderErrors(async () => {
    const { id } = await params;
    const db = getDb();
    const { caller, access } = await requireBuilderLeagueUser(request, "builder:read", db);
    const { evidence, role } = await getEvidenceForViewer(db, id, { id: caller.user.id, isAdmin: access.isAdmin });
    const appeals = role === "counterparty" ? new Map() : await latestAppeals(db, [evidence.id]);
    return ok(toEvidenceDto(evidence, role, appeals.get(evidence.id)));
  });
}

/**
 * Edits or withdraws the caller's own evidence while it is `submitted` or `needs_info`.
 * `{ "action": "withdraw" }` withdraws; any other body is an edit (JSON, or multipart with new `files`).
 */
export async function PATCH(request: Request, { params }: Params) {
  return handleWrite(
    request,
    "/builder-league/evidence",
    () => requireBuilderLeagueUser(request, "builder:write", getDb()),
    async (input, { caller }) => {
      const { id } = await params;
      enforceUserRateLimit(caller.user.id, "builder-evidence");
      const db = getDb();
      const { action, ...rest } = input.body;
      if (action !== undefined && action !== "withdraw" && action !== "edit") {
        throw new BuilderApiError(400, "invalid_action", "action must be withdraw or edit.");
      }
      if (action === "withdraw") {
        const evidence = await withdrawEvidence(db, caller.user.id, id);
        return { response: ok(toEvidenceDto(evidence, "owner")), notice: "withdrawn" };
      }
      const evidence = await editEvidence(db, caller.user.id, id, rest, { files: input.files });
      return { response: ok(toEvidenceDto(evidence, "owner")), notice: "updated" };
    }
  );
}

/** HTML forms cannot send PATCH; the evidence pages post here with the same body. */
export const POST = PATCH;
