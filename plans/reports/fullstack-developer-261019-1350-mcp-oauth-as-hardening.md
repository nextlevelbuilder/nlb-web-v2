# MCP OAuth authorization server hardening (MCP authorization spec 2026-07-28)

Status: DONE_WITH_CONCERNS. All six required behaviours are now implemented and covered by tests.

## Changes

| File | Change |
|------|--------|
| `lib/mcp-oauth-cimd.ts` (new, ~200 lines) | Client ID Metadata Document discovery, built on the provider's `ClientDiscovery` extension point and its `registerClientMetadataDocument` persistence. It validates the client_id URL and refuses unsafe targets (SSRF guard), fetches through a safe transport, validates the document, and keeps a per-isolate LRU cache plus a short failure cache. |
| `lib/mcp-oauth-config.ts` | Adds `extensions: [{ clientDiscovery }]` and a small `mcp-default-resource` plugin. That plugin binds an authorize request that omits `resource` (GET or POST) to the configured `MCP_OAUTH_RESOURCE`. The consent-binding logic is unchanged. |
| `tests/oauth-provider.test.ts` | Every approval now asserts `iss` on the success redirect. A new `MCP authorization spec 2026-07-28 compliance` block adds 33 tests. The cache is reset in `afterEach`. |
| `tests/mcp-oauth-cimd.test.ts` (new) | 31 unit tests covering URL validation, document validation and the fetch transport. |

These files needed no change: `lib/auth.ts`, `app/.well-known/oauth-authorization-server/**`. The routes already serve both RFC 8414 locations. No OpenID route is needed, because the provider does not offer the `openid` scope and correctly returns 404 for it.

## Native vs custom

| Requirement | Source | Verified by |
|---|---|---|
| PKCE required for every client, S256 only, plain rejected | Native: `isPKCERequired`, and DCR rejects `require_pkce:false` | Tests: missing-pkce, plain-pkce, plain verifier at token, DCR `require_pkce:false` → 400 |
| No implicit, password or client_credentials | Native: `grantTypes` option | Tests: implicit, password, client_credentials |
| Refresh rotation and reuse detection | Native: `refreshTokenReuseInterval: 0` | Existing rotation tests |
| Exact redirect_uri matching | Native | Tests: path suffix, query, case variants rejected; CIMD unlisted redirect rejected |
| RFC 8414 metadata (S256, `authorization_response_iss_parameter_supported`, `scopes_supported`, `response_types ["code"]`) | Native | Metadata test at `/.well-known/oauth-authorization-server/api/auth` and `/api/auth/.well-known/oauth-authorization-server` |
| `client_id_metadata_document_supported: true` | Native merge of the custom discovery's `discoveryMetadata` | Metadata test |
| RFC 9207 `iss` on success and error redirects | Native | `approve()` assertion; plain-pkce, missing-pkce and access_denied redirects |
| CIMD fetch, validation, cache, SSRF limits | **Custom**, in `lib/mcp-oauth-cimd.ts` | Happy path through to an aud-bound token; cache hit; no-store revalidation; 8 SSRF URL cases; 9 bad-document cases |
| DCR with `application_type` | Native | `web` and `native` accepted, `desktop` rejected |
| RFC 8707 audience binding, only the configured resource | Native (`enforcePerClientResources`, resource seeding) plus the **custom** default-resource hook | Wrong resource rejected at authorize, code exchange and refresh; aud equals the resource with and without the client sending `resource`; POST authorize |

## Why CIMD is custom

Better Auth ships CIMD as a separate package, `@better-auth/cimd@1.7.2`. It is not installed, and `package.json`/the lockfile are outside my file ownership. My module follows that package's validation rules and uses the same provider seams (`extendOAuthProvider` extension, `registerClientMetadataDocument`, `oauthClientMetadataSchema`, `isForbiddenCimdClientMetadataField`, `isPublicRoutableHost`). That keeps a later swap down to replacing one module.

No schema change was needed: `oauth_clients.client_discovery_id` already exists.

## Test output

```
npx vitest run tests/oauth-provider.test.ts tests/mcp-oauth
 Test Files  2 passed (2)
      Tests  83 passed (83)
npx tsc --noEmit                      -> exit 0
npx eslint lib/mcp-oauth-config.ts lib/mcp-oauth-cimd.ts tests/oauth-provider.test.ts tests/mcp-oauth-cimd.test.ts app/.well-known -> 0 problems
npx eslint lib app/.well-known tests  -> 0 errors (57 pre-existing warnings in other files)
```

## Concerns / follow-ups

1. **SSRF network boundary.** The CIMD draft asks for resolve-once DNS with connection pinning, which fetch cannot do. The module blocks private and special-use IP literals and hostnames, non-default ports, credentials and redirects. Beyond that it relies on Cloudflare Workers, whose outbound fetch cannot reach private networks. In local Node dev, a public hostname that resolves to a private IP is not blocked.
2. **Recommended dependency swap.** Swap to `@better-auth/cimd@1.7.2` with `metadataProfile: "mcp-2026-07-28"` and `fetchClientMetadataResource` from this module. That needs a `package.json` change (controller decision).
3. **Consent page.** For URL client_ids the consent page should show the client_id host, so a user can spot a document that claims another app's name (spec security consideration). `app/oauth/consent` is outside my ownership.
4. **Per-isolate cache.** The document cache is per isolate, so a cold isolate refetches. A failed fetch is cached for 30 s per client_id to limit how much fetching one client_id can trigger. It also means a client fixing a broken document waits up to 30 s.
5. **Defaulted resource.** A request with no `resource` is now bound to the MCP resource rather than getting an audience-less opaque token. RFC 8707 permits a default audience, and the MCP worker only accepts JWTs carrying this audience, so no working client is affected.
