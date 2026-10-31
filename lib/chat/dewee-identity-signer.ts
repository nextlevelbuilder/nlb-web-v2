import { SignJWT } from "jose";
import type { DeweeIdentitySdk } from "dewee-webchat/server";

/** Longest assertion lifetime Dewee accepts (exp - iat); assertions are single use, 60 s is plenty. */
const ASSERTION_TTL_SECONDS = 60;
const MIN_SECRET_BYTES = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Signs a Dewee partner session assertion (HS256, `typ: dewee-session+jwt`) with the claims Dewee
 * verifies: `iss`, `aud = dewee:<application id>`, `sub`, `iat`, `exp`, `jti`. It mirrors
 * `createAssertion` from `@dewee/identity`, which is not published to npm yet; with the CCP transport
 * the handler only needs this call, because CCP performs the session exchange.
 */
export async function createSessionAssertion(opts: {
  subject: string;
  applicationId: string;
  issuer: string;
  secret: string;
  now?: Date;
}): Promise<string> {
  if (!UUID_PATTERN.test(opts.applicationId)) throw new Error("Dewee identity application id must be a UUID");
  if (!opts.issuer || /\s/.test(opts.issuer)) throw new Error("Dewee identity issuer is required");
  if (!opts.subject || opts.subject.includes("@")) throw new Error("Dewee identity subject must be an opaque user id");
  const key = new TextEncoder().encode(opts.secret);
  if (key.length < MIN_SECRET_BYTES) throw new Error("Dewee identity assertion secret is too short");
  const iat = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "dewee-session+jwt" })
    .setIssuer(opts.issuer)
    .setAudience(`dewee:${opts.applicationId.toLowerCase()}`)
    .setSubject(opts.subject)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ASSERTION_TTL_SECONDS)
    .setJti(crypto.randomUUID())
    .sign(key);
}

function legacyOnly(): never {
  throw new Error("The legacy gateway transport is not used by this site");
}

/**
 * The identity SDK the webchat handler expects. Only `createAssertion` is reachable with the CCP
 * transport; the gateway calls exist to satisfy the type and refuse loudly if ever reached.
 */
export const deweeIdentitySdk: DeweeIdentitySdk = {
  exchangeSession: legacyOnly,
  startLink: legacyOnly,
  async createAssertion(opts) {
    if (opts.purpose !== "session" || !opts.secret) throw new Error("Only HS256 session assertions are supported");
    return createSessionAssertion({
      subject: opts.subject,
      applicationId: opts.applicationId,
      issuer: opts.issuer,
      secret: opts.secret,
    });
  },
};
