import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { createEventDraft } from "@/lib/live/events";
import { LIVE_EVENT_TRANSITIONS } from "@/lib/live/event-lifecycle";
import type { LiveEventStatus } from "@/lib/live/types";
import { LIVE_OPERATOR_RESOURCE, runOperatorRoute } from "@/lib/live/http/live-operator-route";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { eventCreateSchema } from "@/lib/live/http/live-operator-schemas";
import { listEventsForOperator } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(LIVE_EVENT_TRANSITIONS) as [LiveEventStatus, ...LiveEventStatus[]];
const statusSchema = z.enum(STATUSES).nullable();

/** Events newest first, drafts included (`?status=`, `?limit=` max 100). */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.event.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const status = statusSchema.parse(query.get("status"));
      const limit = parseLimit(query.get("limit"), 50, 100);
      return { resource: LIVE_OPERATOR_RESOURCE, args: { status, limit }, status, limit };
    },
    run: async ({ db }, { status, limit }) => ok(await listEventsForOperator(db, status, limit)),
  });
}

/** Create a draft event (only operators see drafts). Instants are ISO 8601 with an offset. */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    action: "live.event.create",
    prepare: async () => {
      const { body } = await readJsonObject(request);
      const input = eventCreateSchema.parse(body);
      return { resource: LIVE_OPERATOR_RESOURCE, args: body, details: { slug: input.slug }, input };
    },
    run: async ({ db, subject }, { input }) => ok(await createEventDraft({ ...input, createdBy: subject.userId }, db), undefined, 201),
  });
}
