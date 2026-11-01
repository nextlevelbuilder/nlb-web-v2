/**
 * Sumsub adapter of the eKYC contract (provider chosen in docs/affiliate-program-adr.md). Sumsub
 * hosts the whole check (Vietnamese CCCD/passport capture, liveness, review) through its WebSDK link;
 * documents stay with Sumsub. Requests are signed with the app token and secret
 * (`X-App-Access-Sig` = HMAC-SHA256 hex of `ts + METHOD + path + body`); webhooks are verified with
 * the webhook secret over the raw body (`X-Payload-Digest`, algorithm in `X-Payload-Digest-Alg`).
 *
 * Credentials: `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET` (secrets) and
 * `SUMSUB_LEVEL_NAME` (the verification level configured in the Sumsub dashboard).
 */
import { getReferralBinding } from "../referral-env";
import type { VerificationStatus } from "../types";
import { EkycSignatureError, EkycUnavailableError, type EkycDecision, type EkycProvider, type EkycStartInput, type EkycStartResult } from "./ekyc-provider";

export const SUMSUB_BASE_URL = "https://api.sumsub.com";
/** Lifetime of a hosted verification link. */
const LINK_TTL_SECONDS = 1800;

export interface SumsubConfig {
  appToken: string;
  secretKey: string;
  webhookSecret: string;
  levelName: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

const encoder = new TextEncoder();

async function hmacHex(hash: "SHA-256" | "SHA-512", secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex digests. */
function digestEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const DIGEST_ALGORITHMS: Record<string, "SHA-256" | "SHA-512"> = { HMAC_SHA256_HEX: "SHA-256", HMAC_SHA512_HEX: "SHA-512" };

interface SumsubWebhook {
  type?: string;
  applicantId?: string;
  externalUserId?: string;
  reviewStatus?: string;
  createdAtMs?: string | number;
  reviewResult?: { reviewAnswer?: string; reviewRejectType?: string; rejectLabels?: string[] };
}

/** Maps a Sumsub event to our verification status; null when the event carries no decision. */
export function sumsubStatusOf(event: SumsubWebhook): { status: VerificationStatus; detail: string | null } | null {
  const labels = (event.reviewResult?.rejectLabels ?? []).filter((label) => /^[A-Z0-9_]{1,64}$/.test(label)).slice(0, 10);
  switch (event.type) {
    case "applicantReviewed":
      if (event.reviewResult?.reviewAnswer === "GREEN") return { status: "verified", detail: null };
      if (event.reviewResult?.reviewAnswer === "RED") {
        // RETRY lets the payee resubmit in the same flow; only FINAL is a terminal rejection.
        const final = event.reviewResult.reviewRejectType === "FINAL";
        return { status: final ? "rejected" : "pending", detail: [final ? "FINAL" : "RETRY", ...labels].join(",") };
      }
      return null;
    case "applicantPending":
    case "applicantReset":
    case "applicantOnHold":
      return { status: "pending", detail: event.type };
    case "applicantDeactivated":
    case "applicantDeleted":
      return { status: "expired", detail: event.type };
    default:
      return null;
  }
}

export class SumsubProvider implements EkycProvider {
  readonly name = "sumsub";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: SumsubConfig) {
    this.baseUrl = config.baseUrl ?? SUMSUB_BASE_URL;
    this.fetchImpl = config.fetch ?? ((input, init) => fetch(input, init));
    this.now = config.now ?? (() => new Date());
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const text = body === undefined ? "" : JSON.stringify(body);
    const ts = Math.floor(this.now().getTime() / 1000).toString();
    const signature = await hmacHex("SHA-256", this.config.secretKey, `${ts}${method}${path}${text}`);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        "X-App-Token": this.config.appToken,
        "X-App-Access-Ts": ts,
        "X-App-Access-Sig": signature,
      },
      ...(body === undefined ? {} : { body: text }),
    });
    const data = (await response.json().catch(() => ({}))) as T;
    return { status: response.status, data };
  }

  /** The applicant for this subject: created on first use, found again by its external id afterwards. */
  private async applicantId(externalUserId: string): Promise<string> {
    const level = encodeURIComponent(this.config.levelName);
    const created = await this.request<{ id?: string }>("POST", `/resources/applicants?levelName=${level}`, { externalUserId });
    if (created.status < 300 && created.data.id) return created.data.id;
    if (created.status === 409) {
      const found = await this.request<{ id?: string }>("GET", `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`);
      if (found.status < 300 && found.data.id) return found.data.id;
    }
    throw new EkycUnavailableError(`eKYC provider refused the applicant (${created.status})`);
  }

  async start(input: EkycStartInput): Promise<EkycStartResult> {
    const providerReference = await this.applicantId(input.externalUserId);
    const query = new URLSearchParams({ externalUserId: input.externalUserId, ttlInSecs: String(LINK_TTL_SECONDS), lang: input.locale });
    const link = await this.request<{ url?: string }>(
      "POST",
      `/resources/sdkIntegrations/levels/${encodeURIComponent(this.config.levelName)}/websdkLink?${query.toString()}`
    );
    if (link.status >= 300 || !link.data.url?.startsWith("https://")) throw new EkycUnavailableError(`eKYC provider did not return a link (${link.status})`);
    return { providerReference, url: link.data.url };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<EkycDecision | null> {
    const digest = headers.get("x-payload-digest")?.trim().toLowerCase() ?? "";
    const algorithm = DIGEST_ALGORITHMS[headers.get("x-payload-digest-alg")?.trim().toUpperCase() ?? "HMAC_SHA256_HEX"];
    if (!digest || !algorithm) throw new EkycSignatureError();
    const expected = await hmacHex(algorithm, this.config.webhookSecret, rawBody);
    if (!digestEquals(expected, digest)) throw new EkycSignatureError();

    let event: SumsubWebhook;
    try {
      event = JSON.parse(rawBody) as SumsubWebhook;
    } catch {
      return null;
    }
    const mapped = sumsubStatusOf(event);
    if (!mapped || typeof event.applicantId !== "string" || !event.applicantId) return null;
    const emitted = Number(event.createdAtMs);
    return {
      providerReference: event.applicantId,
      externalUserId: typeof event.externalUserId === "string" ? event.externalUserId : null,
      ...mapped,
      occurredAt: Number.isFinite(emitted) && emitted > 0 ? new Date(emitted) : this.now(),
    };
  }
}

/** The configured provider, or null when any credential is missing (verification then stays unavailable). */
export function sumsubFromEnv(): SumsubProvider | null {
  const appToken = getReferralBinding("SUMSUB_APP_TOKEN");
  const secretKey = getReferralBinding("SUMSUB_SECRET_KEY");
  const webhookSecret = getReferralBinding("SUMSUB_WEBHOOK_SECRET");
  const levelName = getReferralBinding("SUMSUB_LEVEL_NAME");
  if (!appToken || !secretKey || !webhookSecret || !levelName) return null;
  return new SumsubProvider({ appToken, secretKey, webhookSecret, levelName });
}
