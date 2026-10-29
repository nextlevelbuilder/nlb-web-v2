import { getDb } from "@/lib/db";
import { BuilderApiError, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { requireIngester } from "@/lib/builder-league/admin-key-auth";
import { INGEST_SECRET_HEADER, hasValidIngestSecret, ingestDiscordEvent } from "@/lib/builder-league/discord-ingest";
import { toEvidenceDto } from "@/lib/builder-league/evidence";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/builder-admin/ingest/discord — one Discord bot event becomes submitted evidence.
 * Auth: the shared `x-nlb-builder-ingest-secret` header, an admin API key with the `builder:ingest` scope,
 * or an admin session. Full admin API keys are refused.
 * 201 created, 200 replay of the same message, 202 ignored (with a reason). Never approves.
 */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    if (request.headers.has(INGEST_SECRET_HEADER)) {
      if (!hasValidIngestSecret(request.headers)) throw new BuilderApiError(401, "unauthorized", "Invalid ingest secret.");
    } else {
      await requireIngester(request, db);
    }
    const body = await request.json().catch(() => {
      throw new BuilderApiError(400, "invalid_json", "Send a JSON body.");
    });
    const result = await ingestDiscordEvent(db, body);
    if (result.status === "ignored") return ok({ status: "ignored", reason: result.reason }, undefined, 202);
    return ok({ status: result.status, evidence: toEvidenceDto(result.evidence, "admin") }, undefined, result.status === "created" ? 201 : 200);
  });
}
