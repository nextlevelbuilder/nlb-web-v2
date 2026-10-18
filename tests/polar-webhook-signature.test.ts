import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { verifyPolarWebhook } from "@/lib/polar-webhook-signature";

const BODY = JSON.stringify({
  type: "checkout.created",
  timestamp: "2026-10-18T09:00:00Z",
  data: { id: "chk_1" },
});

function sign(key: Buffer, body = BODY, id = "msg_1", timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${signature}` };
}

describe("verifyPolarWebhook", () => {
  const key = randomBytes(32);
  const standardSecret = `whsec_${key.toString("base64")}`;

  it("accepts a Standard Webhooks secret signed with its decoded key", () => {
    expect(() => verifyPolarWebhook(BODY, sign(key), standardSecret)).not.toThrow();
  });

  it("rejects a Standard Webhooks signature made with another key", () => {
    expect(() => verifyPolarWebhook(BODY, sign(randomBytes(32)), standardSecret)).toThrow(WebhookVerificationError);
  });

  it("rejects a tampered body", () => {
    expect(() => verifyPolarWebhook(`${BODY} `, sign(key), standardSecret)).toThrow(WebhookVerificationError);
  });

  it("rejects a stale timestamp", () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    expect(() => verifyPolarWebhook(BODY, sign(key, BODY, "msg_1", stale), standardSecret)).toThrow(
      WebhookVerificationError
    );
  });

  it("still verifies legacy Polar secrets through the SDK", () => {
    const legacySecret = "polar_whs_legacy-secret-value";
    // The SDK also schema-parses the event; this minimal body fails that step, but not the signature.
    const signatureError = (headers: Record<string, string>) => {
      try {
        verifyPolarWebhook(BODY, headers, legacySecret);
        return false;
      } catch (error) {
        return error instanceof WebhookVerificationError;
      }
    };
    expect(signatureError(sign(Buffer.from(legacySecret, "utf8")))).toBe(false);
    expect(signatureError(sign(key))).toBe(true);
  });
});
