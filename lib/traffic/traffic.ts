import { createHmac } from "node:crypto";
import { z } from "zod";
import { PublicTrafficSummarySchema, TrafficSummarySchema, type TrafficSummary } from "@/packages/contracts/src";
import { clickhouseQuery } from "./clickhouse";
import { trafficConfig } from "./config";

export const TrafficPeriodSchema = z.enum(["7d", "30d", "90d"]);
const DAY = 86400000;
export function trafficRange(search: URLSearchParams, now = new Date()) {
  const schema = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() });
  const values = schema.parse(Object.fromEntries(search));
  const to = values.to ? new Date(values.to) : now;
  const from = values.from ? new Date(values.from) : new Date(to.getTime() - 30 * DAY);
  if (from >= to || to.getTime() > now.getTime() || to.getTime() - from.getTime() > 90 * DAY) {
    throw new RangeError("Use an ordered time range of at most 90 days ending no later than now");
  }
  return { from: from.toISOString(), to: to.toISOString() };
}
export function publicTrafficRange(period: string, now = new Date()) {
  const days = parseInt(TrafficPeriodSchema.parse(period), 10);
  return { from: new Date(now.getTime() - days * DAY).toISOString(), to: now.toISOString() };
}
export function visitorHash(visitorId: string, productId: string, now: Date) {
  const secret = trafficConfig().TRAFFIC_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Traffic hashing is not configured");
  return createHmac("sha256", secret).update(`${now.toISOString().slice(0, 10)}:${productId}:${visitorId}`).digest("hex");
}
export function referrerHost(value?: string) {
  try { const url = new URL(value || ""); return ["https:", "http:"].includes(url.protocol) ? url.hostname.slice(0, 253) : ""; }
  catch { return ""; }
}
export function deviceCategory(ua: string) {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  return /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop";
}
export async function recordTraffic(input: { productId: string; visitorId: string; event: "page_view" | "outbound_click"; referrer?: string }, request: Request) {
  const now = new Date();
  const row = {
    event_id: crypto.randomUUID(), occurred_at: now.toISOString(), product_id: input.productId,
    event: input.event, visitor_hash: visitorHash(input.visitorId, input.productId, now),
    referrer_host: referrerHost(input.referrer),
    country: /^[A-Z]{2}$/.test(request.headers.get("cf-ipcountry") || "") ? request.headers.get("cf-ipcountry") : "",
    device: deviceCategory(request.headers.get("user-agent") || ""),
  };
  await clickhouseQuery(`INSERT INTO traffic_events FORMAT JSONEachRow\n${JSON.stringify(row)}`, {}, true);
}
const rangeFilter = "product_id = {productId:String} AND occurred_at >= parseDateTime64BestEffort({from:String}) AND occurred_at < parseDateTime64BestEffort({to:String})";
const totalsSql = "countIf(event = 'page_view') AS pageViews, uniqExactIf(visitor_hash, event = 'page_view') AS visitors, countIf(event = 'outbound_click') AS outboundClicks";
type Counts = { pageViews: string | number; visitors: string | number; outboundClicks: string | number };
export function trafficCount(value: unknown): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) throw new Error("Invalid traffic count");
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid traffic count");
  return count;
}
function counts(row: Counts) { return { pageViews: trafficCount(row.pageViews), visitors: trafficCount(row.visitors), outboundClicks: trafficCount(row.outboundClicks) }; }
export async function queryTraffic(productId: string, range: {from: string; to: string}, details = true): Promise<TrafficSummary> {
  const parameters = { productId, ...range };
  const now = new Date();
  const breakdown = async (column: "referrer_host" | "country" | "device") => {
    if (!details) return [];
    const rows = await clickhouseQuery<{name: string; count: string | number}>(
      `SELECT ${column} AS name, count() AS count FROM traffic_events WHERE ${rangeFilter} AND event = 'page_view' GROUP BY name ORDER BY count DESC, name ASC LIMIT 10 FORMAT JSON`, parameters);
    return rows.map((row) => ({ name: row.name || "Unknown", count: trafficCount(row.count) }));
  };
  const [totals, series, active, referrers, countries, devices] = await Promise.all([
    clickhouseQuery<Counts>(`SELECT ${totalsSql} FROM traffic_events WHERE ${rangeFilter} FORMAT JSON`, parameters),
    clickhouseQuery<Counts & {date: string}>(`SELECT toString(toDate(occurred_at, 'UTC')) AS date, ${totalsSql} FROM traffic_events WHERE ${rangeFilter} GROUP BY date ORDER BY date FORMAT JSON`, parameters),
    clickhouseQuery<{activeVisitors: string | number}>(`SELECT uniqExactIf(visitor_hash, event = 'page_view') AS activeVisitors FROM traffic_events WHERE product_id = {productId:String} AND occurred_at >= now() - INTERVAL 5 MINUTE AND occurred_at <= now() FORMAT JSON`, {productId}),
    breakdown("referrer_host"), breakdown("country"), breakdown("device"),
  ]);
  if (!totals[0] || !active[0]) throw new Error("Invalid traffic aggregates");
  const byDay = new Map(series.map((row) => [row.date, counts(row)]));
  const filled = [];
  for (let cursor = new Date(range.from).setUTCHours(0, 0, 0, 0); cursor < Date.parse(range.to); cursor += DAY) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    filled.push({date, ...(byDay.get(date) || {pageViews: 0, visitors: 0, outboundClicks: 0})});
  }
  const result = TrafficSummarySchema.safeParse({source: "clickhouse", ...range, updatedAt: now.toISOString(), ...counts(totals[0]),
    activeVisitors: trafficCount(active[0].activeVisitors), series: filled, referrers, countries, devices});
  if (!result.success) throw new Error("Invalid traffic aggregates");
  return result.data;
}
export function publicTraffic(summary: TrafficSummary) { return PublicTrafficSummarySchema.parse(summary); }
