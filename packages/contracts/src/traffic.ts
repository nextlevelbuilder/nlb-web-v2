import { z } from "zod";

const count = z.number().int().nonnegative();
export const TrafficSeriesPointSchema = z.object({
  date: z.string(), pageViews: count, visitors: count, outboundClicks: count,
});
const breakdown = z.array(z.object({ name: z.string(), count }));
export const PublicTrafficSummarySchema = z.object({
  source: z.literal("clickhouse"),
  from: z.string().datetime(), to: z.string().datetime(), updatedAt: z.string().datetime(),
  pageViews: count, visitors: count, outboundClicks: count, activeVisitors: count,
  series: z.array(TrafficSeriesPointSchema),
});
export const TrafficSummarySchema = PublicTrafficSummarySchema.extend({
  referrers: breakdown, countries: breakdown, devices: breakdown,
});
export const RealtimeTrafficSchema = z.object({
  source: z.literal("posthog"), activeVisitors: count,
  pageViews30d: count, visitors30d: count,
  updatedAt: z.string().datetime(), windowMinutes: z.literal(5), windowDays: z.literal(30),
});
export const TrafficEventSchema = z.object({
  productSlug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  event: z.enum(["page_view", "outbound_click"]),
  visitorId: z.string().uuid(),
  referrer: z.string().max(2048).optional(),
}).strict().refine((v) => v.productSlug || v.event === "page_view", {
  message: "Outbound clicks require a product",
});
export type TrafficSummary = z.infer<typeof TrafficSummarySchema>;
export type PublicTrafficSummary = z.infer<typeof PublicTrafficSummarySchema>;
export type RealtimeTraffic = z.infer<typeof RealtimeTrafficSchema>;
