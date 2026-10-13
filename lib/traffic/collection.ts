const recent = new Map<string, number>();

/** Best-effort per-isolate burst protection; production should also apply edge rate limits. */
export function allowTrafficRequest(request: Request, identity: string, now = Date.now()) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return false;
  if (/bot|crawler|spider|headless/i.test(request.headers.get("user-agent") || "")) return false;
  const last = recent.get(identity);
  if (last !== undefined && now - last < 1000) return false;
  if (recent.size >= 10000) {
    for (const [key, timestamp] of recent) if (now - timestamp > 60000) recent.delete(key);
    if (recent.size >= 10000) return false;
  }
  recent.set(identity, now);
  return true;
}

export async function readTrafficBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Expected JSON");
  // Stream cap also covers chunked requests and false/missing Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error("Traffic payload too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.length;}
  return JSON.parse(new TextDecoder().decode(body));
}
