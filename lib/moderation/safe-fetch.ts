import dns from "dns/promises";
import net from "net";

export interface SafeFetchResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  bodySnippet?: string;
  error?: string;
}

/**
 * Validate that an IP address is public and not an internal/private address.
 */
export function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) {
    return true;
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (RFC 1918 Private)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (RFC 1918 Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (RFC 1918 Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // Unique local
    if (normalized.startsWith("fe80")) return true; // Link local
  }

  return false;
}

/**
 * Safely fetch an external URL with SSRF protection, timeout, and response size capping.
 */
export async function safeFetchUrl(targetUrl: string, timeoutMs = 5000): Promise<SafeFetchResult> {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, error: "Only HTTP and HTTPS protocols are allowed." };
    }

    // Resolve DNS and verify all resolved IPs are public
    const addresses = await dns.lookup(parsed.hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return { ok: false, error: `Access to private IP ${addr.address} is blocked.` };
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "NextLevelBuilder-Bot/1.0 (+https://nextlevelbuilder.io)",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      const bodySnippet = text.slice(0, 1000);

      return {
        ok: res.ok,
        status: res.status,
        contentType,
        bodySnippet,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return { ok: false, error: message };
  }
}
