import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireBuilderLeagueAdmin } from "@/lib/builder-league/access";
import { recordModerationAction } from "@/lib/builder-league/audit";
import { enforceUserRateLimit, withBuilderErrors } from "@/lib/builder-league/http";
import { exportBuilderData } from "@/lib/builder-league/privacy-requests";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

/** Admin: everything the Builder League stores about one member, as a JSON download. Audited. */
export async function GET(request: Request, { params }: Params) {
  return withBuilderErrors(async () => {
    const db = getDb();
    const { caller, actorRole } = await requireBuilderLeagueAdmin(request, db);
    enforceUserRateLimit(caller.user.id, "builder-privacy");
    const { userId } = await params;
    const data = await exportBuilderData(db, userId);
    await recordModerationAction(db, {
      targetType: "privacy_request",
      targetId: userId,
      action: "export",
      actorId: caller.user.id,
      actorRole,
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
