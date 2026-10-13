import { NextResponse } from "next/server";
import { realtimeTraffic } from "@/lib/traffic/posthog";

export async function GET() {
  try {
    return NextResponse.json({data: await realtimeTraffic()}, {headers: {"Cache-Control": "public, max-age=30, s-maxage=30"}});
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason = /^(PostHog query is not configured|PostHog requires HTTPS|PostHog query failed \(HTTP \d{3}\)|Invalid PostHog aggregate|Invalid traffic count)$/.test(message)
      ? message : "Unexpected provider failure";
    const kind = error instanceof Error && ["TypeError", "SyntaxError", "TimeoutError", "AbortError", "ZodError", "Error"].includes(error.name)
      ? error.name : "unknown";
    // Only fixed application messages/status codes: never provider bodies, URLs or credentials.
    console.error("Traffic realtime unavailable", {reason, kind});
    return NextResponse.json({error: "Live traffic is temporarily unavailable"}, {status: 503});
  }
}
