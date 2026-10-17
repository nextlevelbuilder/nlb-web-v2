import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { communityConnections } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { DiscordGuildClient, readDiscordConfig, refreshDiscordToken, type DiscordConfig } from "./discord-api";
import { assertConnectionGrantable } from "./grant-guard";
import { ProviderError, type ApplyInput, type ApplyResult, type CommunityAdapter, type CommunityConnection, type MembershipTier } from "./types";

/** Refresh a little before expiry so the join call never races the token's end. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

/** NLB-managed roles a tier should hold. Every other role on the member is left alone. */
function rolesForTier(tier: MembershipTier, config: DiscordConfig): string[] {
  if (tier === "vip") return [config.premiumRoleId, config.vipRoleId];
  if (tier === "premium") return [config.premiumRoleId];
  return [];
}

function requireConfig(): DiscordConfig {
  const config = readDiscordConfig();
  if (!config.clientId || !config.clientSecret || !config.botToken || !config.guildId || !config.premiumRoleId || !config.vipRoleId) {
    throw new ProviderError("discord_not_configured");
  }
  return config as DiscordConfig;
}

/**
 * A usable `guilds.join` access token for the connection, refreshing (and re-sealing) it when it is
 * missing or about to expire. A refresh rejected with `invalid_grant` surfaces as `discord_reauth`.
 */
async function accessTokenFor(
  db: AppDb,
  connection: CommunityConnection,
  config: DiscordConfig,
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
): Promise<string> {
  const now = new Date();
  const fresh = connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() - TOKEN_EXPIRY_SKEW_MS > now.getTime();
  if (connection.accessTokenEnc && fresh && !forceRefresh) return decryptSecret(connection.accessTokenEnc);
  if (!connection.refreshTokenEnc) throw new ProviderError("discord_reauth");

  const tokens = await refreshDiscordToken(config, await decryptSecret(connection.refreshTokenEnc), now);
  const update = {
    accessTokenEnc: await encryptSecret(tokens.accessToken),
    // Discord rotates refresh tokens; keep the old one only if none came back.
    refreshTokenEnc: tokens.refreshToken ? await encryptSecret(tokens.refreshToken) : connection.refreshTokenEnc,
    tokenExpiresAt: tokens.expiresAt,
    updatedAt: now,
  };
  await db.update(communityConnections).set(update).where(eq(communityConnections.id, connection.id));
  Object.assign(connection, update);
  return tokens.accessToken;
}

/** Join the guild with the target roles, retrying once with a refreshed token if Discord rejects the current one. */
async function joinGuild(input: ApplyInput & { connection: CommunityConnection }, config: DiscordConfig, guild: DiscordGuildClient, roles: string[]) {
  const discordUserId = input.connection.externalUserId;
  const token = await accessTokenFor(input.db, input.connection, config);
  try {
    await guild.addMember(discordUserId, token, roles);
  } catch (error) {
    if (!(error instanceof ProviderError) || error.code !== "discord_reauth" || !input.connection.refreshTokenEnc) throw error;
    await guild.addMember(discordUserId, await accessTokenFor(input.db, input.connection, config, { forceRefresh: true }), roles);
  }
}

async function converge(input: ApplyInput & { connection: CommunityConnection }): Promise<ApplyResult> {
  const config = requireConfig();
  const guild = new DiscordGuildClient(config);
  const discordUserId = input.connection.externalUserId;
  const managed = [config.premiumRoleId, config.vipRoleId];
  const wanted = rolesForTier(input.desiredTier, config);

  const currentRoles = await guild.getMemberRoles(discordUserId);
  if (currentRoles === null) {
    // Not in the guild. Revoking never kicks, so there is nothing left to do; granting joins with the roles.
    if (input.desiredTier === "none") return { status: "revoked", appliedTier: "none" };
    await assertConnectionGrantable(input.db, input.connection);
    await joinGuild(input, config, guild, wanted);
    return { status: "active", appliedTier: input.desiredTier };
  }

  const missing = wanted.filter((role) => !currentRoles.includes(role));
  if (missing.length > 0) await assertConnectionGrantable(input.db, input.connection);
  for (const role of missing) await guild.addRole(discordUserId, role);
  for (const role of managed) {
    if (!wanted.includes(role) && currentRoles.includes(role)) await guild.removeRole(discordUserId, role);
  }
  return input.desiredTier === "none"
    ? { status: "revoked", appliedTier: "none" }
    : { status: "active", appliedTier: input.desiredTier };
}

/**
 * Discord guild adapter. Premium holds the Premium role, VIP holds Premium and VIP, none removes
 * only those two roles (the member is never kicked and other roles are never touched). Transient
 * failures throw a retryable `ProviderError` so the job backs off; permanent ones (missing bot
 * permissions, unknown guild or role, an expired authorization) return `action_required`.
 */
export const discordAdapter: CommunityAdapter = {
  target: "discord_guild",
  provider: "discord",
  async apply(input) {
    if (!input.connection) return { status: "not_connected", appliedTier: "none" };
    try {
      return await converge({ ...input, connection: input.connection });
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) {
        return { status: "action_required", appliedTier: input.current?.appliedTier ?? "none", errorCode: error.code };
      }
      throw error;
    }
  },
};
