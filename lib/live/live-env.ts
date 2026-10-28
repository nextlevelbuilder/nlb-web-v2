import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Runtime vars and secrets NLB Live reads. All optional: callers decide how to fail (closed). */
export type LiveEnvKey = "LIVE_ENABLED" | "ZOOM_ACCOUNT_ID" | "ZOOM_CLIENT_ID" | "ZOOM_CLIENT_SECRET";

/**
 * Read one binding from the OpenNext Cloudflare context, falling back to `process.env` outside a
 * request (cron, scripts, vitest) — the same resolution `lib/builder-league/access.ts` uses.
 */
export function getLiveBinding(name: LiveEnvKey): string | undefined {
  try {
    const value = (getCloudflareContext().env as unknown as Record<string, string | undefined>)[name];
    if (value !== undefined) return value;
  } catch {
    // No OpenNext request context.
  }
  return process.env[name];
}
