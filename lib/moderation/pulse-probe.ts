import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface PulseProbeResult {
  outcome: "up" | "down" | "unknown";
  latencyMs: number | null;
  httpStatus: number | null;
  reason: string | null;
}

interface ProbeResponse { status: number; location: string | null }
export interface PulseProbeDependencies {
  resolve: (hostname: string) => Promise<string[]>;
  request: (url: URL, addresses: string[], signal: AbortSignal) => Promise<ProbeResponse>;
}

// Only globally routable unicast addresses are eligible. Deny IPv6 transition
// ranges too, so embedded private IPv4 addresses cannot bypass the check.
export function isPublicPulseIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const parts = normalized.split(":");
    const first = parseInt(parts[0], 16);
    const second = parseInt(parts[1] || "0", 16);
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
      !(first === 0x3fff && second < 0x1000);
  }
  return false;
}

export function parsePulseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("blocked_target"); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && url.port !== "80" && url.port !== "443") ||
      !hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)\.?$/.test(hostname) ||
      (isIP(hostname) && !isPublicPulseIp(hostname))) {
    throw new Error("blocked_target");
  }
  url.hash = "";
  return url;
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  // dns.lookup is not implemented in Workers. resolve4/6 use its DNS-over-HTTPS support.
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") addresses.push(...result.value);
    else if (!["ENODATA", "ENOTFOUND"].includes((result.reason as { code?: string }).code || "")) {
      throw new Error("dns_unavailable");
    }
  }
  return addresses;
}

async function requestHeaders(url: URL, addresses: string[], signal: AbortSignal): Promise<ProbeResponse> {
  let worker = false;
  try { worker = Boolean(getCloudflareContext().env); } catch { /* Local Node runtime. */ }
  const headers = { "User-Agent": "NextLevelBuilder-Pulse/1.0 (+https://nextlevelbuilder.io)", Accept: "*/*" };
  if (worker) {
    // Workers' public fetch egress rejects private destinations at connection time;
    // global_fetch_strictly_public also prevents same-zone origin bypasses.
    // https://github.com/cloudflare/workerd/blob/main/src/workerd/server/workerd.capnp (Network)
    // https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public
    // No credentials, service binding, or incoming request headers are forwarded.
    const response = await fetch(url, { method: "HEAD", redirect: "manual", signal, headers, cache: "no-store" });
    await response.body?.cancel();
    return { status: response.status, location: response.headers.get("location") };
  }
  // Pin Node's lookup to the validated addresses, while preserving TLS SNI and
  // the original Host header. A second DNS lookup would allow DNS rebinding.
  const transport = url.protocol === "https:" ? await import("node:https") : await import("node:http");
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "HEAD", agent: false, signal, headers,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, addresses.map(address => ({ address, family: isIP(address) })));
        else callback(null, addresses[0], isIP(addresses[0]));
      },
    }, (response) => {
      resolve({ status: response.statusCode || 0, location: response.headers.location || null });
      response.destroy();
    });
    request.once("error", reject);
    request.end();
  });
}

export async function probeProductWebsite(
  websiteUrl: string,
  dependencies: PulseProbeDependencies = { resolve: resolvePublicAddresses, request: requestHeaders },
  timeoutMs = 8000,
): Promise<PulseProbeResult> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const deadline = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
  const elapsed = () => Math.max(0, Date.now() - startedAt);
  try {
    const result = await Promise.race([deadline, (async (): Promise<PulseProbeResult> => {
      let url = parsePulseUrl(websiteUrl);
      for (let redirects = 0; redirects <= 3; redirects++) {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = await dependencies.resolve(hostname);
        controller.signal.throwIfAborted();
        if (!addresses.length) throw new Error("dns_unavailable");
        if (addresses.some(address => !isPublicPulseIp(address))) throw new Error("blocked_target");
        const response = await dependencies.request(url, addresses, controller.signal);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.location || redirects === 3) throw new Error("redirect_limit");
          const redirected = parsePulseUrl(new URL(response.location, url).href);
          if (url.protocol === "https:" && redirected.protocol !== "https:") throw new Error("blocked_target");
          url = redirected;
          continue;
        }
        if (response.status === 405 || response.status === 501 || response.status === 0) {
          return { outcome: "unknown", latencyMs: elapsed(), httpStatus: response.status || null, reason: "head_unsupported" };
        }
        return { outcome: response.status >= 200 && response.status < 400 ? "up" : "down", latencyMs: elapsed(), httpStatus: response.status, reason: null };
      }
      throw new Error("redirect_limit");
    })()]);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "request_failed";
    if (["blocked_target", "dns_unavailable", "redirect_limit"].includes(reason)) {
      return { outcome: "unknown", latencyMs: null, httpStatus: null, reason };
    }
    return { outcome: "down", latencyMs: elapsed(), httpStatus: null, reason: controller.signal.aborted ? "timeout" : "request_failed" };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
