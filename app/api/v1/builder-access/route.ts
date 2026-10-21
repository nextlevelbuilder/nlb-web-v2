import { getDb } from "@/lib/db";
import { resolveCaller } from "@/lib/auth-api-key";
import { getViewerAccess } from "@/lib/builder-league/access";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/builder-access — whether the site menu should show the Builder League entry to the caller:
 * true when the league is open (flag on) or the caller may use it (admin, pilot member). Always 200, so
 * the probe never logs an error in the browser; it reveals nothing beyond the caller's own access.
 */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const caller = await resolveCaller(request.headers, db, {
      scope: "mcp:read",
      method: request.method,
      path: new URL(request.url).pathname,
    });
    const access = await getViewerAccess(db, caller?.user ? { id: caller.user.id, role: caller.user.role } : null);
    return ok({ showNav: access.flagEnabled || access.canUse });
  });
}
