import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Render through the current Worker, keeping session credentials inside the deployment. */
export function pageFetcher(): typeof fetch {
  // next dev is a Node server; its platform proxy cannot render the Next page.
  if (process.env.NODE_ENV === "development") return fetch;
  let env;
  try { env = getCloudflareContext().env; } catch { return fetch; }
  const service = env.WORKER_SELF_REFERENCE;
  if (!service) throw new Error("WORKER_SELF_REFERENCE is required for Markdown page rendering");
  return service.fetch.bind(service) as unknown as typeof fetch;
}
