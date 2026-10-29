import { BuilderEnvelopeSchema, BuilderErrorSchema } from "@nextlevelbuilder/contracts";
import { ToolError, type ToolContext } from "../tool-context.js";
import type { McpToolDefinition, resolveToolEnv } from "./index.js";

type ResolveToolEnv = typeof resolveToolEnv;
type JsonSchemaProps = Record<string, unknown>;
type Args = Record<string, unknown>;

/** Tool arguments that select the endpoint and credentials rather than the request itself. */
const CREDENTIAL_KEYS = ["api_url", "session_cookie"] as const;

const credentialProps: JsonSchemaProps = {
  api_url: { type: "string", description: "Allowed directory API endpoint (optional)" },
  session_cookie: {
    type: "string",
    description: "Operator's Better Auth session cookie (or NLB_SESSION_COOKIE) for stdio and Worker callers. OAuth calls act as the signed-in operator and refuse it. API keys are refused."
  }
};

const AUTH_NOTE = "Platform operator with the live:manage grant only: OAuth with the mcp:operator scope (offered only to operators at consent) or an operator's session cookie. API keys are refused and every call is audited.";
const APPROVAL_NOTE = "Sensitive: needs approvalId of an approval another operator approved for exactly this target (live_admin_request_approval, then live_admin_decide_approval by a second operator). Without it the API answers 409 approval_required.";

const LIVE_EVENT_STATUSES = ["draft", "scheduled", "sales_open", "live", "ended", "cancelled", "archived"] as const;
const APPROVAL_STATUSES = ["pending", "approved", "rejected", "consumed", "expired"] as const;
const SENSITIVE_ACTIONS = ["live.ticket.refund", "live.event.cancel", "live.poll.override"] as const;
const REFUND_REASONS = ["duplicate", "fraudulent", "customer_request", "service_disruption", "satisfaction_guarantee", "other"] as const;

interface LiveCall {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** The path names one item, so a 404 means it does not exist. */
  resource?: boolean;
}

function isAnonymousWorker(context?: ToolContext): boolean {
  return context !== undefined && !context.oauth && context.workerAuth !== true;
}

function resolveSessionCookie(args: Args, context?: ToolContext): string | undefined {
  if (context?.oauth) return undefined;
  if (typeof args.session_cookie === "string" && args.session_cookie.trim()) return args.session_cookie.trim();
  return typeof process !== "undefined" ? process.env?.NLB_SESSION_COOKIE?.trim() || undefined : undefined;
}

/** Splits credentials from request arguments and refuses unknown or missing ones (the API refuses unknown body keys too). */
function splitArgs(tool: string, inputSchema: McpToolDefinition["inputSchema"], args: Args): { credentials: Args; rest: Args } {
  const credentials: Args = {};
  const rest: Args = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if ((CREDENTIAL_KEYS as readonly string[]).includes(key)) {
      if (value !== undefined && typeof value !== "string") throw new ToolError(`Invalid arguments: ${key} must be a string`, { details: [{ path: key, message: "Expected string" }] });
      credentials[key] = value;
    } else if (key in inputSchema.properties) {
      if (value !== undefined) rest[key] = value;
    } else {
      unknown.push(key);
    }
  }
  const missing = (inputSchema.required ?? []).filter((key) => rest[key] === undefined);
  const details = [
    ...unknown.map((path) => ({ path, message: "Unknown argument" })),
    ...missing.map((path) => ({ path, message: "Required" }))
  ];
  if (details.length) {
    throw new ToolError(`Invalid arguments for ${tool}: ${details.map((d) => `${d.path}: ${d.message}`).join("; ")}`, { details });
  }
  return { credentials, rest };
}

const LiveErrorSchema = BuilderErrorSchema;

async function liveRequest(resolveEnv: ResolveToolEnv, credentials: Args, context: ToolContext | undefined, call: LiveCall): Promise<unknown> {
  // The configured API key is never sent: operator routes refuse API keys outright.
  const { apiUrl } = resolveEnv({ api_url: credentials.api_url }, context);
  const headers: Record<string, string> = { Accept: "application/json" };
  const cookie = resolveSessionCookie(credentials, context);
  if (cookie) headers.Cookie = cookie;
  if (call.body !== undefined) headers["Content-Type"] = "application/json";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(call.query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.size ? `?${params.toString()}` : "";

  const response = await (context?.fetch ?? fetch)(`${apiUrl}${call.path}${search}`, {
    method: call.method,
    headers,
    body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    const parsed = LiveErrorSchema.safeParse(json);
    const code = parsed.success ? parsed.data.error.code : undefined;
    const message = parsed.success
      ? parsed.data.error.message
      : response.status === 404 && call.resource ? "Not found" : (text.trim().slice(0, 500) || response.statusText || "Request failed");
    const data: Record<string, unknown> = { status: response.status };
    if (code !== undefined) data.code = code;
    if (parsed.success && parsed.data.error.details !== undefined) data.details = parsed.data.error.details;
    if (response.status === 401 || code === "not_operator") {
      data.hint = context?.oauth
        ? "This account needs an unrevoked live:manage operator grant and a connection authorized with mcp:operator. Reconnect the MCP client after the grant is added."
        : "Operator tools need an operator's signed-in session cookie (session_cookie or NLB_SESSION_COOKIE), or OAuth with mcp:operator.";
    }
    throw new ToolError(`NLB Live operator API error (HTTP ${response.status}${code ? ` ${code}` : ""}: ${message})`, data);
  }
  if (json === undefined) throw new Error(`NLB Live operator API returned a non-JSON response for ${call.path}`);
  const envelope = BuilderEnvelopeSchema.safeParse(json);
  if (!envelope.success) throw new Error(`NLB Live operator API response schema mismatch for ${call.path}: ${envelope.error.message}`);
  return json;
}

const enc = encodeURIComponent;
const pathId = (value: unknown) => enc(String(value));

// --- JSON Schema fragments ---

const idProp = (description: string) => ({ type: "string", minLength: 1, maxLength: 200, description });
const limitProp = (max = 100) => ({ type: "integer", minimum: 1, maximum: max });
const instantProp = (description: string) => ({ type: "string", format: "date-time", description: `${description}. ISO 8601 with an explicit offset, e.g. 2026-11-02T20:00:00+07:00` });
const approvalIdProp = idProp("Id of an approved approval for this exact target (from live_admin_request_approval)");
const title = { type: "string", maxLength: 200 };
const longText = (max: number) => ({ type: "string", maxLength: max });
const nullableId = (description: string) => ({ type: ["string", "null"], maxLength: 200, description });

const eventFieldProps: JsonSchemaProps = {
  titleEn: title,
  titleVi: title,
  descriptionEn: longText(10000),
  descriptionVi: longText(10000),
  topicId: nullableId("Topic id the event covers"),
  pollRoundId: nullableId("Voting round the topic came from"),
  startsAt: instantProp("Start"),
  endsAt: instantProp("End"),
  hostName: title,
  capacity: { type: "integer", minimum: 1, description: "Seats" },
  priceCents: { type: "integer", minimum: 1, description: "Price in minor units" },
  currency: { type: "string", pattern: "^[a-z]{3}$", description: "Lowercase ISO currency code (default usd)" },
  premiumDiscountId: nullableId("Polar discount for Premium members"),
  vipDiscountId: nullableId("Polar discount for VIP members"),
  refundPolicyEn: longText(5000),
  refundPolicyVi: longText(5000),
  recordingNoticeEn: longText(5000),
  recordingNoticeVi: longText(5000)
};

function schema(properties: JsonSchemaProps, required: string[] = []): McpToolDefinition["inputSchema"] {
  return { type: "object", properties: { ...properties, ...credentialProps }, ...(required.length ? { required } : {}) };
}

/** Request arguments without the path id(s) the tool takes in snake_case. */
function bodyOf(args: Args, ...pathKeys: string[]): Args {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !pathKeys.includes(key)));
}

const ADMIN = "/api/v1/live-admin";

/**
 * Builds the NLB Live operator tools (`/api/v1/live-admin/*`, scope `mcp:operator`). The web is the
 * authority: it checks the operator grant, audits every call and enforces two-person approval for refunds,
 * cancellations and winner overrides, so no tool here can act alone on those.
 */
export function createLiveOperatorTools(resolveEnv: ResolveToolEnv): McpToolDefinition[] {
  function define(
    name: string,
    description: string,
    inputSchema: McpToolDefinition["inputSchema"],
    build: (args: Args) => LiveCall
  ): McpToolDefinition {
    return {
      name,
      description: `${description} ${AUTH_NOTE}`,
      inputSchema,
      handler: async (args, context) => {
        if (isAnonymousWorker(context)) {
          throw new ToolError(`Unauthorized: Tool '${name}' is for platform operators and requires a valid Worker authorization token.`, { status: 401 });
        }
        const { credentials, rest } = splitArgs(name, inputSchema, args);
        return liveRequest(resolveEnv, credentials, context, build(rest));
      }
    };
  }

  return [
    // --- Reads ---
    define("live_admin_list_events", "List Live events newest first, drafts included.",
      schema({ status: { type: "string", enum: [...LIVE_EVENT_STATUSES] }, limit: limitProp() }),
      (a) => ({ method: "GET", path: `${ADMIN}/events`, query: { status: a.status as string | undefined, limit: a.limit as number | undefined } })),
    define("live_admin_get_event", "Get one Live event with its operator fields (Polar product, meeting state, capacity).",
      schema({ event_id: idProp("Event id") }, ["event_id"]),
      (a) => ({ method: "GET", path: `${ADMIN}/events/${pathId(a.event_id)}`, resource: true })),
    define("live_admin_list_event_tickets", "Ticket ledger of an event for reconciliation: every ticket (exceptions first) with id, status, seat, Polar order id and user id only, plus counts by status.",
      schema({ event_id: idProp("Event id") }, ["event_id"]),
      (a) => ({ method: "GET", path: `${ADMIN}/events/${pathId(a.event_id)}/tickets`, resource: true })),
    define("live_admin_list_topic_groups", "List every topic group, archived included, with its topics.", schema({}),
      () => ({ method: "GET", path: `${ADMIN}/topic-groups` })),
    define("live_admin_list_topics", "List topics, optionally of one group.",
      schema({ groupId: idProp("Only topics of this group") }),
      (a) => ({ method: "GET", path: `${ADMIN}/topics`, query: { groupId: a.groupId as string | undefined } })),
    define("live_admin_list_rounds", "List voting rounds newest first with their clock-derived status.",
      schema({ limit: limitProp() }),
      (a) => ({ method: "GET", path: `${ADMIN}/rounds`, query: { limit: a.limit as number | undefined } })),
    define("live_admin_list_approvals", "List two-person approvals newest first (default status pending). Each shows action, resource, canonical arguments, reason and requester. Keyset pagination: pass pagination.nextCursor as cursor.",
      schema({ status: { type: "string", enum: [...APPROVAL_STATUSES] }, limit: limitProp(), cursor: { type: "string" } }),
      (a) => ({ method: "GET", path: `${ADMIN}/approvals`, query: { status: a.status as string | undefined, limit: a.limit as number | undefined, cursor: a.cursor as string | undefined } })),
    define("live_admin_get_approval", "Get one approval with what it covers and its effective status.",
      schema({ approval_id: idProp("Approval id") }, ["approval_id"]),
      (a) => ({ method: "GET", path: `${ADMIN}/approvals/${pathId(a.approval_id)}`, resource: true })),
    define("live_admin_list_audit", "Read the operator audit trail newest first (actor ids, actions, decisions, argument hashes; no member personal data).",
      schema({ resource: { type: "string", maxLength: 300, description: "Exact resource string, e.g. live:event:<id>" }, limit: limitProp(), cursor: { type: "string" } }),
      (a) => ({ method: "GET", path: `${ADMIN}/audit`, query: { resource: a.resource as string | undefined, limit: a.limit as number | undefined, cursor: a.cursor as string | undefined } })),
    define("live_admin_get_metrics", "Read Live funnel aggregates: voters per round, holds, tickets by status and attendees per event. Counts only.",
      schema({ limit: limitProp() }),
      (a) => ({ method: "GET", path: `${ADMIN}/metrics`, query: { limit: a.limit as number | undefined } })),

    // --- Topics and voting rounds ---
    define("live_admin_create_topic_group", "Create a topic group.",
      schema({ slug: { type: "string", maxLength: 120 }, titleEn: title, titleVi: title, sortOrder: { type: "integer" } }, ["slug", "titleEn", "titleVi"]),
      (a) => ({ method: "POST", path: `${ADMIN}/topic-groups`, body: a })),
    define("live_admin_update_topic_group", "Update a topic group's titles or sort order.",
      schema({ group_id: idProp("Topic group id"), titleEn: title, titleVi: title, sortOrder: { type: "integer" } }, ["group_id"]),
      (a) => ({ method: "PATCH", path: `${ADMIN}/topic-groups/${pathId(a.group_id)}`, body: bodyOf(a, "group_id"), resource: true })),
    define("live_admin_archive_topic_group", "Archive a topic group (idempotent).",
      schema({ group_id: idProp("Topic group id") }, ["group_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/topic-groups/${pathId(a.group_id)}/archive`, resource: true })),
    define("live_admin_create_topic", "Create a topic in a group.",
      schema({ groupId: idProp("Topic group id"), slug: { type: "string", maxLength: 120 }, titleEn: title, titleVi: title, summaryEn: longText(2000), summaryVi: longText(2000) }, ["groupId", "slug", "titleEn", "titleVi"]),
      (a) => ({ method: "POST", path: `${ADMIN}/topics`, body: a })),
    define("live_admin_update_topic", "Update a topic's titles or summaries.",
      schema({ topic_id: idProp("Topic id"), titleEn: title, titleVi: title, summaryEn: longText(2000), summaryVi: longText(2000) }, ["topic_id"]),
      (a) => ({ method: "PATCH", path: `${ADMIN}/topics/${pathId(a.topic_id)}`, body: bodyOf(a, "topic_id"), resource: true })),
    define("live_admin_archive_topic", "Archive a topic: it stays attached to past rounds but cannot join new ones.",
      schema({ topic_id: idProp("Topic id") }, ["topic_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/topics/${pathId(a.topic_id)}/archive`, resource: true })),
    define("live_admin_create_round", "Open a voting round over active topics. Give opensAt and closesAt, or a local window in Asia/Ho_Chi_Minh ({ opensOn: \"2026-11-02\", opensAt: \"09:00\", days: 7 }). Windows of two rounds never overlap.",
      schema({
        slug: { type: "string", maxLength: 120 },
        titleEn: title,
        titleVi: title,
        topicIds: { type: "array", minItems: 1, maxItems: 50, items: { type: "string", minLength: 1, maxLength: 200 } },
        opensAt: instantProp("Voting opens"),
        closesAt: instantProp("Voting closes"),
        window: {
          type: "object",
          additionalProperties: false,
          required: ["opensOn", "opensAt"],
          properties: {
            opensOn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD" },
            opensAt: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "HH:mm" },
            closesAt: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "HH:mm" },
            days: { type: "integer", minimum: 1, maximum: 31 }
          }
        }
      }, ["slug", "titleEn", "titleVi", "topicIds"]),
      (a) => ({ method: "POST", path: `${ADMIN}/rounds`, body: a })),
    define("live_admin_finalize_round", "Freeze the result of a closed round; later calls return the stored snapshot.",
      schema({ round_id: idProp("Round id") }, ["round_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/rounds/${pathId(a.round_id)}/finalize`, resource: true })),
    define("live_admin_override_round_winner", `Replace the winner of a finalized round. ${APPROVAL_NOTE}`,
      schema({ round_id: idProp("Round id"), topicId: idProp("New winning topic id"), reason: { type: "string", minLength: 1, maxLength: 500 }, approvalId: approvalIdProp }, ["round_id", "topicId", "reason"]),
      (a) => ({ method: "POST", path: `${ADMIN}/rounds/${pathId(a.round_id)}/override`, body: bodyOf(a, "round_id"), resource: true })),

    // --- Events ---
    define("live_admin_create_event", "Create a draft Live event (only operators see drafts).",
      schema({ slug: { type: "string", maxLength: 120 }, ...eventFieldProps }, ["slug", "titleEn", "titleVi", "startsAt", "endsAt", "hostName", "capacity", "priceCents"]),
      (a) => ({ method: "POST", path: `${ADMIN}/events`, body: a })),
    define("live_admin_update_event", "Edit a draft or scheduled event. Price and currency lock once its Polar product exists; once sales open, capacity only grows through live_admin_set_event_capacity. Live and later events are read-only.",
      schema({ event_id: idProp("Event id"), ...eventFieldProps }, ["event_id"]),
      (a) => ({ method: "PATCH", path: `${ADMIN}/events/${pathId(a.event_id)}`, body: bodyOf(a, "event_id"), resource: true })),
    define("live_admin_set_event_capacity", "Set the seat capacity of an event: any value from 1 before sales; once on sale it can only grow.",
      schema({ event_id: idProp("Event id"), capacity: { type: "integer", minimum: 1 } }, ["event_id", "capacity"]),
      (a) => ({ method: "POST", path: `${ADMIN}/events/${pathId(a.event_id)}/capacity`, body: bodyOf(a, "event_id"), resource: true })),
    define("live_admin_transition_event", "Move an event along its lifecycle: draft → scheduled, sales_open → live → ended → archived. Opening sales and cancelling have their own tools.",
      schema({ event_id: idProp("Event id"), to: { type: "string", enum: ["scheduled", "live", "ended", "archived"] } }, ["event_id", "to"]),
      (a) => ({ method: "POST", path: `${ADMIN}/events/${pathId(a.event_id)}/transition`, body: bodyOf(a, "event_id"), resource: true })),
    define("live_admin_create_event_product", "Create the event's Polar product (idempotent). Needed before opening sales.",
      schema({ event_id: idProp("Event id") }, ["event_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/events/${pathId(a.event_id)}/polar-product`, resource: true })),
    define("live_admin_open_event_sales", "Open ticket sales (scheduled → sales_open). Needs the Polar product and both recording notices; creates the seats. Idempotent on an event already on sale.",
      schema({ event_id: idProp("Event id") }, ["event_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/events/${pathId(a.event_id)}/open-sales`, resource: true })),
    define("live_admin_create_event_meeting", "Create the event's Zoom meeting (idempotent). Run it after opening sales and before the join window (15 minutes before start); the member join path never creates one.",
      schema({ event_id: idProp("Event id") }, ["event_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/events/${pathId(a.event_id)}/meeting`, resource: true })),
    define("live_admin_cancel_event", `Cancel an event: active tickets are cancelled, entitlements revoked and seats freed. Paid orders are not refunded by this call; refund each with live_admin_refund_ticket. ${APPROVAL_NOTE}`,
      schema({ event_id: idProp("Event id"), approvalId: approvalIdProp }, ["event_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/events/${pathId(a.event_id)}/cancel`, body: bodyOf(a, "event_id"), resource: true })),
    define("live_admin_refund_ticket", `Ask Polar to refund a ticket's order (answers 202). The ticket is unchanged until Polar's order.refunded webhook revokes it, its entitlement and its seat. ${APPROVAL_NOTE}`,
      schema({ ticket_id: idProp("Ticket id (from live_admin_list_event_tickets)"), approvalId: approvalIdProp, reason: { type: "string", enum: [...REFUND_REASONS], description: "Default customer_request" }, comment: longText(500) }, ["ticket_id"]),
      (a) => ({ method: "POST", path: `${ADMIN}/tickets/${pathId(a.ticket_id)}/refund`, body: bodyOf(a, "ticket_id"), resource: true })),

    // --- Two-person approvals and housekeeping ---
    define("live_admin_request_approval", "Request a two-person approval for a sensitive action. target is { ticketId } for live.ticket.refund, { eventId } for live.event.cancel, or { roundId, topicId } for live.poll.override. A different operator must approve it before the action runs.",
      schema({
        action: { type: "string", enum: [...SENSITIVE_ACTIONS] },
        target: { type: "object", description: "{ ticketId } | { eventId } | { roundId, topicId }" },
        reason: { type: "string", minLength: 1, maxLength: 500 },
        ttlMinutes: { type: "integer", minimum: 1, maximum: 1440, description: "Lifetime of the approval" }
      }, ["action", "target", "reason"]),
      (a) => ({ method: "POST", path: `${ADMIN}/approvals`, body: a })),
    define("live_admin_decide_approval", "Approve or reject a pending approval. The decider must be a different operator than the requester; self, expired and already decided approvals are refused (409).",
      schema({ approval_id: idProp("Approval id"), decision: { type: "string", enum: ["approve", "reject"] } }, ["approval_id", "decision"]),
      (a) => ({ method: "POST", path: `${ADMIN}/approvals/${pathId(a.approval_id)}/decision`, body: bodyOf(a, "approval_id"), resource: true })),
    define("live_admin_run_sweeps", "Run the Live housekeeping sweep now (the cron runs it every minute): return expired seat holds to the pool and cancel meeting registrants of revoked tickets. Idempotent.",
      schema({}),
      () => ({ method: "POST", path: `${ADMIN}/sweeps` }))
  ];
}
