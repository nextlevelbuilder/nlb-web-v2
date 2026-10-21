import { randomUUID } from "node:crypto";
import type { ZodType, ZodTypeDef } from "zod";
import {
  BuilderAppealInputSchema,
  BuilderAppealResolutionInputSchema,
  BuilderBackfillInputSchema,
  BuilderBadgesResponseSchema,
  BuilderEnvelopeSchema,
  BuilderEvidenceListQuerySchema,
  BuilderEvidenceListResponseSchema,
  BuilderEvidenceResponseSchema,
  BuilderJourneyQuerySchema,
  BuilderLocaleSchema,
  BuilderModerationDecisionInputSchema,
  BuilderModerationQueueQuerySchema,
  BuilderPrivacyUpdateInputSchema,
  BuilderRankingsQuerySchema,
  BuilderRenderInputSchema,
  BuilderRewardClaimInputSchema,
  BuilderSeasonEnrollmentInputSchema,
  BuilderShareLinkInputSchema,
  BuilderTimeCapsuleInputSchema,
  BuilderYearHiddenScenesInputSchema,
  BuilderYearSchema,
  CreateBuilderProjectSchema,
  EditBuilderEvidenceSchema,
  SubmitBuilderEvidenceSchema,
  describeBuilderApiFailure,
  type BuilderApiFailure,
  type BuilderEnvelope
} from "@nextlevelbuilder/contracts";
import { isAllowedCredentialOrigin } from "../config.js";

/** Raised for any non-2xx Builder League response; carries the structured failure. */
export class BuilderApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly notEnabled: boolean;

  constructor(failure: BuilderApiFailure) {
    super(`API Error (${failure.message})`);
    this.name = "BuilderApiError";
    this.status = failure.status;
    this.code = failure.code;
    this.details = failure.details;
    this.notEnabled = failure.notEnabled;
  }
}

/** Raised when input fails the local contract checks before any network call. */
export class BuilderInputError extends Error {
  readonly issues: Array<{ path: string; message: string }>;

  constructor(label: string, issues: Array<{ path: string; message: string }>) {
    super(`Invalid ${label}: ${issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ")}`);
    this.name = "BuilderInputError";
    this.issues = issues;
  }
}

function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BuilderInputError(label, result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
  return result.data;
}

export interface BuilderClientOptions {
  baseUrl: string;
  apiKey?: string;
  /** Better Auth session cookie: required for session-only and admin routes; used elsewhere only without an API key. */
  sessionCookie?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface BuilderRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** The path names one item, so a 404 may also mean it does not exist. */
  resource?: boolean;
  /** Route accepts only a signed-in session (API keys and agents are refused by the server). */
  sessionOnly?: boolean;
  idempotencyKey?: string;
  schema?: ZodType<unknown, ZodTypeDef, unknown>;
}

const enc = encodeURIComponent;

/**
 * Typed client for `/api/v1/builder-*`. Member routes use the API key; routes the server reserves for a
 * signed-in human (peer confirmation, reward claims, privacy and sharing changes, every admin action)
 * use the session cookie. API keys can only ever submit self-reported activity.
 */
export class NlbBuilderClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly sessionCookie?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: BuilderClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey?.trim() || undefined;
    this.sessionCookie = options.sessionCookie?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  private async send(req: BuilderRequest): Promise<BuilderEnvelope> {
    if (req.sessionOnly && !this.sessionCookie) {
      throw new Error("This action needs a signed-in session: pass --cookie <session_cookie> or set NLB_SESSION_COOKIE (API keys are refused for it).");
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) params.set(key, String(value));
    }
    const search = params.size ? `?${params.toString()}` : "";
    const url = `${this.baseUrl}${req.path}${search}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    // The cookie is used for session-only routes, or when no API key is configured, so API-key runs stay
    // attributed to the key (source "api") even when NLB_SESSION_COOKIE is also set.
    if (this.sessionCookie && (req.sessionOnly || !this.apiKey)) {
      if (!isAllowedCredentialOrigin(this.baseUrl)) {
        throw new Error(`Refusing to send the session cookie to ${this.baseUrl}: it is not a Next Level Builder origin.`);
      }
      headers.Cookie = this.sessionCookie;
    } else if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
      headers["x-api-key"] = this.apiKey;
    }
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    if (req.method !== "GET") headers["Idempotency-Key"] = req.idempotencyKey ?? randomUUID();

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: req.method,
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err) {
      throw new Error(`Network request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new BuilderApiError(describeBuilderApiFailure(response.status, text, response.statusText, { resource: req.resource }));
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`API returned non-JSON response for ${req.path}`);
    }
    const parsed = (req.schema ?? BuilderEnvelopeSchema).safeParse(data);
    if (!parsed.success) throw new Error(`API Response schema mismatch for ${req.path}: ${parsed.error.message}`);
    return data as BuilderEnvelope;
  }

  private year(value: unknown): number {
    return parseInput(BuilderYearSchema, value, "year");
  }

  // --- Member reads ---

  async getAccess() { return this.send({ method: "GET", path: "/api/v1/builder-access" }); }
  async getMe() { return this.send({ method: "GET", path: "/api/v1/builder-me" }); }
  async listProjects() { return this.send({ method: "GET", path: "/api/v1/builder-projects" }); }

  async listEvidence(query: unknown = {}) {
    const q = parseInput(BuilderEvidenceListQuerySchema, query, "evidence query");
    return this.send({ method: "GET", path: "/api/v1/builder-evidence", query: q, schema: BuilderEvidenceListResponseSchema });
  }

  async getEvidence(id: string) {
    return this.send({ method: "GET", path: `/api/v1/builder-evidence/${enc(id)}`, resource: true, schema: BuilderEvidenceResponseSchema });
  }

  async getJourney(query: unknown = {}) {
    const q = parseInput(BuilderJourneyQuerySchema, query, "journey query");
    return this.send({ method: "GET", path: "/api/v1/builder-journey", query: q });
  }

  async listMissions(locale?: string) {
    return this.send({ method: "GET", path: "/api/v1/builder-missions", query: { locale: this.locale(locale) } });
  }

  async listBadges(locale?: string) {
    return this.send({ method: "GET", path: "/api/v1/builder-badges", query: { locale: this.locale(locale) }, schema: BuilderBadgesResponseSchema });
  }

  async getSeasons() { return this.send({ method: "GET", path: "/api/v1/builder-seasons" }); }

  async getRankings(query: unknown = {}) {
    const q = parseInput(BuilderRankingsQuerySchema, query, "rankings query");
    return this.send({ method: "GET", path: "/api/v1/builder-rankings", query: q });
  }

  async listRewards(locale?: string) {
    return this.send({ method: "GET", path: "/api/v1/builder-rewards", query: { locale: this.locale(locale) } });
  }

  async getTimeCapsule(year?: number) {
    return this.send({ method: "GET", path: "/api/v1/builder-time-capsule", query: { year } });
  }

  async getPassport(userId: string) {
    return this.send({ method: "GET", path: `/api/v1/builder-passport/${enc(userId)}`, resource: true });
  }

  async getYear(year: unknown) { return this.send({ method: "GET", path: `/api/v1/builder-year/${this.year(year)}`, resource: true }); }
  async listShareLinks(year: unknown) { return this.send({ method: "GET", path: `/api/v1/builder-year/${this.year(year)}/share`, resource: true }); }
  async listYearVideos(year: unknown) { return this.send({ method: "GET", path: `/api/v1/builder-year/${this.year(year)}/render`, resource: true }); }
  async getCommunityWrapped(year: unknown) { return this.send({ method: "GET", path: `/api/v1/builder-wrapped/${this.year(year)}`, resource: true }); }

  // --- Member writes (self-service; the server records API-key submissions as self_reported, source api) ---

  async createProject(input: unknown) {
    const body = parseInput(CreateBuilderProjectSchema, input, "project");
    return this.send({ method: "POST", path: "/api/v1/builder-projects", body });
  }

  async submitEvidence(input: unknown) {
    const body = parseInput(SubmitBuilderEvidenceSchema, input, "evidence");
    return this.send({ method: "POST", path: "/api/v1/builder-evidence", body, idempotencyKey: body.clientKey, schema: BuilderEvidenceResponseSchema });
  }

  async updateEvidence(id: string, input: unknown) {
    const body = parseInput(EditBuilderEvidenceSchema, input, "evidence changes");
    return this.send({ method: "PATCH", path: `/api/v1/builder-evidence/${enc(id)}`, body, resource: true, schema: BuilderEvidenceResponseSchema });
  }

  async withdrawEvidence(id: string) {
    return this.send({ method: "PATCH", path: `/api/v1/builder-evidence/${enc(id)}`, body: { action: "withdraw" }, resource: true, schema: BuilderEvidenceResponseSchema });
  }

  async appealEvidence(id: string, reason: string) {
    const body = parseInput(BuilderAppealInputSchema, { reason }, "appeal");
    return this.send({ method: "POST", path: `/api/v1/builder-evidence/${enc(id)}/appeal`, body, resource: true });
  }

  async joinSeason(input: unknown) {
    const body = parseInput(BuilderSeasonEnrollmentInputSchema, input, "season enrollment");
    return this.send({ method: "POST", path: "/api/v1/builder-seasons", body });
  }

  async saveTimeCapsule(input: unknown) {
    const body = parseInput(BuilderTimeCapsuleInputSchema, input, "time capsule entry");
    return this.send({ method: "POST", path: "/api/v1/builder-time-capsule", body });
  }

  async requestYearVideo(year: unknown, format: string) {
    const body = parseInput(BuilderRenderInputSchema, { format }, "render request");
    return this.send({ method: "POST", path: `/api/v1/builder-year/${this.year(year)}/render`, body, resource: true });
  }

  async revokeShareLink(year: unknown, id: string) {
    return this.send({ method: "DELETE", path: `/api/v1/builder-year/${this.year(year)}/share/${enc(id)}`, resource: true });
  }

  // --- Signed-in session only (a human decision; API keys and agents are refused) ---

  async confirmEvidence(id: string) {
    return this.send({ method: "POST", path: `/api/v1/builder-evidence/${enc(id)}/confirm`, resource: true, sessionOnly: true });
  }

  async updatePrivacy(privacy: unknown) {
    const body = parseInput(BuilderPrivacyUpdateInputSchema, { privacy }, "privacy");
    return this.send({ method: "PATCH", path: "/api/v1/builder-me", body, sessionOnly: true });
  }

  async claimReward(id: string, note?: string) {
    const body = parseInput(BuilderRewardClaimInputSchema, note === undefined ? {} : { note }, "reward claim");
    return this.send({ method: "POST", path: `/api/v1/builder-rewards/${enc(id)}/claim`, body, resource: true, sessionOnly: true });
  }

  async hideYearScenes(year: unknown, hiddenScenes: string[]) {
    const body = parseInput(BuilderYearHiddenScenesInputSchema, { hiddenScenes }, "hidden scenes");
    return this.send({ method: "PATCH", path: `/api/v1/builder-year/${this.year(year)}`, body, resource: true, sessionOnly: true });
  }

  async createShareLink(year: unknown, locale?: string) {
    const body = parseInput(BuilderShareLinkInputSchema, locale === undefined ? {} : { locale }, "share link");
    return this.send({ method: "POST", path: `/api/v1/builder-year/${this.year(year)}/share`, body, resource: true, sessionOnly: true });
  }

  // --- Admin (signed-in admin session only) ---

  async listModerationQueue(query: unknown = {}) {
    const q = parseInput(BuilderModerationQueueQuerySchema, query, "queue query");
    return this.send({ method: "GET", path: "/api/v1/builder-admin/queue", query: q, sessionOnly: true });
  }

  async decideEvidence(id: string, input: unknown) {
    const body = parseInput(BuilderModerationDecisionInputSchema, input, "decision");
    return this.send({ method: "POST", path: `/api/v1/builder-admin/evidence/${enc(id)}/decision`, body, resource: true, sessionOnly: true });
  }

  async resolveAppeal(id: string, input: unknown) {
    const body = parseInput(BuilderAppealResolutionInputSchema, input, "appeal resolution");
    return this.send({ method: "POST", path: `/api/v1/builder-admin/evidence/${enc(id)}/appeal`, body, resource: true, sessionOnly: true });
  }

  async runBackfill(input: unknown) {
    const body = parseInput(BuilderBackfillInputSchema, input, "backfill");
    return this.send({ method: "POST", path: "/api/v1/builder-admin/backfill", body, sessionOnly: true });
  }

  private locale(value?: string): string | undefined {
    return value === undefined ? undefined : parseInput(BuilderLocaleSchema, value, "locale");
  }
}
