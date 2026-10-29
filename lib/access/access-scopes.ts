import type { AccessAction, AccessSubject } from "./types";

/**
 * Credential scopes understood by `authorize()`.
 *
 * - MCP delegations carry exactly the scope the MCP worker signed into the assertion (`mcp:read`,
 *   `mcp:write`, `mcp:keys`, `mcp:operator`). Callers pass the verified scope through
 *   `subjectFromCaller(caller, { scopes: [context.scope] })`; a delegation without scopes has none.
 * - API keys have no scope column in use today (`api_keys.permissions` is always null) and already act
 *   as their user across `/api/v1` reads and writes (votes, submissions). They are mapped to the legacy
 *   member pair `api:read` + `api:write`, never to an operator scope.
 * - Sessions pass `scopes: undefined` and carry every member scope implicitly.
 *
 * `mcp:keys` grants nothing here: it only manages API keys and is checked by those routes.
 */
export const OPERATOR_SCOPE = "mcp:operator";

/** Scopes that satisfy a read-type action. A write scope always implies read. */
export const READ_SCOPES: readonly string[] = ["mcp:read", "mcp:write", "api:read", "api:write"];

/** Scopes that satisfy a mutating member action. */
export const WRITE_SCOPES: readonly string[] = ["mcp:write", "api:write"];

/** Scopes a legacy API key carries (see the module comment). */
export const LEGACY_API_KEY_SCOPES: readonly string[] = ["api:read", "api:write"];

/** Member actions that change state and therefore need a write scope. `manage` is handled separately. */
const MUTATING_ACTIONS: ReadonlySet<AccessAction> = new Set<AccessAction>(["vote", "purchase"]);

/** True when the subject's credential may perform a member (non-operator) action. */
export function hasMemberScopeFor(subject: AccessSubject, action: AccessAction): boolean {
  // Only sessions carry implicit member scopes; any other credential must list them explicitly.
  if (subject.scopes === undefined) return subject.authType === "session";
  const accepted = MUTATING_ACTIONS.has(action) ? WRITE_SCOPES : READ_SCOPES;
  return subject.scopes.some((scope) => accepted.includes(scope));
}
