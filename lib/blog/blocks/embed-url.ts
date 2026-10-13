/**
 * Embed allowlist: maps a public video URL to the provider's iframe player URL.
 * Only YouTube (privacy-enhanced domain), Vimeo, Cloudflare Stream and Loom are accepted; every other
 * URL returns null and is rejected by block validation. The iframe src is always rebuilt from parsed
 * ids, never echoed from input, so query strings or paths cannot smuggle anything into the player URL.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[a-f0-9]{6,20}$/;
const STREAM_UID = /^[a-f0-9]{32}$/;
const STREAM_CUSTOMER_HOST = /^customer-[a-z0-9]{1,32}\.cloudflarestream\.com$/;
const LOOM_ID = /^[a-f0-9]{32}$/;

export type EmbedProvider = "youtube" | "vimeo" | "cloudflare-stream" | "loom";
export interface EmbedTarget {
  provider: EmbedProvider;
  src: string;
}

function parseHttpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function youtube(url: URL, host: string, parts: string[]): string | null {
  let id: string | undefined;
  if (host === "youtu.be") id = parts[0];
  else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1];
  }
  return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

function vimeo(host: string, parts: string[]): string | null {
  const [id, hash] = host === "player.vimeo.com" ? [parts[1], undefined] : [parts[0], parts[1]];
  if (host === "player.vimeo.com" && parts[0] !== "video") return null;
  if (!id || !VIMEO_ID.test(id)) return null;
  return `https://player.vimeo.com/video/${id}${hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : ""}`;
}

function cloudflareStream(host: string, parts: string[]): string | null {
  const uid = parts[0];
  if (!uid || !STREAM_UID.test(uid)) return null;
  if (STREAM_CUSTOMER_HOST.test(host)) return `https://${host}/${uid}/iframe`;
  if (host === "iframe.videodelivery.net" || host === "watch.videodelivery.net" || host === "iframe.cloudflarestream.com") {
    return `https://iframe.videodelivery.net/${uid}`;
  }
  return null;
}

function loom(parts: string[]): string | null {
  const id = parts[1];
  return (parts[0] === "share" || parts[0] === "embed") && id && LOOM_ID.test(id) ? `https://www.loom.com/embed/${id}` : null;
}

/** Resolves an allowlisted video URL to its iframe player target, or null when it is not embeddable. */
export function resolveEmbed(raw: string): EmbedTarget | null {
  const url = parseHttpsUrl(raw);
  if (!url || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) {
    const src = youtube(url, host, parts);
    return src ? { provider: "youtube", src } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const src = vimeo(host, parts);
    return src ? { provider: "vimeo", src } : null;
  }
  if (host.endsWith("cloudflarestream.com") || host.endsWith("videodelivery.net")) {
    const src = cloudflareStream(host, parts);
    return src ? { provider: "cloudflare-stream", src } : null;
  }
  if (host === "loom.com") {
    const src = loom(parts);
    return src ? { provider: "loom", src } : null;
  }
  return null;
}

export function toEmbedSrc(raw: string): string | null {
  return resolveEmbed(raw)?.src ?? null;
}
