import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, withBuilderErrors } from "@/lib/builder-league/http";
import { getEvidence } from "@/lib/builder-league/evidence";
import { evidenceFileName, evidenceFileResponse, getEvidenceBucket, isEvidenceFileName } from "@/lib/builder-league/evidence-storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; key: string }> };

const notFound = () => new BuilderApiError(404, "not_found", "Not found");

/**
 * Streams a private evidence file to the evidence owner or an admin, never cached
 * (`Cache-Control: private, no-store`). Everyone else, the counterparty included, gets 404.
 */
export async function GET(request: Request, { params }: Params) {
  return withBuilderErrors(async () => {
    const { id, key } = await params;
    const db = getDb();
    const { caller, access } = await requireBuilderLeagueUser(request, "builder:read", db);
    if (!isEvidenceFileName(key)) throw notFound();
    const evidence = await getEvidence(db, id);
    if (!evidence || (evidence.userId !== caller.user.id && !access.isAdmin)) throw notFound();
    const objectKey = evidence.privateObjectKeys.find((stored) => evidenceFileName(stored) === key);
    if (!objectKey) throw notFound();
    const response = await evidenceFileResponse(getEvidenceBucket(), objectKey);
    if (!response) throw notFound();
    return response;
  });
}
