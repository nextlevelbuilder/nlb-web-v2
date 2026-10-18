import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { enforceUserRateLimit, ok } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { createAppeal, toAppealDto } from "@/lib/builder-league/appeals";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Appeals the caller's own rejected evidence; one appeal per rejection, never two open at once. */
export async function POST(request: Request, { params }: Params) {
  return handleWrite(
    request,
    "/builder-league/evidence",
    () => requireBuilderLeagueUser(request, "builder:write", getDb()),
    async (input, { caller }) => {
      const { id } = await params;
      enforceUserRateLimit(caller.user.id, "builder-appeal");
      const appeal = await createAppeal(getDb(), caller.user.id, id, input.body);
      return { response: ok(toAppealDto(appeal), undefined, 201), notice: "appealed" };
    }
  );
}
