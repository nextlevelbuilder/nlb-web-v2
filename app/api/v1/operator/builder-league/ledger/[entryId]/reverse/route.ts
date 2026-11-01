import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { reverseLedgerEntry } from "@/lib/builder-league/moderation";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { ledgerReverseTarget, ledgerReverseTargetSchema } from "@/lib/operators/http/operator-sensitive-targets";

export const dynamic = "force-dynamic";

const bodySchema = ledgerReverseTargetSchema.omit({ entryId: true }).extend({ approvalId: z.string().trim().min(1).max(200) }).strict();

/**
 * Reverse a ledger entry with a negative entry (sensitive `builder_league.ledger.reverse`). Idempotent
 * per entry. Needs an approval for `{ entryId, reason }` decided by a different operator.
 */
export async function POST(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  return runOperatorRoute({
    request,
    domain: "builder_league",
    action: "builder_league.ledger.reverse",
    prepare: async ({ db }) => {
      const entryId = requirePathParam((await params).entryId, "entryId");
      const { approvalId, reason } = bodySchema.parse((await readJsonObject(request)).body);
      return { ...(await ledgerReverseTarget(db, { entryId, reason })), approvalId, entryId, reason };
    },
    run: async ({ db, subject }, { entryId, reason }) => {
      const entry = await reverseLedgerEntry(db, entryId, { reason }, { actorId: subject.userId, actorRole: "admin" });
      return ok({
        id: entry.id,
        userId: entry.userId,
        rp: entry.rp,
        stage: entry.stage,
        awardType: entry.awardType,
        reversesEntryId: entry.reversesEntryId,
        reason: entry.reason,
        occurredAt: entry.occurredAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
      });
    },
  });
}
