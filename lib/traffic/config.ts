import { getCloudflareContext } from "@opennextjs/cloudflare";

type TrafficKey = "CLICKHOUSE_URL" | "CLICKHOUSE_DATABASE" | "CLICKHOUSE_USER" | "CLICKHOUSE_PASSWORD" |
  "TRAFFIC_HASH_SECRET" | "POSTHOG_HOST" | "POSTHOG_API_KEY" | "POSTHOG_PROJECT_ID" |
  "NEXT_PUBLIC_POSTHOG_KEY" | "NEXT_PUBLIC_POSTHOG_HOST";
export type TrafficConfig = Partial<Record<TrafficKey, string>>;

/** Resolve secrets per request. A Worker with missing bindings must not use Node fallback. */
export function trafficConfig(): TrafficConfig {
  try {
    const context = getCloudflareContext();
    if (context?.env) return context.env as TrafficConfig;
  } catch {
    // Local Next, scripts and unit tests have no OpenNext Worker request context.
  }
  return process.env as TrafficConfig;
}
