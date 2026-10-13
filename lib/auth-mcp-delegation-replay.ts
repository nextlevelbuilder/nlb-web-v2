/**
 * One-time use for MCP delegation assertions: each `jti` is recorded until its token expires and a
 * second presentation is rejected.
 *
 * Storage is the `MCP_DELEGATION_JTI` KV namespace. KV is eventually consistent across locations
 * (a write can take up to ~60 s to be visible elsewhere), so this reliably stops replays at the same
 * location and narrows, but cannot fully close, a cross-location replay inside the 60 s lifetime.
 * The assertion remains bound to scope, method and path, which limits what a replay could do.
 */

/** The subset of the KV API the replay store uses. */
export interface JtiStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

/** KV rejects TTLs under 60 seconds. */
const MIN_KV_TTL_SECONDS = 60;
const MAX_JTI_LENGTH = 200;

// Local development and tests run without a Worker context; an in-process map keeps the same rule.
const localSeen = new Map<string, number>();

function localStore(nowSeconds: number): JtiStore {
  for (const [key, expiresAt] of localSeen) if (expiresAt <= nowSeconds) localSeen.delete(key);
  return {
    async get(key) { return localSeen.has(key) ? "1" : null; },
    async put(key, _value, { expirationTtl }) { localSeen.set(key, nowSeconds + expirationTtl); },
  };
}

function isJtiStore(value: unknown): value is JtiStore {
  return Boolean(value) && typeof (value as JtiStore).get === "function" && typeof (value as JtiStore).put === "function";
}

/**
 * Returns true the first time a jti is seen, false on reuse or when replay protection cannot run.
 * `bindings` is null outside a Worker; inside one a missing KV binding fails closed.
 */
export async function consumeDelegationJti(
  jti: string,
  expiresAtSeconds: number,
  bindings: Record<string, unknown> | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!jti || jti.length > MAX_JTI_LENGTH) return false;
  let store: JtiStore;
  if (bindings === null) {
    store = localStore(nowSeconds);
  } else if (isJtiStore(bindings.MCP_DELEGATION_JTI)) {
    store = bindings.MCP_DELEGATION_JTI;
  } else {
    console.error("MCP_DELEGATION_JTI KV binding is missing; rejecting delegation assertions");
    return false;
  }
  const key = `mcp-jti:${jti}`;
  if (await store.get(key)) return false;
  await store.put(key, "1", { expirationTtl: Math.max(MIN_KV_TTL_SECONDS, expiresAtSeconds - nowSeconds) });
  return true;
}
