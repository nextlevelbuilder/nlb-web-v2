import { env } from "./env";

/**
 * Assign premium role to a Discord user
 * Note: Requires Discord Bot Token and proper permissions
 */
export async function assignDiscordRole(discordUserId: string): Promise<boolean> {
  // Check if Discord integration is configured
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_PREMIUM_ROLE_ID) {
    console.warn("Discord integration not configured. Skipping role assignment.");
    return false;
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${env.DISCORD_PREMIUM_ROLE_ID}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to assign Discord role:", error);
      return false;
    }

    console.log(`✓ Discord role assigned to user: ${discordUserId}`);
    return true;
  } catch (error) {
    console.error("Error assigning Discord role:", error);
    return false;
  }
}

/**
 * Get Discord invite URL
 */
export function getDiscordInvite(): string {
  return env.DISCORD_INVITE_URL;
}

/** Discord webhook calls give up after this long so a slow Discord never holds a request open. */
const SALES_WEBHOOK_TIMEOUT_MS = 5000;

/** Keep the first two characters of the local part: `quang@gmail.com` becomes `qu***@gmail.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

export interface SalesNotification {
  productName: string;
  /** Minor units (cents), as Polar sends it. */
  amount: number;
  currency: string;
  customerEmail: string;
  source: "Polar" | "SePay";
  paidAt?: Date;
}

/**
 * Post a paid-checkout embed to the sales channel webhook (`DISCORD_SALES_WEBHOOK_URL`). The buyer
 * email is masked and nothing else about them is sent. Never throws: returns false when the webhook
 * is unset, Discord refuses, or the call times out.
 */
export async function sendDiscordSalesNotification(params: SalesNotification): Promise<boolean> {
  const webhookUrl = env.DISCORD_SALES_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("DISCORD_SALES_WEBHOOK_URL not configured. Skipping sales notification.");
    return false;
  }

  const { productName, amount, currency, customerEmail, source, paidAt = new Date() } = params;
  let formattedAmount: string;
  try {
    formattedAmount = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
      amount / 100
    );
  } catch {
    formattedAmount = `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }

  const payload = {
    embeds: [
      {
        title: "New checkout",
        color: 0x22c55e,
        fields: [
          { name: "Product", value: productName, inline: false },
          { name: "Amount", value: formattedAmount, inline: true },
          { name: "Email", value: maskEmail(customerEmail), inline: true },
          { name: "Source", value: source, inline: true },
        ],
        timestamp: paidAt.toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SALES_WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`Discord sales notification refused: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Discord sales notification failed:", error instanceof Error ? error.name : "unknown");
    return false;
  }
}
