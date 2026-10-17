import { getOnboardingEnv } from "@/lib/onboarding/flags";

/**
 * Secrets at rest (provider OAuth tokens, nonce payloads) are sealed with AES-256-GCM through
 * WebCrypto, keyed by `ONBOARDING_ENCRYPTION_KEY` (base64 of 32 random bytes).
 * Sealed format: `v1.<base64url iv>.<base64url ciphertext+tag>`. A fresh 96-bit IV per call.
 */
const VERSION = "v1";
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(rawKey: string | undefined = getOnboardingEnv().ONBOARDING_ENCRYPTION_KEY): Promise<CryptoKey> {
  if (!rawKey) throw new Error("ONBOARDING_ENCRYPTION_KEY is not configured");
  let cached = keyCache.get(rawKey);
  if (!cached) {
    const bytes = fromBase64(rawKey.trim());
    if (bytes.length !== 32) throw new Error("ONBOARDING_ENCRYPTION_KEY must be base64 of 32 bytes");
    cached = crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    keyCache.set(rawKey, cached);
  }
  return cached;
}

export async function encryptSecret(plain: string, rawKey?: string): Promise<string> {
  const key = await getKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain)));
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(sealed)}`;
}

/** Throws when the value was tampered with, sealed with another key, or is not in the sealed format. */
export async function decryptSecret(enc: string, rawKey?: string): Promise<string> {
  const [version, ivPart, dataPart, extra] = enc.split(".");
  if (version !== VERSION || !ivPart || !dataPart || extra !== undefined) throw new Error("Malformed sealed secret");
  const key = await getKey(rawKey);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivPart) }, key, fromBase64(dataPart));
  return decoder.decode(plain);
}

/** SHA-256 hex digest, used to store nonces and other bearer values without keeping the raw value. */
export async function hashToken(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Random URL-safe token with `bytes` bytes of entropy (default 32). */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
