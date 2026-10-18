import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { BuilderApiError, enforceUserRateLimit, ok, withBuilderErrors } from "@/lib/builder-league/http";
import { buildShareUrl, shareFunnel } from "@/lib/builder-league/attribution";
import { createShareLink, listShareLinks, serializeShareLink } from "@/lib/builder-league/share-links";
import { localYear } from "@/lib/builder-league/time-windows";
import { isReviewableYear, parseYearParam } from "@/lib/builder-league/wrapped-access";
import { ensureYearSnapshot } from "@/lib/builder-league/year-review";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ year: string }> };

async function resolveYear(context: Context): Promise<number> {
  const year = parseYearParam((await context.params).year);
  if (!isReviewableYear(year, localYear(new Date()))) throw new BuilderApiError(404, "not_found", "Not found");
  return year;
}

/** GET /api/v1/builder-year/{year}/share — the caller's share links for the year and their funnel. */
export async function GET(request: Request, context: Context) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const year = await resolveYear(context);
    const { caller } = await requireBuilderLeagueUser(request, "builder:read", db);
    const [links, funnel] = await Promise.all([
      listShareLinks(db, caller.user.id, { kind: "year_review", year }),
      shareFunnel(db, caller.user.id, year),
    ]);
    return ok({ links: links.map(serializeShareLink), funnel });
  });
}

const PostBody = z.object({ locale: z.enum(["en", "vi"]).default("en") });

/**
 * POST /api/v1/builder-year/{year}/share — creates a share link. The URL (with its token) is returned
 * once; only a hash is stored. Members only: API keys and agents cannot publish a member's year.
 */
export async function POST(request: Request, context: Context) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const year = await resolveYear(context);
    const { caller, actorRole } = await requireBuilderLeagueUser(request, "builder:write", db);
    if (actorRole === "api" || actorRole === "agent") throw new BuilderApiError(403, "session_required", "Only the member can share their year.");
    enforceUserRateLimit(caller.user.id, "builder-share");
    const body = PostBody.parse(await request.json().catch(() => ({})));
    await ensureYearSnapshot(db, caller.user.id, year, new Date());
    const { link, token } = await createShareLink(db, { userId: caller.user.id, kind: "year_review", year });
    const url = buildShareUrl({ origin: siteUrl(), locale: body.locale, year, token });
    return ok({ link: serializeShareLink(link), url }, undefined, 201);
  });
}
