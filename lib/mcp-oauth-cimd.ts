// OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document-00, pinned by MCP 2026-07-28).
// An HTTPS URL used as client_id is fetched, validated and persisted through the OAuth provider's own
// client-discovery seam, so the provider still owns redirect, grant, scope, PKCE and resource checks.
//
// Network trust boundary: production runs on Cloudflare Workers, whose outbound fetch egresses from the
// public edge and cannot reach loopback, RFC 1918 or link-local networks. This module adds the checks the
// runtime does not: HTTPS on the default port only, no IP literals or hostnames in special-use ranges,
// no credentials, redirects refused, a 5 s timeout and a 5 KB body limit.
import { oauthClientMetadataSchema, type ClientDiscovery, type OAuthOptions, type SchemaClient, type Scope } from "@better-auth/oauth-provider";
import { isForbiddenCimdClientMetadataField, registerClientMetadataDocument } from "@better-auth/oauth-provider/internal";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";

export const MCP_CIMD_DISCOVERY_ID = "cimd";
export const MCP_CIMD_FETCH_TIMEOUT_MS = 5_000;
export const MCP_CIMD_MAX_BYTES = 5 * 1024;
const DEFAULT_TTL_MS = 10 * 60_000;
const MAX_TTL_MS = 60 * 60_000;
const FAILURE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 500;
const DOT_SEGMENT = /\/(?:\.|%2e)(?:\.|%2e)?(?:\/|$|\?)/i;
const JSON_CONTENT_TYPE = /^application\/(?:[-\w.]+\+)?json\s*(?:;|$)/i;

type ClientMetadata = ReturnType<typeof oauthClientMetadataSchema.parse>;
type CacheEntry = { metadata: ClientMetadata; expiresAt: number } | { error: string; expiresAt: number };

// Per-isolate cache of validated documents and recent failures. It holds plain data only: Workers forbid
// sharing I/O objects across requests, so in-flight fetches are never shared between requests.
const cache = new Map<string, CacheEntry>();

function invalidClient(description: string): APIError {
  return new APIError("BAD_REQUEST", { error: "invalid_client", error_description: description });
}

function remember(clientId: string, entry: CacheEntry) {
  cache.delete(clientId);
  while (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(clientId, entry);
}

/** Routing predicate only: any HTTPS URL is a metadata-document client_id candidate. */
export function isClientIdMetadataUrl(clientId: string): boolean {
  return URL.canParse(clientId) && new URL(clientId).protocol === "https:";
}

/** Returns an error description when a client_id URL may not be fetched, otherwise null. */
export function validateClientIdUrl(clientId: string): string | null {
  if (clientId.includes("#")) return "client_id URL must not contain a fragment";
  if (DOT_SEGMENT.test(clientId)) return "client_id URL must not contain dot segments";
  if (!URL.canParse(clientId)) return "client_id is not a valid URL";
  const url = new URL(clientId);
  if (url.protocol !== "https:" || !/^https:\/\/[^/?#\\]+\//i.test(clientId)) return "client_id URL must be an https URL with a path";
  if (url.username || url.password) return "client_id URL must not contain credentials";
  if (url.port) return "client_id URL must use the default HTTPS port";
  if (!isPublicRoutableHost(url.hostname)) return "client_id URL must not target a private or reserved address";
  return null;
}

/** Validates a fetched document against the URL it was fetched from. Throws invalid_client on failure. */
export function validateClientIdMetadata(clientId: string, raw: unknown): ClientMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalidClient("Metadata document is not a JSON object");
  const forbidden = Object.keys(raw).find(isForbiddenCimdClientMetadataField);
  if (forbidden) throw invalidClient(`Metadata document must not contain "${forbidden}"`);
  const parsed = oauthClientMetadataSchema.strip().safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalidClient(`${issue?.path.join(".") || "metadata document"}: ${issue?.message ?? "invalid client metadata"}`);
  }
  const metadata = parsed.data;
  if (metadata.client_id !== clientId) throw invalidClient("Metadata document client_id does not match its URL");
  if (!metadata.client_name?.trim()) throw invalidClient("Metadata document client_name must be a non-empty string");
  if (!metadata.redirect_uris?.length) throw invalidClient("Metadata document redirect_uris must be a non-empty array");
  // Consent shows these links, so they must belong to the client_id origin to prevent impersonation.
  const origin = new URL(clientId).origin;
  for (const value of [metadata.client_uri, ...(metadata.post_logout_redirect_uris ?? [])]) {
    if (value !== undefined && (!URL.canParse(value) || new URL(value).origin !== origin)) {
      throw invalidClient("client_uri and post_logout_redirect_uris must share the client_id origin");
    }
  }
  return metadata;
}

/**
 * Fetch transport for discovery-owned resources (metadata documents and a client's jwks_uri).
 * Re-validates every target and refuses redirects so a 3xx cannot steer the request elsewhere.
 */
export async function fetchClientMetadataResource(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = input instanceof Request ? input.url : String(input);
  const urlError = validateClientIdUrl(target);
  if (urlError) throw new TypeError(urlError.replace("client_id URL", "metadata resource URL"));
  const response = await fetch(target, { ...init, method: "GET", redirect: "manual", credentials: "omit" });
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel();
    throw new TypeError("metadata resource redirects are refused");
  }
  return response;
}

async function readLimitedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MCP_CIMD_MAX_BYTES) {
    await response.body?.cancel();
    throw invalidClient("Metadata document exceeds the 5 KB size limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MCP_CIMD_MAX_BYTES) {
      await reader.cancel();
      throw invalidClient("Metadata document exceeds the 5 KB size limit");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

function cacheLifetime(cacheControl: string | null): number {
  const directives = (cacheControl ?? "").toLowerCase().split(",").map(value => value.trim());
  if (directives.some(value => value === "no-store" || value === "no-cache" || value === "private")) return 0;
  const maxAge = directives.find(value => value.startsWith("max-age="));
  const seconds = maxAge ? Number(maxAge.slice("max-age=".length)) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, MAX_TTL_MS) : DEFAULT_TTL_MS;
}

async function fetchClientIdMetadata(clientId: string): Promise<{ metadata: ClientMetadata; ttl: number }> {
  const signal = AbortSignal.timeout(MCP_CIMD_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchClientMetadataResource(clientId, { headers: { accept: "application/json" }, signal });
  } catch {
    throw invalidClient(signal.aborted ? "Metadata document fetch timed out" : "Metadata document fetch failed or redirected");
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw invalidClient(`Metadata document fetch returned HTTP ${response.status}`);
  }
  if (!JSON_CONTENT_TYPE.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    throw invalidClient("Metadata document must be served as JSON");
  }
  let text: string;
  try {
    text = await readLimitedText(response);
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw invalidClient(signal.aborted ? "Metadata document fetch timed out" : "Metadata document could not be read");
  }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw invalidClient("Metadata document is not valid JSON"); }
  return { metadata: validateClientIdMetadata(clientId, raw), ttl: cacheLifetime(response.headers.get("cache-control")) };
}

async function resolveClientIdMetadata(ctx: GenericEndpointContext, clientId: string, existing: SchemaClient<Scope[]> | null) {
  const urlError = validateClientIdUrl(clientId);
  if (urlError) throw invalidClient(urlError);
  const provider = ctx.context.getPlugin("oauth-provider") as { options: OAuthOptions<Scope[]> } | null;
  if (!provider) throw new Error("Client ID Metadata Document discovery requires the OAuth provider plugin.");
  const now = Date.now();
  const cached = cache.get(clientId);
  if (cached && cached.expiresAt > now) {
    if ("error" in cached) throw invalidClient(cached.error);
    if (existing) return existing;
    return (await persist(ctx, provider.options, clientId, cached.metadata)).client;
  }
  let fetched: Awaited<ReturnType<typeof fetchClientIdMetadata>>;
  try {
    fetched = await fetchClientIdMetadata(clientId);
  } catch (error) {
    // A short negative cache bounds how often one client_id can make this server fetch.
    if (error instanceof APIError) remember(clientId, { error: String(error.body?.error_description ?? "invalid client"), expiresAt: now + FAILURE_TTL_MS });
    throw error;
  }
  const result = await persist(ctx, provider.options, clientId, fetched.metadata, existing ?? undefined);
  if (fetched.ttl > 0) remember(clientId, { metadata: fetched.metadata, expiresAt: Date.now() + fetched.ttl });
  else cache.delete(clientId);
  return result.client;
}

function persist(ctx: GenericEndpointContext, options: OAuthOptions<Scope[]>, clientId: string, metadata: ClientMetadata, existingClient?: SchemaClient<Scope[]>) {
  return registerClientMetadataDocument(ctx, options, {
    clientId,
    clientDiscoveryId: MCP_CIMD_DISCOVERY_ID,
    metadata: { ...metadata, client_id: clientId, redirect_uris: metadata.redirect_uris ?? [] },
    existingClient,
  });
}

/** Clears the per-isolate document cache. Intended for tests. */
export function clearClientIdMetadataCache() {
  cache.clear();
}

export const mcpClientIdMetadataDiscovery: ClientDiscovery = {
  id: MCP_CIMD_DISCOVERY_ID,
  matches: isClientIdMetadataUrl,
  resolve: resolveClientIdMetadata,
  fetchClientMetadataResource,
  discoveryMetadata: { client_id_metadata_document_supported: true },
};
