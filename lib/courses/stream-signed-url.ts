import { createPrivateKey } from "node:crypto";
import { importJWK, importPKCS8, SignJWT, type CryptoKey, type JWK } from "jose";
import { CourseError } from "./course-errors";
import type { CourseRuntimeEnv } from "./course-runtime-env";

/** Lifetime of a signed playback token. */
export const STREAM_TOKEN_TTL_SECONDS = 60 * 60;
/** Allow small clock skew between this Worker and Stream's edge. */
const NOT_BEFORE_SKEW_SECONDS = 30;

const SUBDOMAIN_PATTERN = /^customer-[a-z0-9]+\.cloudflarestream\.com$/;

export interface StreamSigningConfig {
  keyId: string;
  /** Raw secret value: base64 JWK, JSON JWK, PEM, or base64 PEM (as `POST /stream/keys` returns). */
  keyMaterial: string;
  customerSubdomain: string;
}

export interface SignedStreamPlayback {
  token: string;
  iframeUrl: string;
  hlsUrl: string;
  expiresAt: string;
}

/**
 * Read Stream signing secrets. Missing or malformed values raise a 503 CourseError: the feature is
 * unavailable until an operator provisions Stream. Unsigned playback is never offered as a fallback.
 */
export function loadStreamSigningConfig(env: CourseRuntimeEnv): StreamSigningConfig {
  const keyId = env.CF_STREAM_SIGNING_KEY_ID?.trim();
  const keyMaterial = env.CF_STREAM_SIGNING_KEY_JWK?.trim();
  const rawSubdomain = env.CF_STREAM_CUSTOMER_SUBDOMAIN?.trim().toLowerCase();
  const missing = [
    !keyId && "CF_STREAM_SIGNING_KEY_ID",
    !keyMaterial && "CF_STREAM_SIGNING_KEY_JWK",
    !rawSubdomain && "CF_STREAM_CUSTOMER_SUBDOMAIN",
  ].filter(Boolean);
  if (!keyId || !keyMaterial || !rawSubdomain) {
    console.error(`Cloudflare Stream signing is not configured; missing ${missing.join(", ")}`);
    throw new CourseError(503, "stream_not_configured", "Video playback is temporarily unavailable");
  }
  const customerSubdomain = rawSubdomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!SUBDOMAIN_PATTERN.test(customerSubdomain)) {
    console.error("CF_STREAM_CUSTOMER_SUBDOMAIN must look like customer-<code>.cloudflarestream.com");
    throw new CourseError(503, "stream_not_configured", "Video playback is temporarily unavailable");
  }
  return { keyId, keyMaterial, customerSubdomain };
}

function decodeBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8").trim();
}

/** Turn any supported key encoding into a signing key for RS256. */
async function importSigningKey(material: string): Promise<CryptoKey> {
  const text = material.startsWith("{") || material.startsWith("-----") ? material : decodeBase64(material);
  if (text.startsWith("{")) {
    const jwk = JSON.parse(text) as JWK;
    return (await importJWK({ ...jwk, alg: "RS256" }, "RS256")) as CryptoKey;
  }
  if (text.includes("-----BEGIN PRIVATE KEY-----")) {
    return importPKCS8(text, "RS256");
  }
  if (text.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    // PKCS#1 (Cloudflare's `pem` field): convert through node:crypto, jose only reads PKCS#8.
    const jwk = createPrivateKey(text).export({ format: "jwk" }) as JWK;
    return (await importJWK({ ...jwk, alg: "RS256" }, "RS256")) as CryptoKey;
  }
  throw new Error("Unrecognised signing key encoding");
}

// Imported keys are reused across requests within an isolate, keyed by the secret value.
const keyCache = new Map<string, Promise<CryptoKey>>();

function getSigningKey(material: string): Promise<CryptoKey> {
  let pending = keyCache.get(material);
  if (!pending) {
    pending = importSigningKey(material);
    keyCache.set(material, pending);
    pending.catch(() => keyCache.delete(material));
  }
  return pending;
}

/**
 * Sign a Stream playback token (RS256, `kid` header + claim, `sub` = video uid) and build the
 * iframe and HLS URLs that embed it in place of the video uid.
 */
export async function createSignedStreamPlayback(
  streamUid: string,
  config: StreamSigningConfig,
  now: Date = new Date()
): Promise<SignedStreamPlayback> {
  let key: CryptoKey;
  try {
    key = await getSigningKey(config.keyMaterial);
  } catch (error) {
    console.error("Cloudflare Stream signing key could not be imported:", error instanceof Error ? error.message : error);
    throw new CourseError(503, "stream_not_configured", "Video playback is temporarily unavailable");
  }

  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + STREAM_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ kid: config.keyId })
    .setProtectedHeader({ alg: "RS256", kid: config.keyId })
    .setSubject(streamUid)
    .setNotBefore(issuedAt - NOT_BEFORE_SKEW_SECONDS)
    .setExpirationTime(expiresAt)
    .sign(key);

  const base = `https://${config.customerSubdomain}/${token}`;
  return {
    token,
    iframeUrl: `${base}/iframe`,
    hlsUrl: `${base}/manifest/video.m3u8`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
