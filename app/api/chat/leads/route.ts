// Leads left through the website chat. The widget calls this from the `lead.save` page action only
// after the visitor approved the save in its confirmation dialog. Not part of /api/v1.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { chatLeadSchema, hashClientIp, notifyChatLead, saveChatLead } from "@/lib/chat/chat-lead-service";
import { getDeweeRuntimeEnv } from "@/lib/chat/dewee-runtime-env";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

/** Only pages of this site may save leads; a browser always sends Origin on a cross-site POST. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function sessionUserId(request: Request): Promise<string | null> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 413 });

  let input;
  try {
    input = chatLeadSchema.parse(JSON.parse(raw));
  } catch (error) {
    const issues = error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) : ["invalid JSON"];
    return NextResponse.json({ error: "Invalid lead", issues }, { status: 400 });
  }

  const env = getDeweeRuntimeEnv();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  const ipHash = hashClientIp(ip, env.TRAFFIC_HASH_SECRET || env.BETTER_AUTH_SECRET);
  const db = getDb();
  const result = await saveChatLead(input, { ipHash, userId: await sessionUserId(request) }, db);
  if (!result.ok) return NextResponse.json({ error: "Too many leads from this address, try again later" }, { status: 429 });

  await notifyChatLead(env.DISCORD_LEADS_WEBHOOK_URL || env.DISCORD_SALES_WEBHOOK_URL, { ...input, id: result.id });
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
