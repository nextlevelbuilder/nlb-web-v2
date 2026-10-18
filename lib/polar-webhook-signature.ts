import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { Webhook, WebhookVerificationError as StandardWebhookVerificationError } from "standardwebhooks";

const STANDARD_SECRET_PREFIX = "whsec_";

/**
 * Verify a Polar webhook signature. Throws `WebhookVerificationError` when the signature is invalid.
 *
 * Polar endpoints come with one of two secret formats:
 * - `polar_whs_…` (older endpoints): the SDK signs with the secret's UTF-8 bytes, so `validateEvent` handles it.
 * - `whsec_…` (endpoints using the Standard Webhooks signature): the key is the base64 text after the
 *   prefix. The SDK would base64-encode the whole string and never match, so `standardwebhooks`
 *   verifies these directly. The route reads the JSON body itself, so no SDK event parsing is needed.
 */
export function verifyPolarWebhook(body: string, headers: Record<string, string>, secret: string): void {
  if (!secret.startsWith(STANDARD_SECRET_PREFIX)) {
    validateEvent(body, headers, secret);
    return;
  }
  try {
    new Webhook(secret).verify(body, headers);
  } catch (error) {
    if (error instanceof StandardWebhookVerificationError) throw new WebhookVerificationError(error.message);
    throw error;
  }
}
