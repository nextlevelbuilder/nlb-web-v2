import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createTrafficGateway(config, upstreamFetch = fetch) {
  if (!config.user || !config.password || !config.database || !config.upstream) throw new Error('Missing traffic gateway configuration');
  return async (request, response) => {
    const reply = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    if (request.url === '/healthz' && request.method === 'GET') return reply(200, { ready: true });
    if (!sameSecret(request.headers['x-clickhouse-user'], config.user) || !sameSecret(request.headers['x-clickhouse-key'], config.password)) return reply(401, { error: 'Unauthorized' });
    let incoming;
    try { incoming = new URL(request.url, 'http://gateway'); }
    catch { return reply(400, { error: 'Invalid request target' }); }
    if (request.method !== 'POST' || incoming.pathname !== '/') return reply(405, { error: 'POST required' });
    // Never forward caller authentication, database overrides, URLs or SQL from query parameters.
    const upstream = new URL(config.upstream);
    const allowed = new Set(['database', 'readonly', 'max_execution_time', 'max_threads', 'max_memory_usage', 'wait_end_of_query',
      'async_insert', 'wait_for_async_insert', 'async_insert_busy_timeout_ms', 'date_time_input_format', 'max_rows_to_read', 'max_result_rows',
      'param_productId', 'param_from', 'param_to']);
    for (const [name, value] of incoming.searchParams) {
      if (!allowed.has(name) || value.length > 256 || incoming.searchParams.getAll(name).length !== 1) return reply(400, { error: 'Unsupported parameter' });
      if (name.startsWith('param_')) upstream.searchParams.set(name, value);
    }
    if (incoming.searchParams.get('database') !== config.database) return reply(403, { error: 'Wrong database' });
    const insert = incoming.searchParams.get('async_insert') === '1';
    upstream.searchParams.set('database', config.database);
    upstream.searchParams.set('max_execution_time', '5');
    upstream.searchParams.set('max_threads', '2');
    upstream.searchParams.set('max_memory_usage', '268435456');
    upstream.searchParams.set('wait_end_of_query', '1');
    upstream.searchParams.set('max_rows_to_read', '2000000');
    upstream.searchParams.set('max_result_rows', '1000');
    if (insert) {
      upstream.searchParams.set('async_insert', '1');
      upstream.searchParams.set('wait_for_async_insert', '1');
      upstream.searchParams.set('async_insert_busy_timeout_ms', '200');
      upstream.searchParams.set('date_time_input_format', 'best_effort');
    } else upstream.searchParams.set('readonly', '1');
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) return reply(413, { error: 'Body too large' });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      if (insert ? !body.startsWith('INSERT INTO traffic_events FORMAT JSONEachRow\n') : !body.startsWith('SELECT ')) return reply(400, { error: 'Unsupported query' });
      const result = await upstreamFetch(upstream, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'X-ClickHouse-User': config.user, 'X-ClickHouse-Key': config.password }, body,
      });
      if (!result.ok) return reply(502, { error: 'Traffic storage unavailable' });
      const output = [];
      let outputSize = 0;
      if (result.body) {
        for await (const chunk of result.body) {
          outputSize += chunk.length;
          if (outputSize > 1048576) return reply(502, { error: 'Traffic response too large' });
          output.push(chunk);
        }
      }
      const data = Buffer.concat(output);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(data);
    } catch { if (!response.headersSent) reply(502, { error: 'Traffic storage unavailable' }); }
  };
}

// Kubernetes ConfigMap volumes resolve the entrypoint through a timestamped symlink.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(createTrafficGateway({
    user: process.env.CLICKHOUSE_USER, password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DATABASE, upstream: process.env.CLICKHOUSE_UPSTREAM,
  }));
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.listen(8080, '0.0.0.0');
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
