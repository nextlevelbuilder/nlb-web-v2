/**
 * Network clients the Live routes use, behind one module so tests can replace exactly these (the Polar
 * SDK) and nothing else. The Polar client is imported lazily so routes that never pay do not load it.
 */
import type { Polar } from "@polar-sh/sdk";
import type { MeetingProvider } from "@/lib/live/meetings/meeting-provider";
import { createZoomMeetingProviderFromEnv } from "@/lib/live/meetings/zoom-meeting-provider";

/** The slice of the Polar SDK the Live REST layer calls (checkouts, products, orders, refunds). */
export type LivePolarClient = Pick<Polar, "checkouts" | "products" | "orders" | "refunds">;

export async function getLivePolarClient(): Promise<LivePolarClient> {
  return (await import("@/lib/polar")).polar;
}

/** Zoom from runtime credentials; `available` is false (fail closed) when any credential is missing. */
export function getLiveMeetingProvider(): MeetingProvider {
  return createZoomMeetingProviderFromEnv();
}
