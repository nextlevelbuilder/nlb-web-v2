/**
 * Helpers for the sign-in page when it is reached from the OAuth authorize endpoint.
 * better-auth's oauth-provider redirects with a signed query (`sig`, `ba_param`, `exp`)
 * that stops verifying once `exp` (Unix seconds) has passed.
 */

type QueryParams = Pick<URLSearchParams, 'has' | 'get'>;

export function isOAuthSignInQuery(params: QueryParams): boolean {
  return params.has('sig') && params.has('ba_param');
}

/** Mirrors the provider's check: the link is valid while `exp * 1000 >= now`. */
export function isOAuthSignInLinkExpired(params: QueryParams, now: number = Date.now()): boolean {
  if (!isOAuthSignInQuery(params)) return false;
  const exp = Number(params.get('exp'));
  return !Number.isFinite(exp) || exp * 1000 < now;
}

/** The provider answers an expired or tampered signed query with `{ "error": "invalid_signature" }`. */
export function isInvalidOAuthSignatureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { error: code, code: upperCode, message } = error as { error?: unknown; code?: unknown; message?: unknown };
  return [code, upperCode, message].some(
    (value) => typeof value === 'string' && value.toLowerCase() === 'invalid_signature',
  );
}
