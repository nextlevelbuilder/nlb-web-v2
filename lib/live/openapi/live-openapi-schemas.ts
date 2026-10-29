/** OpenAPI component schemas for the NLB Live API (mirrors lib/live read models and route outputs). */
const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const int = { type: "integer" };
const time = { type: "string", format: "date-time" };
const nullableTime = { type: ["string", "null"], format: "date-time" };

const tally = { type: "object", properties: { topicId: str, votes: int, firstVoteAt: { type: ["integer", "null"] } } };

export const liveSchemas: Record<string, unknown> = {
  LiveError: {
    type: "object",
    properties: { error: { type: "object", required: ["code", "message"], properties: { code: str, message: str, details: {} } } },
  },
  LiveEventView: {
    type: "object",
    properties: {
      id: str, slug: str, titleEn: str, titleVi: str, descriptionEn: str, descriptionVi: str, topicId: nullableStr,
      status: { type: "string", enum: ["scheduled", "sales_open", "live", "ended", "cancelled", "archived"] },
      startsAt: time, endsAt: time, timezone: str, hostName: str, capacity: int, priceCents: int, currency: str,
      refundPolicyEn: str, refundPolicyVi: str, recordingNoticeEn: str, recordingNoticeVi: str,
      hasMemberDiscount: { type: "boolean" },
      seatsLeft: { type: ["integer", "null"], description: "Only while sales are open" },
      cancelledAt: nullableTime,
    },
  },
  LiveMyTicket: {
    type: "object",
    properties: {
      eventId: str,
      ticket: {
        type: ["object", "null"],
        properties: { id: str, status: { type: "string", enum: ["active", "refunded", "cancelled", "exception"] }, seatNo: { type: ["integer", "null"] }, exceptionReason: nullableStr },
      },
      hold: { type: ["object", "null"], properties: { reservationId: str, seatNo: int, expiresAt: time } },
    },
  },
  LiveJoinAccess: {
    type: "object",
    required: ["status", "opensAt", "endsAt"],
    properties: {
      status: { type: "string", enum: ["too_early", "open", "ended", "not_ready", "meeting_not_ready", "no_ticket"] },
      joinUrl: { type: "string", format: "uri", description: "Personal join URL; only when status is open" },
      opensAt: time,
      endsAt: time,
    },
  },
  LivePollRoundView: {
    type: "object",
    properties: {
      id: str, slug: str, titleEn: str, titleVi: str, opensAt: time, closesAt: time, timezone: str,
      status: { type: "string", enum: ["scheduled", "open", "closed", "finalized"] },
      topics: { type: "array", items: { type: "object", properties: { id: str, slug: str, titleEn: str, titleVi: str, summaryEn: str, summaryVi: str } } },
      talliesVisible: { type: "boolean" },
      tallies: { type: ["array", "null"], items: tally },
      totalVotes: { type: ["integer", "null"] },
      winnerTopicId: nullableStr,
      myVoteTopicId: nullableStr,
      viewer: {
        type: "object",
        properties: { signedIn: { type: "boolean" }, canVote: { type: "boolean" }, reason: { type: ["string", "null"], description: "authorize() deny reason when voting is not allowed" } },
      },
    },
  },
  LiveVoteResult: {
    type: "object",
    properties: { roundId: str, topicId: str, votedAt: time, changed: { type: "boolean" } },
  },
  LiveOperatorTickets: {
    type: "object",
    properties: {
      eventId: str,
      tickets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: str, eventId: str, userId: nullableStr, polarOrderId: str,
            status: { type: "string", enum: ["active", "refunded", "cancelled", "exception"] },
            seatNo: { type: ["integer", "null"] }, exceptionReason: nullableStr, createdAt: time, revokedAt: nullableTime,
          },
        },
      },
      counts: { type: "object", additionalProperties: int },
    },
  },
  LiveApproval: {
    type: "object",
    properties: { id: str, status: { type: "string", const: "pending" }, action: str, resource: str, argsHash: str, expiresAt: time },
  },
  LiveApprovalDetail: {
    type: "object",
    properties: {
      id: str, action: str, resource: str,
      args: { type: ["object", "null"], additionalProperties: true, description: "Canonical JSON arguments; sha256 of their canonical JSON is `argsHash`" },
      argsHash: str, reason: str, requestedBy: str,
      status: { type: "string", enum: ["pending", "approved", "rejected", "consumed", "expired"] },
      expiresAt: time, decidedBy: nullableStr, decidedAt: nullableTime, consumedAt: nullableTime,
    },
  },
  LiveAuditRow: {
    type: "object",
    properties: {
      id: str, actorUserId: nullableStr, actorAuthType: str, clientId: nullableStr, action: str, resource: str,
      decision: { type: "string", enum: ["allow", "deny"] }, reason: nullableStr, argsHash: nullableStr, approvalId: nullableStr,
      details: { type: ["object", "null"], additionalProperties: true }, createdAt: time,
    },
  },
};
