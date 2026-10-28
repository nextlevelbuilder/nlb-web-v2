import { fail, ok } from "@/lib/builder-league/http";
import { resourceKey } from "@/lib/access/types";
import { loadEvent } from "@/lib/live/events";
import { ensureEventMeeting } from "@/lib/live/meetings/meeting-service";
import { runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { getLiveMeetingProvider } from "@/lib/live/http/live-external-clients";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Ensure the hosted meeting exists for the event (created once). Only the provider meeting id is
 * returned; host start URLs and credentials never leave the server. 503 when no provider is configured.
 */
export async function POST(request: Request, { params }: Params) {
  return runOperatorRoute({
    request,
    action: "live.event.meeting",
    prepare: async () => {
      const id = requirePathParam((await params).id, "id");
      return { resource: resourceKey({ kind: "live_event", id }), args: { id }, id };
    },
    run: async ({ db }, { id }) => {
      await loadEvent(db, id);
      const provider = getLiveMeetingProvider();
      const meetingId = await ensureEventMeeting({ db, provider }, id);
      if (!meetingId) return fail(503, "meeting_provider_unavailable", undefined, "The meeting provider is not configured");
      return ok({ eventId: id, provider: provider.name, meetingId });
    },
  });
}
