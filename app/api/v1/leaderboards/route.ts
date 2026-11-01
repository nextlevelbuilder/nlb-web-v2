import { BuilderApiError, ok } from "@/lib/builder-league/http";
import { getLatestRankingSnapshot } from "@/lib/domain/rankings";
import { requireAllowed, runMemberRoute } from "@/lib/access/http/member-route";

export const dynamic = "force-dynamic";

const WINDOWS = ["daily", "weekly", "monthly"] as const;
type RankingWindow = (typeof WINDOWS)[number];

/**
 * The latest frozen directory leaderboard (`?board=directory`, `?window=daily|weekly|monthly`), a public
 * read checked through `leaderboard:<board>`. `data` is null until the first snapshot exists; this route
 * never computes one. Builder League boards stay at `/api/v1/builder-rankings`.
 */
export async function GET(request: Request) {
  return runMemberRoute(request, async (context) => {
    const query = new URL(request.url).searchParams;
    const board = query.get("board") ?? "directory";
    if (board !== "directory") throw new BuilderApiError(400, "invalid_input", "board must be directory");
    const window = (query.get("window") ?? "daily") as RankingWindow;
    if (!WINDOWS.includes(window)) throw new BuilderApiError(400, "invalid_input", `window must be one of ${WINDOWS.join(", ")}`);
    await requireAllowed(context, "read", { kind: "leaderboard", board });
    const snapshot = await getLatestRankingSnapshot(window, context.db);
    return ok(snapshot ?? null);
  });
}
