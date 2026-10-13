import { trafficConfig } from "./config";

/** HTTP only: safe for the Workers request runtime; no TCP pool or shared client. */
export async function clickhouseQuery<T>(query: string, parameters: Record<string, string> = {}, insert = false): Promise<T[]> {
  const { CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD, CLICKHOUSE_DATABASE } = trafficConfig();
  if (!CLICKHOUSE_URL || !CLICKHOUSE_USER || !CLICKHOUSE_PASSWORD || !CLICKHOUSE_DATABASE ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(CLICKHOUSE_DATABASE)) {
    throw new Error("Traffic storage is not configured");
  }
  const url = new URL(CLICKHOUSE_URL);
  if (url.username || url.password || (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Traffic storage requires HTTPS (except local port-forward)");
  }
  url.searchParams.set("database", CLICKHOUSE_DATABASE);
  url.searchParams.set("max_execution_time", "5");
  url.searchParams.set("max_threads", "2");
  url.searchParams.set("max_memory_usage", "268435456");
  url.searchParams.set("wait_end_of_query", "1");
  if (insert) {
    url.searchParams.set("date_time_input_format", "best_effort");
    url.searchParams.set("async_insert", "1");
    url.searchParams.set("wait_for_async_insert", "1");
    url.searchParams.set("async_insert_busy_timeout_ms", "200");
  } else {
    url.searchParams.set("readonly", "1");
    url.searchParams.set("max_rows_to_read", "2000000");
    url.searchParams.set("max_result_rows", "1000");
  }
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(`param_${key}`, value);
  const response = await fetch(url, {
    method: "POST", redirect: "manual", cache: "no-store",
    headers: { "X-ClickHouse-User": CLICKHOUSE_USER, "X-ClickHouse-Key": CLICKHOUSE_PASSWORD },
    body: query, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Traffic storage request failed");
  if (insert) { await response.text(); return []; }
  const result = await response.json() as { data?: T[] };
  if (!Array.isArray(result.data)) throw new Error("Invalid traffic storage response");
  return result.data;
}
