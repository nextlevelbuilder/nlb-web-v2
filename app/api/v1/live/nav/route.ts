import { ok } from "@/lib/builder-league/http";
import { withLiveErrors } from "@/lib/live/http/live-http-errors";
import { isLiveEnabled } from "@/lib/live/live-flag";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/live/nav — whether the site menu shows the Live entry, read from the deployed runtime
 * `LIVE_ENABLED` value. Prerendered pages cannot carry the runtime flag in their HTML, so the header
 * probes this once per tab (`useLiveNav`). Always 200, so the probe never logs a browser error; it
 * reveals nothing beyond what the public pages already show.
 */
export async function GET() {
  return withLiveErrors(async () => ok({ showNav: isLiveEnabled() }));
}
