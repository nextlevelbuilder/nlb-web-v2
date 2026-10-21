import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchClientMetadataResource, isClientIdMetadataUrl, mcpClientIdMetadataDiscovery, validateClientIdMetadata, validateClientIdUrl,
} from "@/lib/mcp-oauth-cimd";

const clientId = "https://client.example.com/oauth/metadata.json";
const document = { client_id: clientId, client_name: "Example MCP client", redirect_uris: ["http://127.0.0.1:3334/callback"] };

afterEach(() => { vi.unstubAllGlobals(); });

describe("Client ID Metadata Document validation", () => {
  it("routes only HTTPS client_ids to metadata discovery and advertises support", () => {
    expect(isClientIdMetadataUrl(clientId)).toBe(true);
    expect(isClientIdMetadataUrl("http://client.example.com/oauth/metadata.json")).toBe(false);
    expect(isClientIdMetadataUrl("generated-client-id")).toBe(false);
    expect(mcpClientIdMetadataDiscovery.discoveryMetadata).toEqual({ client_id_metadata_document_supported: true });
  });

  it("accepts a public HTTPS client_id URL with a path", () => {
    expect(validateClientIdUrl(clientId)).toBeNull();
    expect(validateClientIdUrl("https://client.example.com/")).toBeNull();
  });

  it.each([
    "https://127.0.0.1/client.json", "https://localhost/client.json", "https://192.168.1.10/client.json",
    "https://172.16.0.1/client.json", "https://100.64.0.1/client.json", "https://169.254.169.254/latest",
    "https://metadata.google.internal/client.json", "https://[::1]/client.json", "https://[fd00::1]/client.json",
    "https://0.0.0.0/client.json", "https://client.example.com:444/client.json", "https://u:p@client.example.com/client.json",
    "https://client.example.com/a/../client.json", "https://client.example.com/client.json#frag", "https://client.example.com",
    "http://client.example.com/client.json", "not a url",
  ])("rejects %s", (value) => {
    expect(validateClientIdUrl(value)).toEqual(expect.any(String));
  });

  it("accepts a document whose client_id matches its URL", () => {
    expect(validateClientIdMetadata(clientId, document)).toMatchObject(document);
  });

  it.each([
    ["non-object", []],
    ["mismatched client_id", { ...document, client_id: "https://client.example.com/other.json" }],
    ["missing client_name", { ...document, client_name: " " }],
    ["missing redirect_uris", { ...document, redirect_uris: [] }],
    ["server-owned field", { ...document, skip_consent: true }],
    ["client secret", { ...document, client_secret: "not-a-real-secret" }],
    ["foreign client_uri", { ...document, client_uri: "https://attacker.example/" }],
  ])("rejects a document with %s", (_kind, raw) => {
    expect(() => validateClientIdMetadata(clientId, raw)).toThrow();
  });
});

describe("metadata resource fetch transport", () => {
  it("fetches public HTTPS resources without following redirects or sending credentials", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json(document));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchClientMetadataResource(clientId)).status).toBe(200);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit" });
  });

  it.each([
    ["3xx response", new Response(null, { status: 307, headers: { location: "https://127.0.0.1/" } })],
    ["opaque redirect", Object.defineProperty(new Response(null, { status: 200 }), "type", { value: "opaqueredirect" })],
  ])("refuses a %s", async (_kind, response) => {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    await expect(fetchClientMetadataResource(clientId)).rejects.toThrow(/redirect/);
  });

  it("refuses private targets before any network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchClientMetadataResource(new URL("https://10.1.2.3/jwks.json"))).rejects.toThrow(/private or reserved/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
