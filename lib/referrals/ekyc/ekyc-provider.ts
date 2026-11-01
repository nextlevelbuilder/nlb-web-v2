/**
 * eKYC provider contract for verifying Vietnamese bank payees. The provider runs the whole check in
 * its own hosted flow (document capture, liveness, review): NLB never receives, stores or proxies
 * identity documents, OCR output or selfies. We keep only the provider's applicant reference, the
 * outcome status and the provider's decision labels. See docs/affiliate-program-adr.md.
 */
import type { VerificationStatus } from "../types";

export interface EkycStartInput {
  /** Our stable, non-personal subject id sent to the provider (the affiliate id). */
  externalUserId: string;
  /** UI language of the hosted flow. */
  locale: "en" | "vi";
}

export interface EkycStartResult {
  /** The provider's id of the applicant: the only reference we store. */
  providerReference: string;
  /** Short-lived link to the provider's hosted verification flow. */
  url: string;
}

/** A provider decision delivered by its signed webhook. */
export interface EkycDecision {
  providerReference: string;
  externalUserId: string | null;
  status: VerificationStatus;
  /** Decision labels (e.g. reject reason codes), never document content. */
  detail: string | null;
  /** When the provider emitted the event; older events never overwrite a newer decision. */
  occurredAt: Date;
}

export interface EkycProvider {
  /** Stored in `affiliate_verifications.provider`. */
  readonly name: string;
  start(input: EkycStartInput): Promise<EkycStartResult>;
  /**
   * Verifies the webhook signature over the raw body and maps the event to a decision. Returns null
   * for a well-signed event that carries no decision; throws `EkycSignatureError` when unsigned or forged.
   */
  parseWebhook(rawBody: string, headers: Headers): Promise<EkycDecision | null>;
}

export class EkycSignatureError extends Error {
  constructor() {
    super("Invalid eKYC webhook signature");
    this.name = "EkycSignatureError";
  }
}

/** The provider is not configured (missing credentials); callers answer 503 and payouts stay blocked. */
export class EkycUnavailableError extends Error {
  constructor(message = "Identity verification is not configured") {
    super(message);
    this.name = "EkycUnavailableError";
  }
}
