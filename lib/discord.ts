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

/**
 * Send new sale notification to Discord webhook
 */
export async function sendDiscordSalesNotification(params: {
  customerName: string;
  customerEmail: string;
  productName: string;
  amount: number;
  currency: string;
  orderId: string;
}): Promise<boolean> {
  const webhookUrl = env.DISCORD_SALES_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("DISCORD_SALES_WEBHOOK_URL not configured. Skipping sales notification.");
    return false;
  }

  const { customerName, customerEmail, productName, amount, currency, orderId } = params;
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

  const payload = {
    embeds: [
      {
        title: "New Sale!",
        color: 0x22c55e,
        fields: [
          { name: "Customer", value: customerName, inline: true },
          { name: "Email", value: customerEmail, inline: true },
          { name: "Product", value: productName, inline: false },
          { name: "Amount", value: formattedAmount, inline: true },
          { name: "Order ID", value: orderId, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send Discord sales notification:", error);
      return false;
    }

    console.log("Discord sales notification sent for order:", orderId);
    return true;
  } catch (error) {
    console.error("Error sending Discord sales notification:", error);
    return false;
  }
}
