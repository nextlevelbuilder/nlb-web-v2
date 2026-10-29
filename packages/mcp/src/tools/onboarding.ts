import { OnboardingStatusResponseSchema } from "@nextlevelbuilder/contracts";
import { ToolError, type ToolContext } from "../tool-context.js";
import type { McpToolDefinition, resolveToolEnv } from "./index.js";

type ResolveToolEnv = typeof resolveToolEnv;

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown } | string;
}

function failureOf(status: number, text: string, statusText: string): { code?: string; message: string } {
  let body: ErrorEnvelope | undefined;
  try {
    body = text ? (JSON.parse(text) as ErrorEnvelope) : undefined;
  } catch {
    body = undefined;
  }
  const error = body?.error;
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : undefined;
  const serverMessage = error && typeof error === "object" && typeof error.message === "string"
    ? error.message
    : typeof error === "string" ? error : (text.trim().slice(0, 500) || statusText || "Request failed");
  if (status === 404) return { code, message: "Membership onboarding is not enabled on this environment." };
  if (status === 401) return { code, message: "Sign in required: send an NLB API key or an OAuth identity." };
  return { code, message: serverMessage };
}

/** Builds the membership onboarding tools; the endpoint/credential resolver is injected by the registry. */
export function createOnboardingTools(resolveEnv: ResolveToolEnv): McpToolDefinition[] {
  return [
    {
      name: "onboarding_get_status",
      description: "Read the caller's membership onboarding status: payment state, membership (tier, plan, term, renewal), member profile completion and Discord/Telegram connection status with the next action for each. Read-only. Requires an identity (OAuth mcp:read or a member API key).",
      inputSchema: {
        type: "object",
        properties: {
          api_key: { type: "string", description: "NLB API key; otherwise uses the configured NLB_API_KEY (ignored for OAuth calls)" },
          api_url: { type: "string", description: "Allowed directory API endpoint (optional)" }
        }
      },
      handler: async (args, context?: ToolContext) => {
        for (const key of ["api_key", "api_url"]) {
          if (args[key] !== undefined && typeof args[key] !== "string") {
            throw new ToolError(`Invalid arguments for onboarding_get_status: ${key} must be a string`, { details: [{ path: key, message: "Expected string" }] });
          }
        }
        if (context !== undefined && !context.oauth && context.workerAuth !== true) {
          throw new ToolError("Unauthorized: Tool 'onboarding_get_status' reads private data and requires a valid Worker authorization token.", { status: 401 });
        }
        const { apiUrl, apiKey } = resolveEnv(args, context);
        const headers: Record<string, string> = { Accept: "application/json" };
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
          headers["x-api-key"] = apiKey;
        }
        const response = await (context?.fetch ?? fetch)(`${apiUrl}/api/v1/onboarding-status`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(15000)
        });
        const text = await response.text();
        if (!response.ok) {
          const failure = failureOf(response.status, text, response.statusText);
          const data: Record<string, unknown> = { status: response.status, notEnabled: response.status === 404 };
          if (failure.code) data.code = failure.code;
          throw new ToolError(`Onboarding API error (HTTP ${response.status}: ${failure.message})`, data);
        }
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error("Onboarding API returned a non-JSON response");
        }
        const parsed = OnboardingStatusResponseSchema.safeParse(json);
        if (!parsed.success) throw new Error(`Onboarding API response schema mismatch: ${parsed.error.message}`);
        return parsed.data;
      }
    }
  ];
}
