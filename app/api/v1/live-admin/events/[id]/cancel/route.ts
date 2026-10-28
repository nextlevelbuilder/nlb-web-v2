import { ok } from "@/lib/builder-league/http";
import { cancelEvent } from "@/lib/live/event-cancellation";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { eventCancelSchema } from "@/lib/live/http/live-operator-schemas";
import { cancelTarget } from "@/lib/live/http/live-sensitive-targets";
import { getLiveMeetingProvider } from "@/lib/live/http/live-external-clients";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Cancel an event (sensitive `live.event.cancel`): needs an approval for `{ action: "live.event.cancel",
 * target: { eventId } }` decided by a different operator. Active tickets are cancelled, entitlements
 * revoked, holds released and seats freed in one batch; meeting registrants are cancelled best-effort
 * (the sweep retries). Paid orders are refunded through `/tickets/{id}/refund`.
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.cancel",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      const { approvalId } = eventCancelSchema.parse((await readJsonObject(request)).body);
      return { ...cancelTarget(id), approvalId, id };
    },
    run: async ({ db, now }, { id }) => {
      const result = await cancelEvent(id, db, { now, provider: getLiveMeetingProvider() });
      return ok({ eventId: id, status: "cancelled", ...result });
    },
  });
}
