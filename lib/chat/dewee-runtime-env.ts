import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Runtime vars and secrets of the website chat (Dewee). All optional: without the CCP values the
 * chat backend answers 503 and the widget stays hidden; without the identity values signed-in
 * visitors chat anonymously.
 */
export type DeweeEnvKey =
  | "DEWEE_CCP_CHAT_URL"
  | "DEWEE_WEBCHAT_INTEGRATION_ID"
  | "DEWEE_WEBCHAT_INTEGRATION_SECRET"
  | "DEWEE_WEBCHAT_SECRET"
  | "DEWEE_IDENTITY_APP_ID"
  | "DEWEE_IDENTITY_ISSUER"
  | "DEWEE_IDENTITY_ASSERTION_SECRET"
  | "DISCORD_LEADS_WEBHOOK_URL"
  | "DISCORD_SALES_WEBHOOK_URL"
  | "TRAFFIC_HASH_SECRET"
  | "BETTER_AUTH_SECRET";
export type DeweeRuntimeEnv = Partial<Record<DeweeEnvKey, string>>;

/** Same resolution as the Courses env: the OpenNext context inside the Worker, process.env elsewhere. */
export function getDeweeRuntimeEnv(): DeweeRuntimeEnv {
  try {
    const context = getCloudflareContext();
    if (context?.env) return { ...(process.env as DeweeRuntimeEnv), ...(context.env as DeweeRuntimeEnv) };
  } catch {
    // No OpenNext request context (local Node, vitest).
  }
  return process.env as DeweeRuntimeEnv;
}

/** True when the CCP integration is fully configured, so the widget may be shown. */
export function isDeweeChatConfigured(env: DeweeRuntimeEnv = getDeweeRuntimeEnv()): boolean {
  return Boolean(
    env.DEWEE_CCP_CHAT_URL && env.DEWEE_WEBCHAT_INTEGRATION_ID && env.DEWEE_WEBCHAT_INTEGRATION_SECRET &&
      env.DEWEE_WEBCHAT_SECRET && env.DEWEE_WEBCHAT_SECRET.length >= 32
  );
}
