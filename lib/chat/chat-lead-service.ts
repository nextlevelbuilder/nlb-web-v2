import { createHmac } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { chatLeads } from "@/lib/db/schema";
import { maskEmail } from "@/lib/discord";
import { locales } from "@/i18n/routing";

/** Leads one address may leave per hour; the widget also caps automatic agent turns. */
export const LEADS_PER_IP_PER_HOUR = 5;
const LEAD_WEBHOOK_TIMEOUT_MS = 5000;

export const chatLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  need: z.string().trim().min(1).max(2000),
  interest: z.enum(["premium", "vip", "courses", "build-with-us", "other"]).optional(),
  wantsHuman: z.boolean().optional().default(false),
  locale: z.enum(locales),
  pagePath: z.string().max(300).regex(/^\//).optional(),
  /** The widget's confirmation dialog is the consent; the page sends true only after approval. */
  consent: z.literal(true),
});
export type ChatLeadInput = z.infer<typeof chatLeadSchema>;

/** Keyed hash of the client address, so rate limiting never stores the raw IP. */
export function hashClientIp(ip: string | null, secret: string | undefined): string | null {
  if (!ip || !secret) return null;
  return createHmac("sha256", secret).update(`chat-lead:${ip}`).digest("hex").slice(0, 32);
}

export type SaveLeadResult = { ok: true; id: string } | { ok: false; reason: "rate_limited" };

export async function saveChatLead(
  input: ChatLeadInput,
  meta: { ipHash: string | null; userId: string | null; now?: Date },
  db: AppDb
): Promise<SaveLeadResult> {
  const now = meta.now ?? new Date();
  if (meta.ipHash) {
    const [row] = await db
      .select({ n: count() })
      .from(chatLeads)
      .where(and(eq(chatLeads.ipHash, meta.ipHash), gte(chatLeads.createdAt, new Date(now.getTime() - 3_600_000))));
    if ((row?.n ?? 0) >= LEADS_PER_IP_PER_HOUR) return { ok: false, reason: "rate_limited" };
  }
  const id = crypto.randomUUID();
  await db.insert(chatLeads).values({
    id,
    name: input.name,
    email: input.email,
    need: input.need,
    interest: input.interest ?? null,
    wantsHuman: input.wantsHuman,
    locale: input.locale,
    pagePath: input.pagePath ?? null,
    userId: meta.userId,
    ipHash: meta.ipHash,
    consentedAt: now,
    createdAt: now,
  });
  return { ok: true, id };
}

/**
 * Post a new-lead embed to the team's Discord webhook. The email is masked like sales
 * notifications; the full row is read from D1 by an admin. Never throws.
 */
export async function notifyChatLead(webhookUrl: string | undefined, lead: ChatLeadInput & { id: string }): Promise<boolean> {
  if (!webhookUrl) {
    console.warn("No Discord webhook for chat leads. Skipping lead notification.");
    return false;
  }
  const payload = {
    embeds: [
      {
        title: lead.wantsHuman ? "New chat lead · wants a person" : "New chat lead",
        color: lead.wantsHuman ? 0xf97316 : 0x3b82f6,
        fields: [
          { name: "Name", value: lead.name.slice(0, 120), inline: true },
          { name: "Email", value: maskEmail(lead.email), inline: true },
          { name: "Interest", value: lead.interest ?? "—", inline: true },
          { name: "Need", value: lead.need.slice(0, 1000), inline: false },
          { name: "Locale", value: lead.locale, inline: true },
          { name: "Page", value: lead.pagePath ?? "—", inline: true },
          { name: "Lead id", value: lead.id, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [] },
  };
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LEAD_WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`Discord lead notification refused: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Discord lead notification failed:", error instanceof Error ? error.name : "unknown");
    return false;
  }
}
