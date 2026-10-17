import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { ok } from "@/lib/builder-league/http";
import { handleWrite } from "@/lib/builder-league/evidence-http";
import { reverseLedgerEntry } from "@/lib/builder-league/moderation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ entryId: string }> };

/** Reverses a ledger entry with a negative entry and an audit row. Idempotent per entry. */
export async function POST(request: Request, { params }: Params) {
  return handleWrite(
    request,
    "/studio/builder-league/moderation",
    () => requireBuilderLeagueAdmin(request, getDb()),
    async (input, { caller, actorRole }) => {
      const { entryId } = await params;
      const entry = await reverseLedgerEntry(getDb(), entryId, input.body, { actorId: caller.user.id, actorRole });
      return {
        response: ok({
          id: entry.id,
          userId: entry.userId,
          rp: entry.rp,
          stage: entry.stage,
          awardType: entry.awardType,
          reversesEntryId: entry.reversesEntryId,
          reason: entry.reason,
          occurredAt: entry.occurredAt.toISOString(),
          createdAt: entry.createdAt.toISOString(),
        }),
        notice: "reversed",
      };
    }
  );
}
