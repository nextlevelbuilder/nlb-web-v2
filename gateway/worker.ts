/**
 * Gateway Worker in front of the web Worker. It owns the public domains and forwards every request over
 * the `WEB` service binding, which goes through the web Worker's Workers Cache. Anonymous public page
 * requests are normalised first (no visitor cookies, Accept-Language pinned to the path locale), so all
 * visitors share one cached render. The bundle is tiny, so a cache hit does not wait for the web
 * Worker's isolate to start.
 */
import { toEdgeCacheRequest } from "../lib/edge-cache-gateway";

interface GatewayEnv {
  /** Service binding to the web Worker's default entrypoint. */
  WEB: { fetch(request: Request): Promise<Response> };
}

const gateway = {
  fetch(request: Request, env: GatewayEnv): Promise<Response> {
    return env.WEB.fetch(toEdgeCacheRequest(request) ?? request);
  },
};

export default gateway;
