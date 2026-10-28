/**
 * HTTP-mappable failure raised by the NLB Live domain. Routes and MCP tools translate it into
 * `{ error, code }`; `code` is stable and safe to show, `message` never carries personal data.
 */
export type LiveErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "invalid_transition"
  | "rate_limited"
  | "round_not_open"
  | "round_not_closed"
  | "round_not_finalized"
  | "round_overlap"
  | "topic_not_in_round"
  | "sales_not_open"
  | "sold_out"
  | "already_ticketed"
  | "recording_consent_required"
  | "reservation_invalid"
  | "event_locked"
  | "price_locked"
  | "capacity_shrink_refused"
  | "polar_product_missing"
  | "polar_product_failed"
  | "recording_notice_missing"
  | "checkout_failed";

export type LiveErrorStatus = 400 | 404 | 409 | 422 | 429 | 502 | 503;

export class LiveError extends Error {
  constructor(
    readonly status: LiveErrorStatus,
    readonly code: LiveErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LiveError";
  }
}

/** Checkout was attempted without accepting that the session is recorded and the replay may be sold. */
export class LiveRecordingConsentRequiredError extends LiveError {
  constructor() {
    super(422, "recording_consent_required", "Recording consent is required before checkout");
    this.name = "LiveRecordingConsentRequiredError";
  }
}

export const liveNotFound = (what: string) => new LiveError(404, "not_found", `${what} not found`);
export const liveInvalid = (message: string) => new LiveError(400, "invalid_input", message);
