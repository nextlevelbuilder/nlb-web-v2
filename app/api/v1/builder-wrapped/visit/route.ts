import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import {
  SHARE_REF_COOKIE,
  SHARE_REF_MAX_AGE_S,
  VISITOR_COOKIE,
  isValidVisitorId,
  recordShareVisit,
  sanitizeUtm,
} from "@/lib/builder-league/attribution";
import { resolveShareToken } from "@/lib/builder-league/share-links";
import { requirePublicBuilderSurface } from "@/lib/builder-league/wrapped-access";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().max(80), utm: z.record(z.string()).optional() });

/**
 * POST /api/v1/builder-wrapped/visit — beacon from a shared Year in Review page. Records one visit per
 * browser, link and day (hashed random visitor id, no IP) and remembers the link for signup
 * attribution. The page only calls it when the browser sends neither DNT nor GPC.
 */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requirePublicBuilderSurface(request, db);
    const body = Body.parse(await request.json().catch(() => ({})));
    const link = await resolveShareToken(db, body.token, { kind: "year_review" });
    if (!link) return ok({ recorded: false });

    const jar = await cookies();
    const existing = jar.get(VISITOR_COOKIE)?.value;
    const visitorId = isValidVisitorId(existing) ? existing : crypto.randomUUID();
    const secure = new URL(request.url).protocol === "https:";
    const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: SHARE_REF_MAX_AGE_S };
    jar.set(VISITOR_COOKIE, visitorId, cookieOptions);
    jar.set(SHARE_REF_COOKIE, link.id, cookieOptions);

    const recorded = await recordShareVisit(db, { shareLinkId: link.id, visitorId, utm: sanitizeUtm(body.utm ?? {}) });
    return ok({ recorded });
  });
}
