import { OnboardingStatusResponseSchema, type OnboardingStatusResponse } from "@nextlevelbuilder/contracts";

export class OnboardingApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly notEnabled: boolean;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "OnboardingApiError";
    this.status = status;
    this.code = code;
    this.notEnabled = status === 404;
  }
}

export interface OnboardingClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** Reads the caller's membership onboarding progress from `GET /api/v1/onboarding-status`. */
export class NlbOnboardingClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OnboardingClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  async getStatus(): Promise<OnboardingStatusResponse> {
    if (!this.apiKey) throw new Error("An API key is required: pass --api-key, set NLB_API_KEY, or run 'nlb config set api-key'.");
    const url = `${this.baseUrl}/api/v1/onboarding-status`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${this.apiKey}`, "x-api-key": this.apiKey },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err) {
      throw new Error(`Network request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = undefined;
    }
    if (!response.ok) {
      const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
      const code = typeof error?.code === "string" ? error.code : undefined;
      const serverMessage = typeof error?.message === "string" ? error.message : response.statusText || "request failed";
      const message =
        response.status === 404
          ? "Membership onboarding is not enabled on this environment."
          : response.status === 401
            ? "Sign-in required: the API key is missing, invalid or revoked."
            : serverMessage;
      throw new OnboardingApiError(response.status, `API Error (HTTP ${response.status}${code ? ` ${code}` : ""}: ${message})`, code);
    }
    if (body === undefined) throw new Error("API returned non-JSON response for /api/v1/onboarding-status");
    const parsed = OnboardingStatusResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`API Response schema mismatch for /api/v1/onboarding-status: ${parsed.error.message}`);
    return parsed.data;
  }
}
