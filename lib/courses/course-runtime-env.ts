import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Runtime vars and secrets the Courses feature reads. All optional: callers decide how to fail. */
export type CourseEnvKey =
  | "COURSES_ACCESS_PLANS"
  | "CF_STREAM_SIGNING_KEY_ID"
  | "CF_STREAM_SIGNING_KEY_JWK"
  | "CF_STREAM_CUSTOMER_SUBDOMAIN"
  | "CF_ACCOUNT_ID"
  | "CF_STREAM_API_TOKEN";
export type CourseRuntimeEnv = Partial<Record<CourseEnvKey, string>>;

/**
 * Resolve Courses config per request. Inside the Worker the OpenNext context env holds wrangler
 * vars and secrets; local Next, scripts and unit tests have no context and fall back to process.env.
 */
export function getCourseRuntimeEnv(): CourseRuntimeEnv {
  try {
    const context = getCloudflareContext();
    if (context?.env) return context.env as CourseRuntimeEnv;
  } catch {
    // No OpenNext request context (local Node, vitest).
  }
  return process.env as CourseRuntimeEnv;
}
