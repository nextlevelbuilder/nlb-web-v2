// Lets the page skip loading the chat widget when the Dewee backend is not configured for this
// deployment. Says nothing about which settings are missing.
import { NextResponse } from "next/server";
import { getDeweeRuntimeEnv, isDeweeChatConfigured } from "@/lib/chat/dewee-runtime-env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { enabled: isDeweeChatConfigured(getDeweeRuntimeEnv()) },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
