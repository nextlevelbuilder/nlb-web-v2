import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueUser } from "@/lib/builder-league/access";
import { recordModerationAction } from "@/lib/builder-league/audit";
import { enforceUserRateLimit, withBuilderErrors } from "@/lib/builder-league/http";
import { exportBuilderData } from "@/lib/builder-league/privacy-requests";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/builder-me/export - everything the Builder League stores about the caller, as a JSON
 * download. Session or `builder:read` caller; always the caller's own data. Audited like the admin export.
 */
export async function GET(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller, actorRole } = await requireBuilderLeagueUser(request, "builder:read", db);
    const userId = caller.user.id;
    enforceUserRateLimit(userId, "builder-privacy-self");
    const data = await exportBuilderData(db, userId);
    await recordModerationAction(db, {
      targetType: "privacy_request",
      targetId: userId,
      action: "export",
      actorId: userId,
      actorRole,
      reasonCodes: ["self_service"],
    });
    return NextResponse.json(
      { data },
      {
        headers: {
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="builder-league-export-${userId}.json"`,
        },
      }
    );
  });
}
