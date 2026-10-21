/**
 * Helpers for the sign-in page when it is reached from the OAuth authorize endpoint.
 * better-auth's oauth-provider redirects with a signed query (`sig`, `ba_param`, `exp`)
 * that stops verifying once `exp` (Unix seconds) has passed. Expiry is judged by the server's
 * clock only: a device clock running ahead must not block a still-valid link.
 */

export function isOAuthSignInQuery(params: Pick<URLSearchParams, 'has'>): boolean {
  return params.has('sig') && params.has('ba_param');
}

/** The provider answers an expired or tampered signed query with `{ "error": "invalid_signature" }`. */
export function isInvalidOAuthSignatureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { error: code, code: upperCode, message } = error as { error?: unknown; code?: unknown; message?: unknown };
  return [code, upperCode, message].some(
    (value) => typeof value === 'string' && value.toLowerCase() === 'invalid_signature',
  );
}
