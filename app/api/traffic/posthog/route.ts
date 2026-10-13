import { NextResponse } from "next/server";
import { z } from "zod";
import { allowTrafficRequest, readTrafficBody } from "@/lib/traffic/collection";
import { captureSitePageview } from "@/lib/traffic/posthog";

const BodySchema = z.object({
  visitorId: z.string().uuid(),
  path: z.string().min(1).max(200).regex(/^\/[A-Za-z0-9\-._~/]*$/),
}).strict();

export async function POST(request: Request) {
  let body;
  try { body = BodySchema.parse(await readTrafficBody(request)); }
  catch { return NextResponse.json({error: "Invalid traffic event"}, {status: 400}); }
  if (!allowTrafficRequest(request, `posthog:${body.visitorId}:${body.path}`)) return new NextResponse(null, {status: 204});
  try {
    await captureSitePageview(body);
    return new NextResponse(null, {status: 202});
  } catch { return NextResponse.json({error: "PostHog capture unavailable"}, {status: 503}); }
}
