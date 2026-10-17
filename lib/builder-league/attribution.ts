/**
 * Campaign attribution for shared Year in Review links: personalised share URLs with UTM tags, visits,
 * and the visit → signup → paid conversion chain, stored in `share_attributions`.
 *
 * Privacy: no IP address or user agent is stored. A visit carries a random first-party visitor id
 * (cookie `VISITOR_COOKIE`), stored only as an HMAC with the server secret `TRAFFIC_HASH_SECRET` and the
 * day, so the same browser cannot be followed across days or links. Without the secret, visits are
 * still counted but not de-duplicated. Browsers that send DNT or GPC are not tracked (the beacon checks
 * this before it calls the API).
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { createHmac } from "crypto";
import type { AppDb } from "@/lib/db";
import { builderShareLinks, shareAttributions } from "@/lib/db/schema";
import { trafficConfig } from "@/lib/traffic/config";
import { localDateKey, UTC_OFFSET_MS } from "./time-windows";

export const VISITOR_COOKIE = "nlb_wv";
/** Share link that brought this browser, read by the signup hook. */
export const SHARE_REF_COOKIE = "nlb_share_ref";
export const SHARE_REF_MAX_AGE_S = 30 * 24 * 60 * 60;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export type ShareChannel = "copy" | "x" | "facebook" | "linkedin" | "threads" | "zalo";

/** Personal share URL of a Year in Review link, tagged for the campaign. */
export function buildShareUrl(input: { origin: string; locale: string; year: number; token: string; channel?: ShareChannel }): string {
  const prefix = input.locale === "vi" ? "/vi" : "";
  const url = new URL(`${prefix}/wrapped/${input.year}/${input.token}`, input.origin);
  url.searchParams.set("utm_source", input.channel ?? "copy");
  url.searchParams.set("utm_medium", "share");
  url.searchParams.set("utm_campaign", `year-review-${input.year}`);
  return url.toString();
}

/** Keeps only known UTM keys with short printable values. */
export function sanitizeUtm(input: Record<string, unknown> | URLSearchParams | null | undefined): Utm {
  const utm: Utm = {};
  if (!input) return utm;
  for (const key of UTM_KEYS) {
    const raw = input instanceof URLSearchParams ? input.get(key) : input[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim().slice(0, 64);
    if (/^[\w.\-~ ]+$/.test(value)) utm[key] = value;
  }
  return utm;
}

/** HMAC of the visitor id, salted with the day and link; null when the secret is not configured. */
export function hashVisitor(visitorId: string, shareLinkId: string, at: Date, secret = trafficConfig().TRAFFIC_HASH_SECRET): string | null {
  if (!secret || secret.length < 32 || !visitorId) return null;
  return createHmac("sha256", secret).update(`${localDateKey(at)}:${shareLinkId}:${visitorId}`).digest("hex");
}

export function isValidVisitorId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

/** Records one visit per visitor, link and local day. Returns false for a repeat visit. */
export async function recordShareVisit(
  db: AppDb,
  input: { shareLinkId: string; visitorId: string; utm: Utm; now?: Date; secret?: string }
): Promise<boolean> {
  const now = input.now ?? new Date();
  const visitorHash = hashVisitor(input.visitorId, input.shareLinkId, now, input.secret ?? trafficConfig().TRAFFIC_HASH_SECRET);
  if (visitorHash) {
    const dayStart = Date.parse(`${localDateKey(now)}T00:00:00Z`) - UTC_OFFSET_MS;
    const [seen] = await db
      .select({ id: shareAttributions.id })
      .from(shareAttributions)
      .where(and(
        eq(shareAttributions.shareLinkId, input.shareLinkId),
        eq(shareAttributions.kind, "visit"),
        eq(shareAttributions.visitorHash, visitorHash),
        gte(shareAttributions.createdAt, new Date(dayStart))
      ))
      .limit(1);
    if (seen) return false;
  }
  await db.insert(shareAttributions).values({ shareLinkId: input.shareLinkId, kind: "visit", utm: input.utm, visitorHash, createdAt: now });
  return true;
}

/**
 * Attributes a signup or a paid membership to a share link. Call it from the auth signup hook (with
 * the `SHARE_REF_COOKIE` value) and from the Polar webhook (no cookie: the member's signup attribution
 * is reused). One row per member and kind; repeated calls are no-ops. A member is never attributed to
 * their own link. Returns the attributed share link id, or null.
 */
export async function recordShareConversion(
  db: AppDb,
  userId: string,
  kind: "signup" | "paid",
  opts: { shareLinkId?: string | null; now?: Date } = {}
): Promise<string | null> {
  const existing = await db
    .select({ id: shareAttributions.id, kind: shareAttributions.kind, shareLinkId: shareAttributions.shareLinkId })
    .from(shareAttributions)
    .where(and(eq(shareAttributions.userId, userId), inArray(shareAttributions.kind, ["signup", "paid"])));
  const same = existing.find((row) => row.kind === kind);
  if (same) return same.shareLinkId;

  const candidate = opts.shareLinkId ?? existing.find((row) => row.kind === "signup")?.shareLinkId ?? null;
  if (!candidate) return null;
  const [link] = await db
    .select({ id: builderShareLinks.id, userId: builderShareLinks.userId })
    .from(builderShareLinks)
    .where(eq(builderShareLinks.id, candidate))
    .limit(1);
  if (!link || link.userId === userId) return null;
  await db.insert(shareAttributions).values({ shareLinkId: link.id, kind, userId, createdAt: opts.now ?? new Date() });
  return link.id;
}

/** Funnel counts of one member's links, for the owner's share panel. */
export async function shareFunnel(db: AppDb, ownerUserId: string, year: number): Promise<{ visits: number; signups: number; paid: number }> {
  const rows = await db
    .select({ kind: shareAttributions.kind })
    .from(shareAttributions)
    .innerJoin(builderShareLinks, eq(builderShareLinks.id, shareAttributions.shareLinkId))
    .where(and(eq(builderShareLinks.userId, ownerUserId), eq(builderShareLinks.year, year)));
  return {
    visits: rows.filter((r) => r.kind === "visit").length,
    signups: rows.filter((r) => r.kind === "signup").length,
    paid: rows.filter((r) => r.kind === "paid").length,
  };
}
