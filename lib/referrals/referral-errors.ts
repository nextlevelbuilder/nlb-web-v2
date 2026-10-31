/**
 * HTTP-mappable failure of the affiliate domain. Routes and MCP tools render `{ error: { code, message } }`;
 * `code` is stable and `message` never carries personal data.
 */
export type ReferralErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "not_enrolled"
  | "already_enrolled"
  | "terms_not_accepted"
  | "account_not_eligible"
  | "affiliate_suspended"
  | "code_taken"
  | "over_budget"
  | "link_limit_reached"
  | "self_referral"
  | "not_first_purchase"
  | "offer_not_eligible"
  | "invalid_transition"
  | "payouts_disabled"
  | "payout_method_required"
  | "withholding_rule_missing"
  | "verification_required"
  | "period_not_closed"
  | "nothing_to_pay"
  | "discount_failed";

export type ReferralErrorStatus = 400 | 403 | 404 | 409 | 422 | 502;

export class ReferralError extends Error {
  constructor(
    readonly status: ReferralErrorStatus,
    readonly code: ReferralErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ReferralError";
  }
}

export const referralNotFound = (what: string) => new ReferralError(404, "not_found", `${what} not found`);
export const referralInvalid = (message: string) => new ReferralError(400, "invalid_input", message);
