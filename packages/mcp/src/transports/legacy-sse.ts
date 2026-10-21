/**
 * @deprecated HTTP+SSE transport (MCP 2024-11-05): GET /sse opens a stream that announces
 * `/message?sessionId=…`; each POST /message is answered on that stream. Kept only for clients
 * that have not moved to Streamable HTTP (/mcp). Each posted message is bridged through the same
 * stateless handler as /mcp, so authorization and tool behaviour are identical. Sessions live in
 * isolate memory, exactly as before; a client whose stream lands on another isolate must reconnect.
 */

import { DEFAULT_MAX_REQUEST_BODY_SIZE, readRequestBody } from "@modelcontextprotocol/server";

type SseWriter = (event: string, data: string) => void;

const sessions = new Map<string, SseWriter>();

const encoder = new TextEncoder();

/** @deprecated See module docs. */
export function openLegacySseSession(headers: Record<string, string>): Response {
  const sessionId = crypto.randomUUID();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`));
      sessions.set(sessionId, (event, data) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // The client went away; drop the session so later posts fail fast.
          sessions.delete(sessionId);
        }
      });
    },
    cancel() {
      sessions.delete(sessionId);
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { ...headers, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }
  });
}

/** Parses every JSON-RPC message from a JSON or SSE response body. */
export async function readJsonRpcMessages(response: Response): Promise<unknown[]> {
  const text = await response.text();
  if (!text.trim()) return [];
  const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "text/event-stream") {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  const messages: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (event === "message" && data.length) messages.push(JSON.parse(data.join("\n")));
  }
  return messages;
}

/**
 * @deprecated See module docs. `serve` runs the posted message through the /mcp pipeline
 * (authentication + handler); its JSON-RPC output is written to the session's stream.
 */
export async function handleLegacySseMessage(
  request: Request,
  headers: Record<string, string>,
  serve: (request: Request) => Promise<Response>
): Promise<Response> {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  const write = sessionId ? sessions.get(sessionId) : undefined;
  if (!write) {
    return Response.json({ error: "Invalid or expired SSE session" }, { status: 400, headers });
  }
  const forwardHeaders = new Headers({ "Content-Type": "application/json", Accept: "application/json, text/event-stream" });
  const authorization = request.headers.get("Authorization");
  if (authorization) forwardHeaders.set("Authorization", authorization);
  const body = await readRequestBody(request, DEFAULT_MAX_REQUEST_BODY_SIZE);
  if (body.tooLarge) return Response.json({ error: "Request body too large" }, { status: 413, headers });
  const response = await serve(new Request(new URL("/mcp", request.url), {
    method: "POST",
    headers: forwardHeaders,
    body: body.text
  }));
  // Authentication challenges and malformed posts are answered on the POST itself, as before.
  if (!response.ok) return response;
  let messages: unknown[];
  try {
    messages = await readJsonRpcMessages(response);
  } catch (error) {
    return Response.json({ error: `Invalid MCP response: ${error instanceof Error ? error.message : String(error)}` }, { status: 502, headers });
  }
  for (const message of messages) write("message", JSON.stringify(message));
  return Response.json({ status: "accepted" }, { status: 202, headers });
}
