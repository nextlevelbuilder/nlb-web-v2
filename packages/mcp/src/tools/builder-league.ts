import { z, type ZodType, type ZodTypeDef } from "zod";
import {
  BUILDER_BOARD_KEYS,
  BUILDER_EVIDENCE_STATUSES,
  BUILDER_LOCALES,
  BUILDER_PERIOD_TYPES,
  BUILDER_RENDER_FORMATS,
  BUILDER_SEASON_TRACKS,
  BUILDER_STAGES,
  BUILDER_VISIBILITIES,
  BuilderAppealInputSchema,
  BuilderBackfillInputSchema,
  BuilderBadgesResponseSchema,
  BuilderEnvelopeSchema,
  BuilderEvidenceListQuerySchema,
  BuilderEvidenceListResponseSchema,
  BuilderEvidenceResponseSchema,
  BuilderJourneyQuerySchema,
  BuilderLocaleSchema,
  BuilderModerationQueueQuerySchema,
  BuilderRankingsQuerySchema,
  BuilderRenderInputSchema,
  BuilderSeasonEnrollmentInputSchema,
  BuilderTimeCapsuleInputSchema,
  BuilderYearSchema,
  CreateBuilderProjectSchema,
  EditBuilderEvidenceSchema,
  SubmitBuilderEvidenceSchema,
  describeBuilderApiFailure
} from "@nextlevelbuilder/contracts";
import { ToolError, type ToolContext } from "../tool-context.js";
import type { McpToolDefinition, resolveToolEnv } from "./index.js";

type ResolveToolEnv = typeof resolveToolEnv;
type JsonSchemaProps = Record<string, unknown>;

/** Tool arguments that select the endpoint and credentials rather than the request itself. */
const CREDENTIAL_KEYS = ["api_key", "api_url", "session_cookie"] as const;
type Credentials = { api_key?: string; api_url?: string; session_cookie?: string };

const credentialProps: JsonSchemaProps = {
  api_key: { type: "string", description: "NLB API key of the member; otherwise uses the configured NLB_API_KEY (ignored for OAuth calls)" },
  api_url: { type: "string", description: "Allowed directory API endpoint (optional)" }
};
const sessionCookieProp: JsonSchemaProps = {
  session_cookie: { type: "string", description: "Admin's Better Auth session cookie (or NLB_SESSION_COOKIE). Admin routes accept only a signed-in admin session; API keys and OAuth agents are refused." }
};

function splitCredentials(args: Record<string, unknown>): { credentials: Credentials; rest: Record<string, unknown> } {
  const credentials: Credentials = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if ((CREDENTIAL_KEYS as readonly string[]).includes(key)) {
      if (value !== undefined && typeof value !== "string") throw new ToolError(`Invalid arguments: ${key} must be a string`, { details: [{ path: key, message: "Expected string" }] });
      if (typeof value === "string") credentials[key as keyof Credentials] = value;
    } else {
      rest[key] = value;
    }
  }
  return { credentials, rest };
}

function parseArgs<T>(schema: ZodType<T, ZodTypeDef, unknown>, args: unknown, tool: string): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    throw new ToolError(
      `Invalid arguments for ${tool}: ${details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join("; ")}`,
      { details }
    );
  }
  return result.data;
}

interface BuilderCall {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Write calls send an Idempotency-Key (caller-supplied or random). */
  idempotencyKey?: string;
  /** The path names one item, so a 404 may also mean it does not exist. */
  resource?: boolean;
  /** Admin routes authenticate with the admin's session cookie instead of the API key. */
  adminSession?: boolean;
  /** Response validation; the raw JSON is returned so no field is ever dropped. */
  schema?: ZodType<unknown, ZodTypeDef, unknown>;
}

function isAnonymousWorker(context?: ToolContext): boolean {
  return context !== undefined && !context.oauth && context.workerAuth !== true;
}

function resolveSessionCookie(credentials: Credentials, context?: ToolContext): string | undefined {
  if (context?.oauth) return undefined;
  if (credentials.session_cookie?.trim()) return credentials.session_cookie.trim();
  return typeof process !== "undefined" ? process.env?.NLB_SESSION_COOKIE?.trim() || undefined : undefined;
}

async function builderRequest(
  resolveEnv: ResolveToolEnv,
  credentials: Credentials,
  context: ToolContext | undefined,
  call: BuilderCall
): Promise<unknown> {
  const { apiUrl, apiKey } = resolveEnv(credentials, context);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (call.adminSession) {
    const cookie = resolveSessionCookie(credentials, context);
    if (cookie) headers.Cookie = cookie;
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  if (call.body !== undefined) headers["Content-Type"] = "application/json";
  if (call.method !== "GET") headers["Idempotency-Key"] = call.idempotencyKey ?? crypto.randomUUID();

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(call.query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.size ? `?${params.toString()}` : "";

  const response = await (context?.fetch ?? fetch)(`${apiUrl}${call.path}${search}`, {
    method: call.method,
    headers,
    body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) {
    const failure = describeBuilderApiFailure(response.status, text, response.statusText, { resource: call.resource });
    const data: Record<string, unknown> = { status: failure.status, notEnabled: failure.notEnabled };
    if (failure.code !== undefined) data.code = failure.code;
    if (failure.details !== undefined) data.details = failure.details;
    if (response.status === 401) {
      data.hint = context?.oauth
        ? "The NLB API rejected this OAuth identity. Reconnect the MCP client."
        : call.adminSession
          ? "Admin tools need a signed-in admin session cookie (session_cookie or NLB_SESSION_COOKIE)."
          : "Send a member API key (api_key or NLB_API_KEY).";
    }
    throw new ToolError(`Builder League API error (${failure.message})`, data);
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Builder League API returned a non-JSON response for ${call.path}`);
  }
  const parsed = (call.schema ?? BuilderEnvelopeSchema).safeParse(json);
  if (!parsed.success) throw new Error(`Builder League API response schema mismatch for ${call.path}: ${parsed.error.message}`);
  return json;
}

const enc = encodeURIComponent;

// --- Argument schemas (tool-level path params are snake_case; body fields keep the API names) ---

const NoArgs = z.object({}).strict();
const LocaleArgs = z.object({ locale: BuilderLocaleSchema.optional() }).strict();
const EvidenceIdArgs = z.object({ evidence_id: z.string().min(1).max(300) }).strict();
const idempotencyArg = z.string().min(1).max(128).optional();
const SubmitArgs = SubmitBuilderEvidenceSchema.extend({ idempotency_key: idempotencyArg }).strict();
const UpdateArgs = z.object({ evidence_id: z.string().min(1).max(300), changes: EditBuilderEvidenceSchema, idempotency_key: idempotencyArg }).strict();
const WithdrawArgs = EvidenceIdArgs.extend({ idempotency_key: idempotencyArg }).strict();
const AppealArgs = EvidenceIdArgs.merge(BuilderAppealInputSchema).extend({ idempotency_key: idempotencyArg }).strict();
const CreateProjectArgs = CreateBuilderProjectSchema.extend({ idempotency_key: idempotencyArg }).strict();
const SeasonArgs = BuilderSeasonEnrollmentInputSchema.extend({ idempotency_key: idempotencyArg }).strict();
const CapsuleArgs = BuilderTimeCapsuleInputSchema.extend({ idempotency_key: idempotencyArg }).strict();
const CapsuleQueryArgs = z.object({ year: z.number().int().min(2000).max(2100).optional() }).strict();
const YearArgs = z.object({ year: BuilderYearSchema }).strict();
const RenderArgs = YearArgs.merge(BuilderRenderInputSchema).extend({ idempotency_key: idempotencyArg }).strict();
const RevokeShareArgs = YearArgs.extend({ link_id: z.string().min(1).max(300) }).strict();
const PassportArgs = z.object({ user_id: z.string().min(1).max(128) }).strict();
const BackfillPreviewArgs = BuilderBackfillInputSchema.omit({ dryRun: true }).strict();

// --- JSON Schemas advertised to agents ---

const stageProp = { type: "string", enum: [...BUILDER_STAGES] };
const visibilityProp = { type: "string", enum: [...BUILDER_VISIBILITIES], description: "Default private. Everything is private unless the member opts in." };
const localeProp = { type: "string", enum: [...BUILDER_LOCALES], description: "Language of names and labels (default en)" };
const yearProp = { type: "integer", minimum: 2026, description: "Calendar year in Asia/Ho_Chi_Minh (UTC+7)" };
const evidenceIdProp = { type: "string", minLength: 1, description: "Evidence id (from builder_list_evidence)" };
const idempotencyProp = {
  type: "string",
  maxLength: 128,
  description: "Optional Idempotency-Key. Reuse the same key when retrying the same write; a random UUID is used when omitted."
};
const linksProp = { type: "array", maxItems: 10, items: { type: "string", format: "uri" }, description: "Public http(s) proof links" };
const occurredAtProp = { type: ["string", "integer"], description: "YYYY-MM-DD (Asia/Ho_Chi_Minh), ISO timestamp or epoch ms; not in the future" };
const evidenceEditProps = {
  title: { type: "string", minLength: 3, maxLength: 140 },
  summary: { type: "string", maxLength: 5000, description: "Outcome in your own words. Redact customer names, emails and payment details." },
  occurredAt: occurredAtProp,
  links: linksProp,
  projectId: { type: ["string", "null"], description: "Project id from builder_list_projects" },
  counterparty: { type: ["string", "null"], description: "User id or /builders/{id} URL of the helped or confirming member" },
  visibility: visibilityProp
};

function schema(properties: JsonSchemaProps, required: string[] = [], extra: JsonSchemaProps = credentialProps) {
  return { type: "object" as const, properties: { ...properties, ...extra }, ...(required.length ? { required } : {}) };
}

const AUTH_NOTE = "Requires a Builder League member identity (OAuth, member API key or NLB_API_KEY). While BUILDER_LEAGUE_ENABLED is off only admins and pilot members get through; everyone else gets an error with notEnabled: true.";

/**
 * Builds the Builder League tools. The endpoint/credential resolver is injected by the tool registry so
 * this module does not import it back (avoids a circular module dependency).
 *
 * Ledger rule: API keys and MCP agents may only submit `self_reported` activity and never approve or
 * award. No tool here takes a verification level, status or approval; peer confirmation, reward claims,
 * privacy and sharing changes, and every moderation decision need a signed-in human session and are
 * deliberately not exposed as tools.
 */
export function createBuilderLeagueTools(resolveEnv: ResolveToolEnv): McpToolDefinition[] {
  function define<T>(
    name: string,
    description: string,
    inputSchema: McpToolDefinition["inputSchema"],
    argsSchema: ZodType<T, ZodTypeDef, unknown>,
    build: (args: T) => BuilderCall
  ): McpToolDefinition {
    return {
      name,
      description,
      inputSchema,
      handler: async (args, context) => {
        // Every Builder League call is bound to a member identity; an anonymous Worker caller never
        // borrows the server's configured key.
        if (isAnonymousWorker(context)) {
          throw new ToolError(`Unauthorized: Tool '${name}' acts for a Builder League member and requires a valid Worker authorization token.`, { status: 401 });
        }
        const { credentials, rest } = splitCredentials(args);
        const parsed = parseArgs(argsSchema, rest, name);
        return builderRequest(resolveEnv, credentials, context, build(parsed));
      }
    };
  }

  return [
    // --- Reads ---
    define("builder_get_access", "Check whether the Builder League is shown to this caller (`showNav`): true when the league is open or the caller may use it. Agents get the public answer. Always succeeds.", schema({}), NoArgs,
      () => ({ method: "GET", path: "/api/v1/builder-access" })),
    define("builder_get_me", `Read the caller's Builder League summary: level, rank checklist, this week's League Score, pending evidence and privacy switches. ${AUTH_NOTE}`, schema({}), NoArgs,
      () => ({ method: "GET", path: "/api/v1/builder-me" })),
    define("builder_list_projects", `List the caller's Builder League projects (by name). Use a project id as projectId when submitting evidence. ${AUTH_NOTE}`, schema({}), NoArgs,
      () => ({ method: "GET", path: "/api/v1/builder-projects" })),
    define("builder_list_evidence", `List the caller's evidence, newest first, with the latest appeal of each. Keyset pagination: pass pagination.nextCursor as cursor. ${AUTH_NOTE}`,
      schema({ status: { type: "string", enum: [...BUILDER_EVIDENCE_STATUSES] }, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string" } }),
      BuilderEvidenceListQuerySchema,
      (a) => ({ method: "GET", path: "/api/v1/builder-evidence", query: { status: a.status, limit: a.limit, cursor: a.cursor }, schema: BuilderEvidenceListResponseSchema })),
    define("builder_get_evidence", `Get one evidence item (owner, admin, or the named counterparty without files). ${AUTH_NOTE}`, schema({ evidence_id: evidenceIdProp }, ["evidence_id"]), EvidenceIdArgs,
      (a) => ({ method: "GET", path: `/api/v1/builder-evidence/${enc(a.evidence_id)}`, resource: true, schema: BuilderEvidenceResponseSchema })),
    define("builder_get_journey", `Read the caller's builder journey, oldest first: verified and pending activity, corrections, reversals, backfilled history, rank and badge awards. ${AUTH_NOTE}`,
      schema({ limit: { type: "integer", minimum: 1, maximum: 200 }, cursor: { type: "string" }, project: { type: "string", description: "Only items of this project id" } }),
      BuilderJourneyQuerySchema,
      (a) => ({ method: "GET", path: "/api/v1/builder-journey", query: { limit: a.limit, cursor: a.cursor, project: a.project } })),
    define("builder_list_missions", `Suggested missions from the caller's verified history (stage-aware; each links to the evidence form for its event type). ${AUTH_NOTE}`, schema({ locale: localeProp }), LocaleArgs,
      (a) => ({ method: "GET", path: "/api/v1/builder-missions", query: { locale: a.locale } })),
    define("builder_list_badges", `List the badge catalogue with the caller's awards. Badges come only from verified evidence. ${AUTH_NOTE}`, schema({ locale: localeProp }), LocaleArgs,
      (a) => ({ method: "GET", path: "/api/v1/builder-badges", query: { locale: a.locale }, schema: BuilderBadgesResponseSchema })),
    define("builder_get_seasons", `Current eight-week season, the caller's enrollment, weekly check-in and past placements. ${AUTH_NOTE}`, schema({}), NoArgs,
      () => ({ method: "GET", path: "/api/v1/builder-seasons" })),
    define("builder_get_rankings", `Read a builder board (verified RP per period, Asia/Ho_Chi_Minh). Only opted-in members are listed; the caller's own position is in viewer. ${AUTH_NOTE}`,
      schema({
        board: { type: "string", enum: [...BUILDER_BOARD_KEYS], description: "Default overall" },
        period: { type: "string", enum: [...BUILDER_PERIOD_TYPES], description: "Default week" },
        key: { type: "string", description: "Period key such as 2026-W42, 2026-10, 2026 or S2026-1 (default current)" },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      }),
      BuilderRankingsQuerySchema,
      (a) => ({ method: "GET", path: "/api/v1/builder-rankings", query: { board: a.board, period: a.period, key: a.key, limit: a.limit } })),
    define("builder_list_rewards", `Rewards the caller can work towards, with per-requirement eligibility, plus the caller's claim history. Claiming a reward needs a signed-in session on the website. ${AUTH_NOTE}`, schema({ locale: localeProp }), LocaleArgs,
      (a) => ({ method: "GET", path: "/api/v1/builder-rewards", query: { locale: a.locale } })),
    define("builder_get_time_capsule", `Read the caller's Time Capsule (intent and reflection with every earlier version) for a year. ${AUTH_NOTE}`,
      schema({ year: { type: "integer", minimum: 2000, maximum: 2100, description: "Default current year" } }), CapsuleQueryArgs,
      (a) => ({ method: "GET", path: "/api/v1/builder-time-capsule", query: { year: a.year } })),
    define("builder_get_passport", `Read a Builder Passport. The member and admins get the private view; others only the public view when the member opted in (otherwise not found). ${AUTH_NOTE}`,
      schema({ user_id: { type: "string", minLength: 1, description: "Member user id" } }, ["user_id"]), PassportArgs,
      (a) => ({ method: "GET", path: `/api/v1/builder-passport/${enc(a.user_id)}`, resource: true })),
    define("builder_get_year", `Read the caller's Year in Review (latest snapshot; provisional until the year closes). ${AUTH_NOTE}`, schema({ year: yearProp }, ["year"]), YearArgs,
      (a) => ({ method: "GET", path: `/api/v1/builder-year/${a.year}`, resource: true })),
    define("builder_list_share_links", `List the caller's Year in Review share links (never tokens) and the visit, signup and paid funnel. Creating a link needs a signed-in session. ${AUTH_NOTE}`, schema({ year: yearProp }, ["year"]), YearArgs,
      (a) => ({ method: "GET", path: `/api/v1/builder-year/${a.year}/share`, resource: true })),
    define("builder_list_year_videos", `List the caller's Year in Review video render jobs. ${AUTH_NOTE}`, schema({ year: yearProp }, ["year"]), YearArgs,
      (a) => ({ method: "GET", path: `/api/v1/builder-year/${a.year}/render`, resource: true })),
    define("builder_get_community_wrapped", "Read Community Wrapped for a year: the public, auditable aggregate of the community (no member named; small cohorts suppressed). Not found while the league is hidden from the caller.", schema({ year: yearProp }, ["year"]), YearArgs,
      (a) => ({ method: "GET", path: `/api/v1/builder-wrapped/${a.year}`, resource: true })),

    // --- Writes (member self-service; never verification, approval or awards) ---
    define("builder_create_project", `Create a Builder League project for the caller (optionally linking a directory product they own). ${AUTH_NOTE}`,
      schema({
        name: { type: "string", minLength: 2, maxLength: 80 },
        summary: { type: "string", maxLength: 500 },
        stage: { ...stageProp, description: "Default validate" },
        productId: { type: ["string", "null"], description: "Directory product id you own" },
        visibility: visibilityProp,
        idempotency_key: idempotencyProp
      }, ["name"]),
      CreateProjectArgs,
      ({ idempotency_key, ...body }) => ({ method: "POST", path: "/api/v1/builder-projects", body, idempotencyKey: idempotency_key })),
    define("builder_submit_evidence", `Submit evidence of real progress for a ruleset event type (see builder_list_missions for event types). Submissions from agents are always self_reported: the server records source agent (or api for API keys) and a moderator, never the agent, verifies and awards RP. There is no verification, status or approval field. Idempotent on clientKey. ${AUTH_NOTE}`,
      schema({
        eventType: { type: "string", minLength: 1, maxLength: 64, description: "Ruleset event type, e.g. validate_interviews or build_mvp" },
        stage: stageProp,
        title: { type: "string", minLength: 3, maxLength: 140 },
        summary: evidenceEditProps.summary,
        occurredAt: occurredAtProp,
        links: linksProp,
        projectId: evidenceEditProps.projectId,
        counterparty: evidenceEditProps.counterparty,
        visibility: visibilityProp,
        clientKey: { type: "string", maxLength: 128, description: "Idempotency key: a retry with the same key returns the stored evidence" },
        idempotency_key: idempotencyProp
      }, ["eventType", "title", "occurredAt"]),
      SubmitArgs,
      ({ idempotency_key, ...body }) => ({ method: "POST", path: "/api/v1/builder-evidence", body, idempotencyKey: idempotency_key ?? body.clientKey, schema: BuilderEvidenceResponseSchema })),
    define("builder_update_evidence", `Edit the caller's own evidence while it is submitted or needs_info (answering needs_info puts it back in the queue). changes holds only the fields to change. ${AUTH_NOTE}`,
      schema({
        evidence_id: evidenceIdProp,
        changes: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: { ...evidenceEditProps, removeFiles: { type: "array", maxItems: 10, items: { type: "string" }, description: "File names from files[].name to delete" } }
        },
        idempotency_key: idempotencyProp
      }, ["evidence_id", "changes"]),
      UpdateArgs,
      (a) => ({ method: "PATCH", path: `/api/v1/builder-evidence/${enc(a.evidence_id)}`, body: a.changes, idempotencyKey: a.idempotency_key, resource: true, schema: BuilderEvidenceResponseSchema })),
    define("builder_withdraw_evidence", `Withdraw the caller's own evidence while it is submitted or needs_info. ${AUTH_NOTE}`,
      schema({ evidence_id: evidenceIdProp, idempotency_key: idempotencyProp }, ["evidence_id"]), WithdrawArgs,
      (a) => ({ method: "PATCH", path: `/api/v1/builder-evidence/${enc(a.evidence_id)}`, body: { action: "withdraw" }, idempotencyKey: a.idempotency_key, resource: true, schema: BuilderEvidenceResponseSchema })),
    define("builder_appeal_evidence", `Appeal the rejection of the caller's own evidence (one appeal per rejection; a moderator resolves it). ${AUTH_NOTE}`,
      schema({ evidence_id: evidenceIdProp, reason: { type: "string", minLength: 20, maxLength: 2000 }, idempotency_key: idempotencyProp }, ["evidence_id", "reason"]),
      AppealArgs,
      (a) => ({ method: "POST", path: `/api/v1/builder-evidence/${enc(a.evidence_id)}/appeal`, body: { reason: a.reason }, idempotencyKey: a.idempotency_key, resource: true })),
    define("builder_join_season", `Join or update the caller's enrollment in the current or next season (a track and an optional goal; tracks never change scoring). ${AUTH_NOTE}`,
      schema({
        seasonKey: { type: "string", description: "Current or next season key (default current)" },
        track: { type: "string", enum: [...BUILDER_SEASON_TRACKS], description: "Default open" },
        goal: { type: ["string", "null"], maxLength: 280 },
        idempotency_key: idempotencyProp
      }),
      SeasonArgs,
      ({ idempotency_key, ...body }) => ({ method: "POST", path: "/api/v1/builder-seasons", body, idempotencyKey: idempotency_key })),
    define("builder_save_time_capsule", `Save a new version of the caller's Time Capsule intent or reflection for last, this or next year (private by default). ${AUTH_NOTE}`,
      schema({
        year: { type: "integer", description: "Last, current or next year (default current)" },
        kind: { type: "string", enum: ["intent", "reflection"] },
        body: { type: "string", minLength: 1, maxLength: 4000 },
        visibility: visibilityProp,
        idempotency_key: idempotencyProp
      }, ["kind", "body"]),
      CapsuleArgs,
      ({ idempotency_key, ...body }) => ({ method: "POST", path: "/api/v1/builder-time-capsule", body, idempotencyKey: idempotency_key })),
    define("builder_request_year_video", `Queue a 30-60 second Year in Review video of the shared scenes (idempotent per snapshot and format; outputs are private for 30 days). ${AUTH_NOTE}`,
      schema({ year: yearProp, format: { type: "string", enum: [...BUILDER_RENDER_FORMATS] }, idempotency_key: idempotencyProp }, ["year", "format"]),
      RenderArgs,
      (a) => ({ method: "POST", path: `/api/v1/builder-year/${a.year}/render`, body: { format: a.format }, idempotencyKey: a.idempotency_key, resource: true })),
    define("builder_revoke_share_link", `Revoke one of the caller's Year in Review share links (idempotent; the link stops resolving immediately). ${AUTH_NOTE}`,
      schema({ year: yearProp, link_id: { type: "string", minLength: 1, description: "Share link id from builder_list_share_links" } }, ["year", "link_id"]),
      RevokeShareArgs,
      (a) => ({ method: "DELETE", path: `/api/v1/builder-year/${a.year}/share/${enc(a.link_id)}`, resource: true })),

    // --- Admin (signed-in admin session only; read-only or dry-run, never a decision or an award) ---
    define("builder_admin_list_queue", "Admin: read the Builder League moderation queue (oldest first; view=appeals lists open appeals). The server accepts only a signed-in admin session (session_cookie or NLB_SESSION_COOKIE); OAuth agents and API keys get session_required. Decisions are made by a human admin on the website or with `nlb builder admin decide`, never by an agent.",
      schema({
        view: { type: "string", enum: ["evidence", "appeals"] },
        status: { type: "string", enum: [...BUILDER_EVIDENCE_STATUSES], description: "Default submitted" },
        stage: stageProp,
        eventType: { type: "string" },
        olderThanHours: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }, [], { ...credentialProps, ...sessionCookieProp }),
      BuilderModerationQueueQuerySchema,
      (a) => ({ method: "GET", path: "/api/v1/builder-admin/queue", query: { ...a }, adminSession: true })),
    define("builder_admin_backfill_preview", "Admin: dry-run the directory-launch backfill and report what would be imported (always dryRun: true; nothing is recorded or awarded). Applying the backfill is a human admin action (`nlb builder admin backfill --apply`). Signed-in admin session only (session_cookie or NLB_SESSION_COOKIE).",
      schema({ userIds: { type: "array", maxItems: 500, items: { type: "string" }, description: "Limit the run to these members (default: everyone who opted in)" } }, [], { ...credentialProps, ...sessionCookieProp }),
      BackfillPreviewArgs,
      (a) => ({ method: "POST", path: "/api/v1/builder-admin/backfill", body: { ...a, dryRun: true }, adminSession: true }))
  ];
}
