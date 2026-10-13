import { NextResponse } from "next/server";
import { getProductPulse, sampleProductPulse } from "@/lib/domain/product-pulse";

interface RouteParams { params: Promise<{ slug: string }> }
const headers = { "Cache-Control": "no-store" };

async function hasBody(request: Request): Promise<boolean> {
  if (!request.body) return false;
  // Next's Node adapter can expose an empty stream even for a bodyless POST.
  // Inspect at most one chunk and bound the wait; never buffer arbitrary input.
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("body_timeout")), 1000); }),
    ]);
    return !chunk.done;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const data = await getProductPulse(slug);
    return data ? NextResponse.json({ data }, { headers }) :
      NextResponse.json({ error: "Published product with Pulse not found" }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: "Pulse is temporarily unavailable" }, { status: 503, headers });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  // Browser checks originate from this site. API clients may omit Origin.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-origin sampling is not allowed" }, { status: 403, headers });
  }
  if (await hasBody(request)) {
    return NextResponse.json({ error: "Pulse sampling accepts no request body; it uses the published website" }, { status: 400, headers });
  }
  try {
    const { slug } = await params;
    const result = await sampleProductPulse(slug);
    return result ? NextResponse.json(result, { headers }) :
      NextResponse.json({ error: "Published product with Pulse not found" }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: "Pulse is temporarily unavailable" }, { status: 503, headers });
  }
}
