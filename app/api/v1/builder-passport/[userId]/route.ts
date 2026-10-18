import { getDb } from "@/lib/db";
import { resolveCaller } from "@/lib/auth-api-key";
import { getViewerAccess } from "@/lib/builder-league/access";
import { BuilderApiError, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { getPassport } from "@/lib/builder-league/passport";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

// GET /api/v1/builder-passport/{userId} - consent-filtered passport. Signed-out callers are allowed
// once the league is enabled; while the flag is off only admins and pilot members see passports.
export async function GET(request: Request, { params }: RouteParams) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { userId } = await params;
    if (!userId || userId.length > 128) throw new BuilderApiError(404, "not_found", "Not found");
    const caller = await resolveCaller(request.headers, db, {
      scope: "mcp:read",
      method: request.method,
      path: new URL(request.url).pathname,
    });
    const viewer = caller?.user ? { id: caller.user.id, role: caller.user.role } : null;
    const access = await getViewerAccess(db, viewer);
    if (!access.flagEnabled && !access.canUse) throw new BuilderApiError(404, "not_found", "Not found");
    const passport = await getPassport(db, userId, viewer ? { id: viewer.id, isAdmin: access.isAdmin } : null);
    if (!passport) throw new BuilderApiError(404, "not_found", "Not found");
    return ok(passport);
  });
}
