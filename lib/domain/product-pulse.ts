import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { productPulseMonitors, productPulseSamples } from "@/lib/db/schema";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { ProductDocumentSchema } from "@nextlevelbuilder/contracts";
import { probeProductWebsite, type PulseProbeResult } from "@/lib/moderation/pulse-probe";

export const PULSE_COOLDOWN_MS = 5 * 60 * 1000;
export const PULSE_STALE_MS = 15 * 60 * 1000;
export const PULSE_HISTORY_LIMIT = 100;
const PULSE_LEASE_MS = 15_000;
const PULSE_CONCURRENCY_LIMIT = 4;

export interface PulseSample extends PulseProbeResult { checkedAt: string }
export interface PulseSummary {
  websiteUrl: string;
  status: "up" | "down" | "unknown" | "stale";
  checkedAt: string | null;
  latencyMs: number | null;
  sampleUptimePercent: number | null;
  sampleCount: number;
  measuredSampleCount: number;
  windowStartedAt: string | null;
  nextCheckAt: string | null;
  sampling: "on-view";
  history: PulseSample[];
}

export function summarizePulse(websiteUrl: string, samples: PulseSample[], nextCheckAt: Date | null, now = new Date()): PulseSummary {
  const history = [...samples].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)).slice(0, PULSE_HISTORY_LIMIT);
  const latest = history[0];
  const measured = history.filter(sample => sample.outcome !== "unknown");
  const successes = measured.filter(sample => sample.outcome === "up").length;
  return {
    websiteUrl,
    status: !latest ? "unknown" : now.getTime() - Date.parse(latest.checkedAt) > PULSE_STALE_MS ? "stale" : latest.outcome,
    checkedAt: latest?.checkedAt || null,
    latencyMs: latest?.latencyMs ?? null,
    sampleUptimePercent: measured.length ? Math.round(successes / measured.length * 10000) / 100 : null,
    sampleCount: history.length,
    measuredSampleCount: measured.length,
    windowStartedAt: history.at(-1)?.checkedAt || null,
    nextCheckAt: nextCheckAt?.toISOString() || null,
    sampling: "on-view",
    history,
  };
}

async function pulseTarget(slug: string, db: AppDb) {
  const result = await getPublishedProductBySlug(slug, db);
  if (!result) return null;
  let document = result.revision.document;
  if (typeof document === "string") {
    try { document = JSON.parse(document); } catch { return null; }
  }
  const parsed = ProductDocumentSchema.safeParse(document);
  if (!parsed.success || !parsed.data.blocks.some(block => block.type === "pulse")) return null;
  return { productId: result.product.id, websiteUrl: parsed.data.websiteUrl };
}

async function readSummary(productId: string, websiteUrl: string, db: AppDb): Promise<PulseSummary> {
  const samples = await db.select().from(productPulseSamples)
    .where(and(eq(productPulseSamples.productId, productId), eq(productPulseSamples.websiteUrl, websiteUrl)))
    .orderBy(desc(productPulseSamples.checkedAt)).limit(PULSE_HISTORY_LIMIT);
  const [monitor] = await db.select().from(productPulseMonitors).where(eq(productPulseMonitors.productId, productId)).limit(1);
  return summarizePulse(websiteUrl, samples.map(sample => ({
    checkedAt: sample.checkedAt.toISOString(), outcome: sample.outcome,
    latencyMs: sample.latencyMs, httpStatus: sample.httpStatus, reason: sample.reason,
  })), monitor?.nextCheckAt || null);
}

export async function getProductPulse(slug: string, customDb?: AppDb): Promise<PulseSummary | null> {
  const db = customDb || getDb();
  const target = await pulseTarget(slug, db);
  return target ? readSummary(target.productId, target.websiteUrl, db) : null;
}

/**
 * Reserve a per-product cooldown and one of the global concurrency slots in a single SQLite statement.
 * D1 serialises writes, so the conditional INSERT ... ON CONFLICT DO UPDATE ... WHERE is atomic and
 * replaces the Postgres advisory-lock transaction. A returned row means the reservation succeeded.
 */
export async function reservePulseCheck(productId: string, db: AppDb, now = Date.now()): Promise<boolean> {
  const nextCheckAt = now + PULSE_COOLDOWN_MS;
  const leaseUntil = now + PULSE_LEASE_MS;
  const rows = await db.all<{ product_id: string }>(sql`
    INSERT INTO ${productPulseMonitors} (product_id, next_check_at, lease_until)
    SELECT ${productId}, ${nextCheckAt}, ${leaseUntil}
    WHERE (SELECT count(*) FROM ${productPulseMonitors} WHERE lease_until > ${now}) < ${PULSE_CONCURRENCY_LIMIT}
    ON CONFLICT (product_id) DO UPDATE SET next_check_at = excluded.next_check_at, lease_until = excluded.lease_until
    WHERE ${productPulseMonitors}.next_check_at <= ${now}
    RETURNING product_id`);
  return rows.length > 0;
}

export async function sampleProductPulse(slug: string, customDb?: AppDb): Promise<{ data: PulseSummary; sampled: boolean } | null> {
  const db = customDb || getDb();
  const target = await pulseTarget(slug, db);
  if (!target) return null;
  const sampled = await reservePulseCheck(target.productId, db);
  if (sampled) {
    try {
      const measurement = await probeProductWebsite(target.websiteUrl);
      await db.batch([
        db.insert(productPulseSamples).values({ ...target, ...measurement }),
        // A fixed history size also bounds storage for abandoned and frequently viewed products.
        db.delete(productPulseSamples).where(and(
          eq(productPulseSamples.productId, target.productId),
          sql`${productPulseSamples.id} IN (
            SELECT id FROM ${productPulseSamples} WHERE product_id = ${target.productId}
            ORDER BY checked_at DESC, id DESC LIMIT -1 OFFSET ${PULSE_HISTORY_LIMIT}
          )`,
        )),
      ]);
    } finally {
      await db.update(productPulseMonitors).set({ leaseUntil: new Date() }).where(eq(productPulseMonitors.productId, target.productId));
    }
  }
  return { data: await readSummary(target.productId, target.websiteUrl, db), sampled };
}
