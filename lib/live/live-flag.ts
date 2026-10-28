import { getLiveBinding } from "./live-env";

/**
 * `LIVE_ENABLED` (wrangler var) is "false" in production and "true" on staging. With the flag off,
 * Live pages and member APIs answer 404; operator APIs stay usable so events can be prepared.
 */
export function isLiveEnabled(): boolean {
  return getLiveBinding("LIVE_ENABLED") === "true";
}
