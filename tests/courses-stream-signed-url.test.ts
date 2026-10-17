import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { exportJWK, generateKeyPair, jwtVerify, decodeProtectedHeader } from "jose";
import { CourseError } from "@/lib/courses/course-errors";
import {
  STREAM_TOKEN_TTL_SECONDS,
  createSignedStreamPlayback,
  loadStreamSigningConfig,
} from "@/lib/courses/stream-signed-url";

const STREAM_UID = "0123456789abcdef0123456789abcdef";
const SUBDOMAIN = "customer-abc123.cloudflarestream.com";

describe("Cloudflare Stream signed playback", () => {
  it("signs an RS256 token with kid, sub, nbf and exp, and builds iframe + HLS URLs", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    const keyMaterial = Buffer.from(JSON.stringify(await exportJWK(privateKey))).toString("base64");
    const config = loadStreamSigningConfig({
      CF_STREAM_SIGNING_KEY_ID: "key-123",
      CF_STREAM_SIGNING_KEY_JWK: keyMaterial,
      CF_STREAM_CUSTOMER_SUBDOMAIN: `https://${SUBDOMAIN}/`,
    });
    const now = new Date("2026-10-13T10:00:00Z");

    const playback = await createSignedStreamPlayback(STREAM_UID, config, now);

    expect(decodeProtectedHeader(playback.token)).toEqual({ alg: "RS256", kid: "key-123" });
    const { payload } = await jwtVerify(playback.token, publicKey, { algorithms: ["RS256"], currentDate: now });
    const issuedAt = Math.floor(now.getTime() / 1000);
    expect(payload.sub).toBe(STREAM_UID);
    expect(payload.kid).toBe("key-123");
    expect(payload.exp).toBe(issuedAt + STREAM_TOKEN_TTL_SECONDS);
    expect(payload.nbf).toBeLessThanOrEqual(issuedAt);
    expect(playback.iframeUrl).toBe(`https://${SUBDOMAIN}/${playback.token}/iframe`);
    expect(playback.hlsUrl).toBe(`https://${SUBDOMAIN}/${playback.token}/manifest/video.m3u8`);
    expect(playback.expiresAt).toBe(new Date((issuedAt + STREAM_TOKEN_TTL_SECONDS) * 1000).toISOString());
  });

  it("accepts Cloudflare's base64 PKCS#1 PEM encoding", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ format: "pem", type: "pkcs1" }).toString();
    const config = loadStreamSigningConfig({
      CF_STREAM_SIGNING_KEY_ID: "key-pem",
      CF_STREAM_SIGNING_KEY_JWK: Buffer.from(pem).toString("base64"),
      CF_STREAM_CUSTOMER_SUBDOMAIN: SUBDOMAIN,
    });
    const playback = await createSignedStreamPlayback(STREAM_UID, config);
    const { payload } = await jwtVerify(playback.token, publicKey, { algorithms: ["RS256"] });
    expect(payload.sub).toBe(STREAM_UID);
  });

  it("raises 503 when any Stream secret is missing", () => {
    expect(() => loadStreamSigningConfig({ CF_STREAM_SIGNING_KEY_ID: "k", CF_STREAM_CUSTOMER_SUBDOMAIN: SUBDOMAIN }))
      .toThrowError(expect.objectContaining({ status: 503, code: "stream_not_configured" }));
  });

  it("raises 503 for a subdomain that is not a Stream customer host", () => {
    expect(() =>
      loadStreamSigningConfig({
        CF_STREAM_SIGNING_KEY_ID: "k",
        CF_STREAM_SIGNING_KEY_JWK: "x",
        CF_STREAM_CUSTOMER_SUBDOMAIN: "evil.example.com",
      })
    ).toThrow(CourseError);
  });

  it("raises 503 instead of signing with an unreadable key", async () => {
    const config = loadStreamSigningConfig({
      CF_STREAM_SIGNING_KEY_ID: "k",
      CF_STREAM_SIGNING_KEY_JWK: Buffer.from("not a key").toString("base64"),
      CF_STREAM_CUSTOMER_SUBDOMAIN: SUBDOMAIN,
    });
    await expect(createSignedStreamPlayback(STREAM_UID, config)).rejects.toMatchObject({ status: 503 });
  });
});
