/**
 * OpenAPI paths for the NLB Live member API (`/api/v1/live`), merged additively into lib/openapi.ts.
 * Every route answers 404 while `LIVE_ENABLED` is off.
 */
import { CALLER_AUTH, LIVE_MEMBER_TAG, PUBLIC_AUTH, envelope, errors, json, ref, slugParam } from "./live-openapi-shared";

export const liveMemberPaths: Record<string, unknown> = {
  "/api/v1/live/events": {
    get: {
      summary: "List published Live events",
      description: "Upcoming (scheduled, on sale, live) soonest first and past (ended, archived) newest first. Drafts never appear. Public.",
      tags: [LIVE_MEMBER_TAG],
      security: PUBLIC_AUTH,
      responses: {
        "200": { description: "Events", content: envelope({ type: "object", properties: { upcoming: { type: "array", items: ref("LiveEventView") }, past: { type: "array", items: ref("LiveEventView") } } }) },
        ...errors(404),
      },
    },
  },
  "/api/v1/live/events/{slug}": {
    get: {
      summary: "Get a published Live event",
      description: "Includes `seatsLeft` while sales are open (null otherwise). Drafts and unknown slugs answer 404.",
      tags: [LIVE_MEMBER_TAG],
      security: PUBLIC_AUTH,
      parameters: [slugParam],
      responses: { "200": { description: "Event", content: envelope(ref("LiveEventView")) }, ...errors(404) },
    },
  },
  "/api/v1/live/events/{slug}/checkout": {
    post: {
      summary: "Start a Live ticket checkout",
      description:
        "Signed in, email verified, not banned, write scope (`authorize()` purchase). Holds one seat for 15 minutes and returns a Polar checkout URL bound to the buyer and that hold; repeating the call while the hold is active reuses it. Membership never includes a ticket (VIP/Premium may get a configured discount). Supports `Idempotency-Key`. Session callers must be same-site.",
      tags: [LIVE_MEMBER_TAG],
      security: CALLER_AUTH,
      parameters: [slugParam, { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 128 } }],
      requestBody: {
        required: true,
        content: json({
          type: "object",
          required: ["recordingConsent"],
          additionalProperties: false,
          properties: {
            recordingConsent: { type: "boolean", const: true, description: "Buyer accepts that the session is recorded and the replay may be sold later." },
            locale: { type: "string", enum: ["en", "vi"], description: "Locale of the success page." },
          },
        }),
      },
      responses: {
        "200": { description: "Checkout created", content: envelope({ type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, reservationExpiresAt: { type: "string", format: "date-time" } } }) },
        "400": { description: "`recording_consent_required` or invalid body" },
        "409": { description: "`sold_out`, `sales_not_open` or `already_ticketed`" },
        "502": { description: "`checkout_failed`: the payment provider refused; the hold expires on its own" },
        ...errors(401, 403, 404, 429),
      },
    },
  },
  "/api/v1/live/events/{slug}/ticket": {
    get: {
      summary: "My ticket for a Live event",
      description: "The caller's latest ticket (any status) and active seat hold. Signed in only.",
      tags: [LIVE_MEMBER_TAG],
      security: CALLER_AUTH,
      parameters: [slugParam],
      responses: { "200": { description: "Ticket status", content: envelope(ref("LiveMyTicket")) }, ...errors(401, 403, 404) },
    },
  },
  "/api/v1/live/events/{slug}/join": {
    get: {
      summary: "Join access for a Live event",
      description:
        "`authorize()` join on `live:ticket:<eventId>`: an active ticket and entitlement are required; membership never counts. Without one the status is `no_ticket`. The personal `joinUrl` is present only when `status` is `open` (15 minutes before start until the end). Responses are `Cache-Control: no-store`.",
      tags: [LIVE_MEMBER_TAG],
      security: CALLER_AUTH,
      parameters: [slugParam],
      responses: { "200": { description: "Join status", content: envelope(ref("LiveJoinAccess")) }, ...errors(401, 403, 404) },
    },
  },
  "/api/v1/live/polls/current": {
    get: {
      summary: "Current Live voting round",
      description:
        "The open round, else the next scheduled one, else the latest closed one (`data: null` when none). Counts stay hidden while a round is open. Signed-in callers see their own choice and `viewer.canVote`.",
      tags: [LIVE_MEMBER_TAG],
      security: PUBLIC_AUTH,
      responses: { "200": { description: "Round", content: envelope({ oneOf: [ref("LivePollRoundView"), { type: "null" }] }) }, ...errors(404) },
    },
  },
  "/api/v1/live/polls/{roundId}/vote": {
    post: {
      summary: "Vote in a Live round",
      description:
        "Signed in, email verified, not banned, write scope (free accounts included). One current vote per account per round; changing it rewrites the vote. Re-voting the same topic returns `changed: false`. Supports `Idempotency-Key`.",
      tags: [LIVE_MEMBER_TAG],
      security: CALLER_AUTH,
      parameters: [
        { name: "roundId", in: "path", required: true, schema: { type: "string" } },
        { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 128 } },
      ],
      requestBody: { required: true, content: json({ type: "object", required: ["topicId"], additionalProperties: false, properties: { topicId: { type: "string" } } }) },
      responses: {
        "200": { description: "Vote recorded", content: envelope(ref("LiveVoteResult")) },
        "409": { description: "`round_not_open`" },
        "422": { description: "`topic_not_in_round`" },
        ...errors(400, 401, 403, 404, 429),
      },
    },
  },
};
