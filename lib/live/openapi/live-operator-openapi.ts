/**
 * OpenAPI paths for the NLB Live operator API (`/api/v1/live-admin`), merged additively into
 * lib/openapi.ts. Every call needs a live `live:manage` operator grant (session, or MCP delegation with
 * `mcp:operator`; API keys are refused) and writes an audit row, allowed or denied. Works with
 * `LIVE_ENABLED` off. Sensitive actions need an `approvalId` from `POST /api/v1/live-admin/approvals`.
 */
import { LIVE_OPERATOR_TAG, OPERATOR_AUTH, envelope, errors, idParam, json, pagedEnvelope, ref } from "./live-openapi-shared";

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, required, properties });
const str = { type: "string" };
const int = { type: "integer" };
const instant = { type: "string", format: "date-time", description: "ISO 8601 with an explicit offset, e.g. 2026-11-02T20:00:00+07:00" };
const anyData = { type: "object", additionalProperties: true };
const approval = { approvalId: { type: "string", description: "Approved, unconsumed approval requested by this operator for exactly these arguments" } };

function op(summary: string, description: string, options: { body?: unknown; params?: unknown[]; status?: string; data?: unknown; extra?: Record<string, unknown> } = {}) {
  return {
    summary,
    description,
    tags: [LIVE_OPERATOR_TAG],
    security: OPERATOR_AUTH,
    ...(options.params ? { parameters: options.params } : {}),
    ...(options.body ? { requestBody: { required: true, content: json(options.body) } } : {}),
    responses: {
      [options.status ?? "200"]: { description: "OK", content: envelope(options.data ?? anyData) },
      ...errors(400, 401, 403, 404, 409),
      ...(options.extra ?? {}),
    },
  };
}

const eventFields = {
  titleEn: str, titleVi: str, descriptionEn: str, descriptionVi: str,
  topicId: { type: ["string", "null"] }, pollRoundId: { type: ["string", "null"] },
  startsAt: instant, endsAt: instant, hostName: str, capacity: int, priceCents: int,
  currency: { type: "string", pattern: "^[a-z]{3}$" },
  premiumDiscountId: { type: ["string", "null"] }, vipDiscountId: { type: ["string", "null"] },
  refundPolicyEn: str, refundPolicyVi: str, recordingNoticeEn: str, recordingNoticeVi: str,
};

export const liveOperatorPaths: Record<string, unknown> = {
  "/api/v1/live-admin/topic-groups": {
    get: op("List topic groups", "Every group (archived included) with its topics."),
    post: op("Create a topic group", "Slugs are lowercase words joined by single dashes.", {
      body: object({ slug: str, titleEn: str, titleVi: str, sortOrder: int }, ["slug", "titleEn", "titleVi"]),
      status: "201",
    }),
  },
  "/api/v1/live-admin/topic-groups/{id}": {
    patch: op("Update a topic group", "Titles and sort order; the slug is fixed.", { params: [idParam], body: object({ titleEn: str, titleVi: str, sortOrder: int }) }),
  },
  "/api/v1/live-admin/topic-groups/{id}/archive": {
    post: op("Archive a topic group", "Archives the group and every topic in it.", { params: [idParam] }),
  },
  "/api/v1/live-admin/topics": {
    get: op("List topics", "Archived included; `?groupId=` filters by group.", { params: [{ name: "groupId", in: "query", schema: str }] }),
    post: op("Create a topic", "The group must be active.", {
      body: object({ groupId: str, slug: str, titleEn: str, titleVi: str, summaryEn: str, summaryVi: str }, ["groupId", "slug", "titleEn", "titleVi"]),
      status: "201",
    }),
  },
  "/api/v1/live-admin/topics/{id}": {
    patch: op("Update a topic", "Titles and summaries.", { params: [idParam], body: object({ titleEn: str, titleVi: str, summaryEn: str, summaryVi: str }) }),
  },
  "/api/v1/live-admin/topics/{id}/archive": {
    post: op("Archive a topic", "Archived topics stay on past rounds and cannot join new ones.", { params: [idParam] }),
  },
  "/api/v1/live-admin/rounds": {
    get: op("List voting rounds", "Newest first with the clock-derived status.", { params: [{ name: "limit", in: "query", schema: int }] }),
    post: op(
      "Create a voting round",
      "Give `opensAt`/`closesAt`, or a local `window` in Asia/Ho_Chi_Minh (`opensOn` YYYY-MM-DD, `opensAt`/`closesAt` HH:mm, `days` default 7). Windows never overlap another round.",
      {
        body: object(
          {
            slug: str, titleEn: str, titleVi: str, topicIds: { type: "array", items: str, minItems: 1, maxItems: 50 },
            opensAt: instant, closesAt: instant,
            window: object({ opensOn: str, opensAt: str, closesAt: str, days: int }, ["opensOn", "opensAt"]),
          },
          ["slug", "titleEn", "titleVi", "topicIds"]
        ),
        status: "201",
      }
    ),
  },
  "/api/v1/live-admin/rounds/{id}/finalize": {
    post: op("Finalize a closed round", "Freezes the ranked result once; later calls return the stored snapshot.", { params: [idParam] }),
  },
  "/api/v1/live-admin/rounds/{id}/override": {
    post: op("Override a round winner (sensitive)", "`live.poll.override`; approval target `{ roundId, topicId }`. The counted snapshot is kept.", {
      params: [idParam],
      body: object({ topicId: str, reason: str, ...approval }, ["topicId", "reason", "approvalId"]),
    }),
  },
  "/api/v1/live-admin/events": {
    get: op("List events", "Newest first, drafts included.", { params: [{ name: "status", in: "query", schema: str }, { name: "limit", in: "query", schema: int }] }),
    post: op("Create a draft event", "Only operators see drafts.", {
      body: object({ slug: str, ...eventFields }, ["slug", "titleEn", "titleVi", "startsAt", "endsAt", "hostName", "capacity", "priceCents"]),
      status: "201",
    }),
  },
  "/api/v1/live-admin/events/{id}": {
    get: op("Get an event", "Drafts included.", { params: [idParam] }),
    patch: op("Update an event", "Price, currency and capacity lock once sales open (capacity grows through /capacity).", { params: [idParam], body: object(eventFields) }),
  },
  "/api/v1/live-admin/events/{id}/polar-product": {
    post: op("Ensure the Polar ticket product", "Draft or scheduled events only; idempotent. Locks the price.", {
      params: [idParam],
      extra: { "502": { description: "`polar_product_failed`" } },
    }),
  },
  "/api/v1/live-admin/events/{id}/open-sales": {
    post: op("Open ticket sales", "`scheduled → sales_open`; needs the Polar product and both recording notices; creates the seat rows.", { params: [idParam] }),
  },
  "/api/v1/live-admin/events/{id}/transition": {
    post: op("Transition an event", "`to`: scheduled, live, ended or archived (state machine enforced).", {
      params: [idParam],
      body: object({ to: { type: "string", enum: ["scheduled", "live", "ended", "archived"] } }, ["to"]),
    }),
  },
  "/api/v1/live-admin/events/{id}/capacity": {
    post: op("Set event capacity", "Only grows once sales are open.", { params: [idParam], body: object({ capacity: int }, ["capacity"]) }),
  },
  "/api/v1/live-admin/events/{id}/cancel": {
    post: op("Cancel an event (sensitive)", "`live.event.cancel`; approval target `{ eventId }`. Revokes tickets and entitlements, frees seats; refunds go through Polar.", {
      params: [idParam],
      body: object(approval, ["approvalId"]),
    }),
  },
  "/api/v1/live-admin/events/{id}/meeting": {
    post: op("Ensure the hosted meeting", "Creates the provider meeting once and returns only its id.", {
      params: [idParam],
      extra: { "502": { description: "`meeting_provider_failed`" }, "503": { description: "`meeting_provider_unavailable`" } },
    }),
  },
  "/api/v1/live-admin/events/{id}/tickets": {
    get: op("List an event's tickets", "Exceptions first; ids, status, seat, Polar order id and user id only.", { params: [idParam], data: ref("LiveOperatorTickets") }),
  },
  "/api/v1/live-admin/tickets/{id}/refund": {
    post: op(
      "Refund a ticket through Polar (sensitive)",
      "`live.ticket.refund`; approval target `{ ticketId }`. Requests a refund of what is left on the Polar order; the local ticket is unchanged until the `order.refunded` webhook arrives.",
      {
        params: [idParam],
        body: object(
          {
            ...approval,
            reason: { type: "string", enum: ["duplicate", "fraudulent", "customer_request", "service_disruption", "satisfaction_guarantee", "other"], default: "customer_request" },
            comment: str,
          },
          ["approvalId"]
        ),
        status: "202",
        extra: { "502": { description: "`refund_failed`" } },
      }
    ),
  },
  "/api/v1/live-admin/approvals": {
    post: op(
      "Request an approval",
      "For `live.ticket.refund` (`target: { ticketId }`), `live.event.cancel` (`{ eventId }`) or `live.poll.override` (`{ roundId, topicId }`). A different operator must approve it; it expires after `ttlMinutes` (default 30) and is consumed once by the requester.",
      {
        body: object(
          {
            action: { type: "string", enum: ["live.ticket.refund", "live.event.cancel", "live.poll.override"] },
            target: { type: "object", additionalProperties: { type: "string" } },
            reason: str,
            ttlMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          },
          ["action", "target", "reason"]
        ),
        status: "201",
        data: ref("LiveApproval"),
      }
    ),
  },
  "/api/v1/live-admin/approvals/{id}/decision": {
    post: op("Decide an approval", "Approve or reject; never one's own request.", {
      params: [idParam],
      body: object({ decision: { type: "string", enum: ["approve", "reject"] } }, ["decision"]),
    }),
  },
  "/api/v1/live-admin/audit": {
    get: {
      ...op("Read the operator audit trail", "Newest first; `?resource=` exact resource string; cursor paginated.", {
        params: [{ name: "resource", in: "query", schema: str }, { name: "cursor", in: "query", schema: str }, { name: "limit", in: "query", schema: int }],
      }),
      responses: { "200": { description: "Audit rows", content: pagedEnvelope({ type: "array", items: ref("LiveAuditRow") }) }, ...errors(400, 401, 403) },
    },
  },
  "/api/v1/live-admin/metrics": {
    get: op("Live funnel metrics", "Voters per round; holds, tickets by status and attendees per event. Counts only.", { params: [{ name: "limit", in: "query", schema: int }] }),
  },
  "/api/v1/live-admin/sweeps": {
    post: op("Run the Live sweep", "Releases expired holds and cancels provider registrants of revoked tickets (also run every minute by cron)."),
  },
};
