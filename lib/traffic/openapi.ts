const count = {type: "integer", minimum: 0};
const date = {type: "string", format: "date-time"};
const breakdown = {type: "array", items: {type: "object", required: ["name", "count"], properties: {name: {type: "string"}, count}}};
const publicProperties = {
  source: {type: "string", const: "clickhouse"}, from: date, to: date, updatedAt: date,
  pageViews: count, visitors: count, outboundClicks: count, activeVisitors: count,
  series: {type: "array", items: {type: "object", required: ["date", "pageViews", "visitors", "outboundClicks"], properties: {
    date: {type: "string", format: "date"}, pageViews: count, visitors: count, outboundClicks: count,
  }}},
};
export const trafficSchemas = {
  AnalyticsBlock: {type: "object", required: ["id", "type", "props"], properties: {
    id: {type: "string", minLength: 1}, type: {type: "string", const: "analytics"},
    props: {type: "object", properties: {title: {type: "string", minLength: 1, maxLength: 100, default: "Traffic"}, period: {type: "string", enum: ["7d", "30d", "90d"], default: "30d"}}},
  }},
  PublicTrafficSummary: {type: "object", required: Object.keys(publicProperties), properties: publicProperties},
  TrafficSummary: {type: "object", required: [...Object.keys(publicProperties), "referrers", "countries", "devices"], properties: {...publicProperties, referrers: breakdown, countries: breakdown, devices: breakdown}},
};
const slug = {name: "slug", in: "path", required: true, schema: {type: "string"}};
const response = (schema: string) => ({description: "Traffic aggregates. Visitors are unique daily sessions; activeVisitors counts sessions with page views in the last 5 minutes.", content: {"application/json": {schema: {type: "object", required: ["data"], properties: {data: {$ref: `#/components/schemas/${schema}`}}}}}});
export const trafficPaths = {
  "/api/v1/products/{slug}/traffic": {get: {
    operationId: "getProductTraffic", summary: "Query product traffic", tags: ["Analytics"],
    description: "Organization members and admins only. From/to are UTC ISO timestamps; defaults to the last 30 days, maximum 90 days, no future timestamps. Counts NLB product page traffic, not the external product website. Visitors rotate daily; summed across days they are not unique people. Top 10 referrers, countries and devices describe page views. Active visitors is always the current 5-minute window, independent of from/to.",
    security: [{BearerAuth: []}, {ApiKeyAuth: []}, {SessionAuth: []}],
    parameters: [slug, {name: "from", in: "query", schema: date}, {name: "to", in: "query", schema: date}],
    responses: {"200": response("TrafficSummary"), "400": {description: "Invalid date range"}, "401": {description: "Authentication required"}, "403": {description: "Organization membership required"}, "404": {description: "Product not found"}, "503": {description: "Storage unavailable"}},
  }},
  "/api/v1/products/{slug}/traffic/public": {get: {
    operationId: "getPublicProductTraffic", summary: "Read published Analytics block totals", tags: ["Analytics"],
    description: "Available only when the latest public document (approved or published) contains an Analytics block. Draft changes do not change this opt-in. Returns totals and daily series; referrers/countries/devices are private.",
    parameters: [slug, {name: "period", in: "query", schema: {type: "string", enum: ["7d", "30d", "90d"], default: "30d"}}],
    responses: {"200": response("PublicTrafficSummary"), "400": {description: "Invalid period"}, "404": {description: "Public analytics not enabled"}, "503": {description: "Storage unavailable"}},
  }},
};
