import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { ok } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { toEvidenceDto } from "@/lib/builder-league/evidence";
import { toAwardDto } from "@/lib/builder-league/moderation";
import { resolveAppeal, toAppealDto } from "@/lib/builder-league/appeals";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Resolves the latest appeal of an evidence: `uphold` keeps the rejection, `overturn` approves it. */
export async function POST(request: Request, { params }: Params) {
  return handleWrite(
    request,
    "/studio/builder-league/moderation",
    () => requireBuilderLeagueAdmin(request, getDb()),
    async (input, { caller, actorRole }) => {
      const { id } = await params;
      const { appealId, ...body } = input.body;
      const result = await resolveAppeal(
        getDb(),
        { evidenceId: id, appealId: typeof appealId === "string" ? appealId : undefined },
        body,
        { actorId: caller.user.id, actorRole }
      );
      return {
        response: ok({
          appeal: toAppealDto(result.appeal),
          evidence: result.approval ? toEvidenceDto(result.approval.evidence, "admin") : null,
          award: result.approval ? toAwardDto(result.approval.award) : null,
        }),
        notice: result.appeal.status === "overturned" ? "appeal_overturned" : "appeal_upheld",
      };
    }
  );
}
