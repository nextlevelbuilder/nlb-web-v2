# MCP SDK v2 migration (packages/mcp)

Status: DONE. Branch feat/agent-surfaces-monorepo, uncommitted (the controller commits).

## What changed

- `src/server.ts` builds a fresh SDK v2 `McpServer` ("nlb-directory-mcp", version 0.2.1) for each request.
  - Every `TOOLS` entry is registered in registry order through `fromJsonSchema` plus the cf-worker validator.
  - Results carry JSON text, plus `structuredContent` when the output is an object. Errors come back as `isError: true` with ToolError data merged in.
  - Annotations: `readOnlyHint` on reads, `destructiveHint` on `revoke_api_key` and `blog_archive_post`.
  - Each tool sets `scopeChallenge: requireScopes(requiredToolScope(name))`.
  - `McpCaller` (local, anonymous, worker or oauth) resolves the per-call `ToolContext` and keeps every earlier authorization rule.
- `src/oauth.ts` makes the server an OAuth 2.1 resource server.
  - PRM lists `scopes_supported` as mcp:read, mcp:write and mcp:keys (no offline_access) and `bearer_methods_supported` as `["header"]`.
  - Access tokens are verified as JWTs against `{issuer}/jwks`.
    - Audience must be the resource or one of `acceptedAudiences`.
    - `typ` must be at+jwt and exp, iat, sub and scope are required.
    - Lifetime is capped at 300 s.
  - The delegated `x-nlb-mcp-assertion` matches `lib/auth-mcp-delegation.ts`.
    - HS256, typ nlb-mcp-delegation+jwt, 60 s lifetime.
    - `iss` is `delegationIssuer`, defaulting to `resource`. `aud` is `${apiBaseUrl}/api`.
    - Redirects are handled manually and rejected. The OAuth token is never forwarded.
- `src/http.ts` (new) is the transport-agnostic `createNlbMcpHttpHandler`, exported as `@nextlevelbuilder/mcp/http`.
  - It wraps `createMcpHandler(factory, { legacy: "stateless" })`.
  - It validates Host and Origin, and handles CORS, OAuth challenges and the JSON-only client fallback.
- `src/transports/legacy-sse.ts` (new, deprecated) bridges GET /sse and POST /message onto POST /mcp.
- `src/transports/worker.ts` is now a thin self-hosting entry on top of the factory. It adds /health and GET /, and aliases POST / to /mcp.
- `src/transports/stdio.ts` now uses `serveStdio`. The hand-rolled JSON-RPC server and its exports (`McpServer` class, `SUPPORTED_PROTOCOL_VERSIONS`) are removed.
- `package.json` adds the `./http` export. `deploy:check` is now a local dry-run.
- `wrangler.jsonc` uses an npm build command. No staging env, routes or deploy scripts were added.

## Factory

```ts
createNlbMcpHttpHandler(options: NlbMcpHttpOptions): (request: Request) => Promise<Response | null>

interface NlbMcpHttpOptions {
  apiBaseUrl: string; resource: string; oauthIssuer?: string; acceptedAudiences?: string[];
  delegationSecret?: string; delegationIssuer?: string; fetch?: typeof fetch;
  oauthEnabled?: boolean /* default true */; workerAuthToken?: string; apiKey?: string;
  allowedOrigins?: string[]; allowedHosts?: string[];
}
```

`fetch` is used for every outbound call: the JWKS fetch, delegated API calls and anonymous or Worker-token tool calls.

## Routes (paths are matched with or without a trailing slash)

| Path | Method | Result |
|------|--------|--------|
| `/mcp` | POST | MCP Streamable HTTP, for 2026-07-28 (stateless) and 2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05 |
| `/mcp` | GET, DELETE, other | 405, `Allow: POST, OPTIONS` |
| `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp` (and `/.well-known/oauth-protected-resource<resource path>`) | GET, HEAD | PRM. 503 if OAuth is misconfigured; null if OAuth is disabled |
| `/sse` | GET | Deprecated SSE stream; the `endpoint` event points to `/message?sessionId=…` |
| `/message?sessionId=` | POST | Deprecated; answered on the stream, or 202 |
| Any of the above | OPTIONS | 204 CORS preflight |
| Anything else | any | `null` |

Requests are refused in these cases:
- Foreign Host: 403.
- Untrusted browser Origin: 403.
- Missing token for an identity-requiring tool: 401 `invalid_token` with `scope` and `resource_metadata`.
- Token lacking the tool's scope: 403 `insufficient_scope`.

Public reads stay anonymous.

## Verification

- `npm run build -w @nextlevelbuilder/contracts && npm run type-check -w @nextlevelbuilder/mcp && npm test -w @nextlevelbuilder/mcp && npm run build -w @nextlevelbuilder/mcp` passed: 8 files, 91 tests.
- `wrangler deploy --dry-run --outdir <scratch>` bundled 1239.99 KiB (gzip 245.85 KiB).
- `dist/http.d.ts` has no imports, so neither SDK nor zod types reach importers. The http chain has no `node:` imports.

## Behaviour changes worth knowing

- The SDK checks arguments against the advertised JSON Schema before the handler runs. A failure comes back as an `isError` result with plain text ("Input validation error…"), not a JSON ToolError. Anonymous calls that will be refused skip validation, so they still get "Unauthorized".
- An anonymous call to a mutating or private tool (when OAuth is disabled) now gets an `isError` tool result, where it used to get JSON-RPC error -32001.
- Challenges no longer include offline_access, and loopback origins are allowed by CORS.
- The root `package.json` scripts `deploy:mcp:staging` and `deploy:mcp:production` call mcp scripts that don't exist. The coordinator owns that file.
