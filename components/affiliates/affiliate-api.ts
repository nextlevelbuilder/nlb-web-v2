/**
 * Browser calls to the member affiliate REST API (`/api/v1/affiliates`). Responses use the `{ data }`
 * envelope; failures `{ error: { code, message } }`. The session cookie authenticates; the request is
 * same-origin, which the session write check requires.
 */

export class AffiliateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AffiliateApiError";
  }
}

type Method = "POST" | "PATCH" | "PUT";

export async function affiliateRequest<T = unknown>(path: string, method: Method, body: unknown): Promise<T> {
  if (!path.startsWith("/api/v1/affiliates")) throw new AffiliateApiError(0, "invalid_path", "Unexpected affiliate API path");
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AffiliateApiError(0, "network_error", "Network error");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === "object" ? (payload as { error?: { code?: unknown; message?: unknown } }).error : undefined;
    const code = typeof error?.code === "string" ? error.code : "request_failed";
    const message = typeof error?.message === "string" ? error.message : `Request failed with status ${response.status}`;
    throw new AffiliateApiError(response.status, code, message);
  }
  return (payload && typeof payload === "object" ? (payload as { data?: T }).data : undefined) as T;
}

/** Error codes with their own localized message under `affiliateAccount.errors`; anything else is generic. */
export const KNOWN_ERROR_CODES = [
  "account_not_eligible",
  "already_enrolled",
  "terms_not_accepted",
  "affiliate_suspended",
  "code_taken",
  "over_budget",
  "link_limit_reached",
  "conflict",
  "invalid_transition",
  "invalid_input",
  "session_required",
  "not_found",
  "rate_limited",
  "network_error",
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export function errorKey(error: unknown): KnownErrorCode | "generic" {
  if (error instanceof AffiliateApiError) {
    if ((KNOWN_ERROR_CODES as readonly string[]).includes(error.code)) return error.code as KnownErrorCode;
    if (error.status === 429) return "rate_limited";
  }
  return "generic";
}
