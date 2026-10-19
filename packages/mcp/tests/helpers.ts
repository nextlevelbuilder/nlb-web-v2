import { handleWorkerFetch, type WorkerEnv } from "../src/transports/worker.js";
import { readJsonRpcMessages } from "../src/transports/legacy-sse.js";

export const MODERN = "2026-07-28";
export const LEGACY = "2025-11-25";
export const BASE = "https://mcp.nextlevelbuilder.io";

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: Record<string, unknown> & { content?: Array<{ type: string; text: string }>; isError?: boolean; structuredContent?: unknown };
  error?: { code: number; message: string; data?: unknown };
}

let nextId = 1;

/** A 2026-07-28 request: per-request _meta envelope plus the required standard headers. */
export function modernRequest(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}, url = `${BASE}/mcp`): Request {
  const name = typeof params.name === "string" ? params.name : undefined;
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MODERN,
      "Mcp-Method": method,
      ...(name ? { "Mcp-Name": name } : {}),
      ...headers
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": MODERN,
          "io.modelcontextprotocol/clientInfo": { name: "nlb-tests", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {}
        }
      }
    })
  });
}

/** A 2025-era request (no envelope). `protocolHeader` is omitted for the initialize handshake. */
export function legacyRequest(method: string, params?: Record<string, unknown>, headers: Record<string, string> = {}, protocolHeader: string | undefined = LEGACY, url = `${BASE}/mcp`): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(protocolHeader ? { "MCP-Protocol-Version": protocolHeader } : {}),
      ...headers
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, ...(params ? { params } : {}) })
  });
}

export async function rpc(request: Request, env?: WorkerEnv): Promise<{ status: number; response: Response; body: RpcResponse }> {
  const response = await handleWorkerFetch(request, env);
  const messages = await readJsonRpcMessages(response.clone());
  return { status: response.status, response, body: messages[0] as RpcResponse };
}

/** tools/call over the modern protocol, returning the parsed JSON text payload. */
export async function callTool(name: string, args: Record<string, unknown> = {}, env?: WorkerEnv, headers: Record<string, string> = {}) {
  const { status, response, body } = await rpc(modernRequest("tools/call", { name, arguments: args }, headers), env);
  const text = body?.result?.content?.[0]?.text;
  let payload: unknown;
  try {
    payload = text === undefined ? undefined : JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status, response, body, isError: body?.result?.isError, payload: payload as Record<string, any> };
}
