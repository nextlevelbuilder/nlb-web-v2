/** Google Analytics 4 measurement id for nextlevelbuilder.io. */
export const GA_MEASUREMENT_ID = "G-MJ62DM021G";

/** Subset of `Navigator` that carries the browser's privacy signals. */
export interface PrivacySignals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

/**
 * Analytics may load only when the browser sends neither Do Not Track nor Global Privacy Control.
 * Mirrors the check in lib/traffic-client.ts (getTrafficVisitorId) and the published privacy policy.
 */
export function isAnalyticsAllowed(signals: PrivacySignals | null | undefined): boolean {
  if (!signals) return false;
  const doNotTrack = signals.doNotTrack;
  if (doNotTrack === "1" || doNotTrack === "yes") return false;
  return signals.globalPrivacyControl !== true;
}
