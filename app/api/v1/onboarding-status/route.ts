import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getOnboardingStatus } from "@/lib/onboarding/status";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function fail(status: 401 | 404 | 500, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * GET /api/v1/onboarding-status — the caller's membership onboarding state (payment, membership,
 * profile, Discord/Telegram connections). Read-only counterpart of `/api/onboarding/status` for API
 * keys, MCP delegation (`mcp:read`) and sessions: it never verifies a Polar checkout. 404 while
 * `ONBOARDING_V2_ENABLED` is off.
 */
export async function GET(request: Request) {
  if (!isOnboardingV2Enabled()) return fail(404, "not_found", "Onboarding is not enabled on this environment.");
  const db = getDb();
  const caller = await resolveCaller(request.headers, db, {
    scope: "mcp:read",
    method: request.method,
    path: new URL(request.url).pathname,
  });
  if (!caller?.user) return fail(401, "unauthorized", "Sign in or send an API key.");
  try {
    const status = await getOnboardingStatus(db, {
      id: caller.user.id,
      email: caller.user.email,
      emailVerified: caller.user.emailVerified,
    });
    return NextResponse.json({ data: status }, { headers: NO_STORE });
  } catch (err) {
    console.error("onboarding status: unhandled error", err instanceof Error ? err.stack || err.message : err);
    return fail(500, "internal_error", "Internal server error");
  }
}
