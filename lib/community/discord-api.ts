import { getOnboardingEnv, type OnboardingRuntimeEnv } from "@/lib/onboarding/flags";
import { ProviderError, PROVIDER_FETCH_TIMEOUT_MS, isFetchTimeout } from "./types";

/**
 * Minimal Discord REST v10 client for onboarding: OAuth2 code/refresh exchange, `@me`, and the bot
 * calls that manage guild membership and the two NLB-managed roles. Errors surface as
 * `ProviderError` with short codes only; tokens, codes and response bodies never reach a log or the
 * stored error.
 */
export const DISCORD_API_BASE = "https://discord.com/api/v10";
export const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
export const DISCORD_OAUTH_SCOPES = "identify guilds.join";
export const DISCORD_CALLBACK_PATH = "/api/onboarding/discord/callback";
const AUDIT_LOG_REASON = "NLB membership sync";

/** Discord JSON error codes we map to an operator action instead of a retry. */
const PERMANENT_CODES: Readonly<Record<number, string>> = {
  10004: "discord_unknown_guild",
  10011: "discord_unknown_role",
  30001: "discord_max_guilds",
  40007: "discord_user_banned",
  50001: "discord_missing_access",
  50013: "discord_missing_permissions",
};
/** Invalid OAuth2 access token (the member must be re-authorized or the token refreshed). */
export const DISCORD_INVALID_OAUTH_TOKEN = 50025;
export const DISCORD_UNKNOWN_MEMBER = 10007;

export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  botToken: string;
  guildId: string;
  premiumRoleId: string;
  vipRoleId: string;
}

export function readDiscordConfig(source: OnboardingRuntimeEnv = getOnboardingEnv()): Partial<DiscordConfig> {
  return {
    clientId: source.DISCORD_CLIENT_ID,
    clientSecret: source.DISCORD_CLIENT_SECRET,
    botToken: source.DISCORD_BOT_TOKEN,
    guildId: source.DISCORD_GUILD_ID,
    premiumRoleId: source.DISCORD_PREMIUM_ROLE_ID,
    vipRoleId: source.DISCORD_VIP_ROLE_ID,
  };
}

/** Redirect URI registered on the Discord application; identical for authorize and token exchange. */
export function discordRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${DISCORD_CALLBACK_PATH}`;
}

interface DiscordFailure {
  status: number;
  code?: number;
  error?: string;
  retryAfterMs?: number;
}

async function readFailure(response: Response): Promise<DiscordFailure> {
  let body: { code?: unknown; error?: unknown; retry_after?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Non-JSON error body (an HTML 5xx page): status alone decides.
  }
  const retryAfterSeconds =
    typeof body.retry_after === "number" ? body.retry_after : Number.parseFloat(response.headers.get("retry-after") ?? "");
  return {
    status: response.status,
    code: typeof body.code === "number" ? body.code : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
    retryAfterMs: Number.isFinite(retryAfterSeconds) ? Math.ceil(retryAfterSeconds * 1000) : undefined,
  };
}

/** Map a failed Discord response to a storable error: transient ones retry, the rest need an operator or the member. */
export function toProviderError(failure: DiscordFailure): ProviderError {
  if (failure.status === 429) {
    return new ProviderError("discord_rate_limited", { retryable: true, retryAfterMs: failure.retryAfterMs ?? 1000 });
  }
  if (failure.status >= 500) return new ProviderError(`discord_http_${failure.status}`, { retryable: true });
  if (failure.code === DISCORD_INVALID_OAUTH_TOKEN || failure.error === "invalid_grant") {
    return new ProviderError("discord_reauth");
  }
  if (failure.code !== undefined && PERMANENT_CODES[failure.code]) return new ProviderError(PERMANENT_CODES[failure.code]);
  if (failure.status === 401) return new ProviderError("discord_bot_unauthorized");
  return new ProviderError(`discord_http_${failure.status}`);
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new ProviderError(isFetchTimeout(error) ? "discord_timeout" : "discord_network", { retryable: true });
  }
}

export interface DiscordTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

async function tokenRequest(config: Pick<DiscordConfig, "clientId" | "clientSecret">, params: Record<string, string>, now: Date) {
  const response = await send(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  });
  if (!response.ok) throw toProviderError(await readFailure(response));
  const body = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) throw new ProviderError("discord_bad_token_response");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 0;
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
  } satisfies DiscordTokenSet;
}

/** Exchange an authorization code (with its PKCE verifier) for user tokens. */
export function exchangeDiscordCode(
  config: Pick<DiscordConfig, "clientId" | "clientSecret">,
  input: { code: string; codeVerifier: string; redirectUri: string },
  now: Date = new Date()
): Promise<DiscordTokenSet> {
  return tokenRequest(
    config,
    { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, code_verifier: input.codeVerifier },
    now
  );
}

/** Refresh user tokens. `invalid_grant` becomes the permanent `discord_reauth` code. */
export function refreshDiscordToken(
  config: Pick<DiscordConfig, "clientId" | "clientSecret">,
  refreshToken: string,
  now: Date = new Date()
): Promise<DiscordTokenSet> {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken }, now);
}

export interface DiscordUser {
  id: string;
  displayName: string;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await send(`${DISCORD_API_BASE}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!response.ok) throw toProviderError(await readFailure(response));
  const body = (await response.json()) as { id?: unknown; username?: unknown; global_name?: unknown };
  if (typeof body.id !== "string" || !body.id) throw new ProviderError("discord_bad_user_response");
  const displayName =
    (typeof body.global_name === "string" && body.global_name) || (typeof body.username === "string" && body.username) || body.id;
  return { id: body.id, displayName };
}

/** Bot-authenticated guild calls. Every mutation carries an audit-log reason. */
export class DiscordGuildClient {
  constructor(private readonly config: Pick<DiscordConfig, "botToken" | "guildId">) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bot ${this.config.botToken}`,
      accept: "application/json",
      "x-audit-log-reason": encodeURIComponent(AUDIT_LOG_REASON),
      ...extra,
    };
  }

  private memberUrl(discordUserId: string): string {
    return `${DISCORD_API_BASE}/guilds/${encodeURIComponent(this.config.guildId)}/members/${encodeURIComponent(discordUserId)}`;
  }

  /** Current role ids of a guild member, or null when the user is not in the guild. */
  async getMemberRoles(discordUserId: string): Promise<string[] | null> {
    const response = await send(this.memberUrl(discordUserId), { headers: this.headers() });
    if (response.ok) {
      const body = (await response.json()) as { roles?: unknown };
      return Array.isArray(body.roles) ? body.roles.filter((role): role is string => typeof role === "string") : [];
    }
    const failure = await readFailure(response);
    if (failure.status === 404 && failure.code === DISCORD_UNKNOWN_MEMBER) return null;
    throw toProviderError(failure);
  }

  /**
   * Add the user to the guild with their `guilds.join` token, with the given roles on join.
   * Discord answers 201 when it added the member and 204 when they were already in the guild; in
   * that case the roles in the body are ignored, so the caller must apply them itself.
   */
  async addMember(discordUserId: string, accessToken: string, roles: string[]): Promise<"added" | "already_member"> {
    const response = await send(this.memberUrl(discordUserId), {
      method: "PUT",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ access_token: accessToken, roles }),
    });
    if (!response.ok) throw toProviderError(await readFailure(response));
    return response.status === 204 ? "already_member" : "added";
  }

  async addRole(discordUserId: string, roleId: string): Promise<void> {
    await this.roleCall("PUT", discordUserId, roleId);
  }

  async removeRole(discordUserId: string, roleId: string): Promise<void> {
    await this.roleCall("DELETE", discordUserId, roleId);
  }

  private async roleCall(method: "PUT" | "DELETE", discordUserId: string, roleId: string): Promise<void> {
    const response = await send(`${this.memberUrl(discordUserId)}/roles/${encodeURIComponent(roleId)}`, {
      method,
      headers: this.headers(),
    });
    if (response.ok) return;
    const failure = await readFailure(response);
    // The member left between the read and this call: nothing to remove.
    if (method === "DELETE" && failure.status === 404 && failure.code === DISCORD_UNKNOWN_MEMBER) return;
    throw toProviderError(failure);
  }
}
