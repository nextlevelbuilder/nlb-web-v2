import { RealtimeTrafficSchema, type RealtimeTraffic } from "@/packages/contracts/src";
import { visitorHash, trafficCount } from "./traffic";
import { trafficConfig } from "./config";

let cached: { expires: number; data: RealtimeTraffic } | undefined;
let pending: Promise<RealtimeTraffic> | undefined;

/** Every page view on the site is captured with one date-salted site identifier. */
const SITE_SURFACE = "site";

/** True when the public PostHog key and host are set; without them page views are not collected. */
export function isSitePageviewCaptureConfigured(): boolean {
  const config = trafficConfig();
  return Boolean(config.NEXT_PUBLIC_POSTHOG_KEY && config.NEXT_PUBLIC_POSTHOG_HOST);
}

export async function captureSitePageview(input: { visitorId: string; path: string }) {
  const config = trafficConfig();
  const token = config.NEXT_PUBLIC_POSTHOG_KEY;
  const host = config.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) throw new Error("PostHog capture is not configured");
  const url = new URL("/i/v0/e/", host);
  if (url.protocol !== "https:") throw new Error("PostHog requires HTTPS");
  const response = await fetch(url, {
    method: "POST", redirect: "manual", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({api_key: token, event: "$pageview", timestamp: new Date().toISOString(),
      properties: {distinct_id: visitorHash(input.visitorId, SITE_SURFACE, new Date()),
        $pathname: input.path, $process_person_profile: false, nlb_surface: SITE_SURFACE}}),
    signal: AbortSignal.timeout(5000), cache: "no-store",
  });
  if (!response.ok) throw new Error("PostHog capture failed");
}

/** True when the PostHog query credentials needed for live traffic are present. */
export function isRealtimeTrafficConfigured(): boolean {
  const {POSTHOG_HOST, POSTHOG_API_KEY, POSTHOG_PROJECT_ID} = trafficConfig();
  return Boolean(POSTHOG_HOST && POSTHOG_API_KEY && POSTHOG_PROJECT_ID && /^\d+$/.test(POSTHOG_PROJECT_ID));
}

async function fetchRealtime(): Promise<RealtimeTraffic> {
  const {POSTHOG_HOST, POSTHOG_API_KEY, POSTHOG_PROJECT_ID} = trafficConfig();
  if (!isRealtimeTrafficConfigured()) throw new Error("PostHog query is not configured");
  const url = new URL(`/api/projects/${POSTHOG_PROJECT_ID}/query/`, POSTHOG_HOST);
  if (url.protocol !== "https:") throw new Error("PostHog requires HTTPS");
  const response = await fetch(url, {
    method: "POST", redirect: "manual", headers: {Authorization: `Bearer ${POSTHOG_API_KEY}`, "Content-Type": "application/json"},
    body: JSON.stringify({refresh: "force_blocking", query: {kind: "HogQLQuery", query: "SELECT uniqExactIf(distinct_id, timestamp >= now() - INTERVAL 5 MINUTE), countIf(timestamp >= now() - INTERVAL 30 DAY), uniqExactIf(distinct_id, timestamp >= now() - INTERVAL 30 DAY) FROM events WHERE event = '$pageview' AND (properties.nlb_surface = 'site' OR properties.nlb_surface = 'build-with-us') AND timestamp >= now() - INTERVAL 30 DAY AND timestamp <= now()"}}),
    signal: AbortSignal.timeout(10000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`PostHog query failed (HTTP ${response.status})`);
  const result = await response.json() as {results?: unknown[][]};
  const row = result.results?.[0];
  if (!row || row.length !== 3 || row.some((value) => typeof value !== "number" && typeof value !== "string")) throw new Error("Invalid PostHog aggregate");
  return RealtimeTrafficSchema.parse({source: "posthog", activeVisitors: trafficCount(row[0]), pageViews30d: trafficCount(row[1]),
    visitors30d: trafficCount(row[2]), windowMinutes: 5, windowDays: 30, updatedAt: new Date().toISOString()});
}
export async function realtimeTraffic() {
  if (cached && cached.expires > Date.now()) return cached.data;
  pending ??= fetchRealtime().then((data) => {cached = {data, expires: Date.now() + 30000}; return data;}).finally(() => {pending = undefined;});
  return pending;
}
