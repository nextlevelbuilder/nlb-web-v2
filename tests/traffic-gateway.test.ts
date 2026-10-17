import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrafficGateway } from "@/infra/clickhouse/traffic-gateway.mjs";
import { clickhouseQuery } from "@/lib/traffic/clickhouse";

const config = {
  user: "traffic-service", password: "test-only-storage-secret", database: "nlb_traffic_test",
  upstream: "http://clickhouse.internal:8123/",
};
const credentials = { "X-ClickHouse-User": config.user, "X-ClickHouse-Key": config.password };
const select = "SELECT count() AS pageViews FROM traffic_events WHERE product_id = {productId:String} FORMAT JSON";
const insert = 'INSERT INTO traffic_events FORMAT JSONEachRow\n{"product_id":"example","event":"page_view"}';
const upstreamFetch = vi.fn<typeof fetch>();
let server: Server;
let origin: string;

beforeEach(async () => {
  upstreamFetch.mockReset().mockResolvedValue(Response.json({ data: [{ pageViews: 3 }] }));
  server = createServer(createTrafficGateway(config, upstreamFetch));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected local HTTP server");
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

function request(parameters: Record<string, string> = {}, body = select, headers: Record<string, string> = credentials) {
  return fetch(`${origin}/?${new URLSearchParams({ database: config.database, ...parameters })}`, { method: "POST", headers, body });
}

describe("traffic gateway authentication and request boundaries", () => {
  it("exposes a content-free health check without reaching storage", async () => {
    const result = await fetch(`${origin}/healthz`);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ready: true });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it.each([
    {}, { "X-ClickHouse-User": config.user }, { "X-ClickHouse-Key": config.password },
    { ...credentials, "X-ClickHouse-User": "default" },
    { ...credentials, "X-ClickHouse-Key": "wrong" },
    { ...credentials, "X-ClickHouse-Key": "x".repeat(config.password.length) },
    { Authorization: `Basic ${Buffer.from(`${config.user}:${config.password}`).toString("base64")}` },
  ])("rejects missing or incorrect gateway credentials: %j", async (headers) => {
    const result = await request({}, select, headers as Record<string, string>);
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "Unauthorized" });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it.each(["user", "password", "query", "role", "roles", "session_id", "quota_key", "http_headers_progress_interval_ms"])("rejects caller-controlled %s URL parameters", async (parameter) => {
    const result = await request({ [parameter]: "override" });
    expect(result.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects duplicate parameters, overlong values, and database changes", async () => {
    const duplicate = await fetch(`${origin}/?database=${config.database}&database=default`, { method: "POST", headers: credentials, body: select });
    expect(duplicate.status).toBe(400);
    expect((await request({ param_productId: "x".repeat(257) })).status).toBe(400);
    expect((await request({ database: "default" })).status).toBe(403);
    expect((await fetch(origin, { method: "POST", headers: credentials, body: select })).status).toBe(403);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects alternate paths and methods even with valid credentials", async () => {
    expect((await fetch(`${origin}/?database=${config.database}`, { headers: credentials })).status).toBe(405);
    expect((await fetch(`${origin}/play`, { method: "POST", headers: credentials, body: select })).status).toBe(405);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("returns a controlled error for malformed absolute request targets", async () => {
    const malformed = Object.assign(Readable.from([]), {
      url: "http://[", method: "POST",
      headers: { "x-clickhouse-user": config.user, "x-clickhouse-key": config.password },
    });
    const response = { writeHead: vi.fn(), end: vi.fn(), headersSent: false };
    await expect(createTrafficGateway(config, upstreamFetch)(malformed, response)).resolves.toBeUndefined();
    expect(response.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("caps the actual UTF-8 body at 8192 bytes", async () => {
    const exact = `SELECT ${" ".repeat(8192 - 7)}`;
    expect((await request({}, exact)).status).toBe(200);
    upstreamFetch.mockClear();
    const oversized = await request({}, `SELECT ${"é".repeat(4093)}`);
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: "Body too large" });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("caps chunked uploads that have no Content-Length header", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("SELECT "));
        controller.enqueue(Buffer.alloc(4096, " "));
        controller.enqueue(Buffer.alloc(4096, " "));
        controller.close();
      },
    });
    const options: RequestInit & { duplex: "half" } = { method: "POST", headers: credentials, body, duplex: "half" };
    expect((await fetch(`${origin}/?database=${config.database}`, options)).status).toBe(413);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "DROP TABLE traffic_events"], [{}, insert],
    [{ async_insert: "1" }, select],
    [{ async_insert: "1" }, "INSERT INTO other_database.traffic_events FORMAT JSONEachRow\n{}"],
    [{ async_insert: "1" }, "INSERT INTO traffic_events SETTINGS max_memory_usage=0 FORMAT JSONEachRow\n{}"],
  ] as const)("rejects SQL outside the selected read or insert mode", async (parameters, body) => {
    expect((await request(parameters, body)).status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});

describe("traffic gateway upstream isolation", () => {
  it("forces credentials, database and resource limits while forwarding typed parameters", async () => {
    const result = await request({
      readonly: "0", max_execution_time: "0", max_threads: "100", max_memory_usage: "0",
      wait_end_of_query: "0", max_rows_to_read: "0", max_result_rows: "0",
      param_productId: "product&user=default", param_from: "2026-09-01T00:00:00Z", param_to: "2026-09-12T00:00:00Z",
    }, select, { ...credentials, Authorization: "Basic admin", "X-ClickHouse-Database": "default", "X-ClickHouse-Role": "admin", "X-ClickHouse-Query-Id": "injected", Cookie: "session_id=admin" });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ data: [{ pageViews: 3 }] });
    const [url, options] = upstreamFetch.mock.calls[0];
    const upstream = new URL(String(url));
    expect(upstream.origin).toBe("http://clickhouse.internal:8123");
    expect(Object.fromEntries(upstream.searchParams)).toEqual({
      database: config.database, readonly: "1", max_execution_time: "5", max_threads: "2", max_memory_usage: "268435456",
      wait_end_of_query: "1", max_rows_to_read: "2000000", max_result_rows: "1000",
      param_productId: "product&user=default", param_from: "2026-09-01T00:00:00Z", param_to: "2026-09-12T00:00:00Z",
    });
    expect(options).toMatchObject({ method: "POST", redirect: "error", headers: credentials, body: select });
    expect(options?.headers).toEqual(credentials);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts the application's real HTTP query client for reads and acknowledged inserts", async () => {
    vi.stubEnv("CLICKHOUSE_URL", origin);
    vi.stubEnv("CLICKHOUSE_USER", config.user);
    vi.stubEnv("CLICKHOUSE_PASSWORD", config.password);
    vi.stubEnv("CLICKHOUSE_DATABASE", config.database);
    expect(await clickhouseQuery(select, { productId: "example" })).toEqual([{ pageViews: 3 }]);
    upstreamFetch.mockResolvedValueOnce(new Response(""));
    expect(await clickhouseQuery(insert, {}, true)).toEqual([]);
    const [url, options] = upstreamFetch.mock.calls[1];
    const parameters = new URL(String(url)).searchParams;
    expect(options?.body).toBe(insert);
    expect(parameters.get("database")).toBe(config.database);
    expect(parameters.get("async_insert")).toBe("1");
    expect(parameters.get("wait_for_async_insert")).toBe("1");
    expect(parameters.get("async_insert_busy_timeout_ms")).toBe("200");
    expect(parameters.get("date_time_input_format")).toBe("best_effort");
    expect(parameters.has("readonly")).toBe(false);
  });

  it("does not disclose upstream failures or credentials", async () => {
    upstreamFetch.mockResolvedValueOnce(new Response(`DB error ${config.password}`, { status: 403 }));
    const rejected = await request();
    expect(rejected.status).toBe(502);
    expect(await rejected.json()).toEqual({ error: "Traffic storage unavailable" });
    upstreamFetch.mockRejectedValueOnce(new Error(`Connection failed ${config.password}`));
    const failed = await request();
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "Traffic storage unavailable" });
  });

  it("allows a 1 MiB response and cancels a larger streamed response without leaking partial data", async () => {
    const exact = JSON.stringify("x".repeat(1048576 - 2));
    upstreamFetch.mockResolvedValueOnce(new Response(exact));
    const accepted = await request();
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe(exact);

    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(Buffer.alloc(262144, "x")); },
      cancel,
    });
    upstreamFetch.mockResolvedValueOnce(new Response(stream));
    const rejected = await request();
    expect(rejected.status).toBe(502);
    expect(await rejected.json()).toEqual({ error: "Traffic response too large" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not expose a streaming upstream read error", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error(`Storage connection ${config.password}`)); },
    });
    upstreamFetch.mockResolvedValueOnce(new Response(stream));
    const failed = await request();
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "Traffic storage unavailable" });
  });

  it("fails closed when required configuration is absent", () => {
    for (const key of ["user", "password", "database", "upstream"] as const) {
      expect(() => createTrafficGateway({ ...config, [key]: "" }, upstreamFetch)).toThrow("Missing traffic gateway configuration");
    }
  });
});
