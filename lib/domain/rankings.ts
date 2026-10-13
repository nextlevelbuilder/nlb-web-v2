import { getDb, type AppDb } from "@/lib/db";
import { products, votes, rankingSnapshots } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import crypto from "crypto";

export interface ComputeSnapshotParams {
  windowType: "daily" | "weekly" | "monthly";
  windowDate?: string;
  rulesetVersion?: string;
}

/**
 * Compute an immutable organic ranking snapshot from eligible votes.
 * For daily: exact 24-hour date window.
 * For weekly: trailing 7 days window.
 * For monthly: trailing 30 days window.
 */
export async function computeRankingSnapshot(params: ComputeSnapshotParams, customDb?: AppDb) {
  const db = customDb || getDb();
  const endDate = params.windowDate || new Date().toISOString().split("T")[0];
  const rulesetVersion = params.rulesetVersion || "v1";

  // Calculate start date based on window type
  const dateCursor = new Date(endDate);
  let startDate = endDate;
  if (params.windowType === "weekly") {
    dateCursor.setUTCDate(dateCursor.getUTCDate() - 7);
    startDate = dateCursor.toISOString().split("T")[0];
  } else if (params.windowType === "monthly") {
    dateCursor.setUTCDate(dateCursor.getUTCDate() - 30);
    startDate = dateCursor.toISOString().split("T")[0];
  }

  // Calculate vote totals for published products within the date window
  const voteAggregates = await db
    .select({
      productId: votes.productId,
      voteCount: sql<number>`count(${votes.id})`,
    })
    .from(votes)
    .innerJoin(products, eq(votes.productId, products.id))
    .where(
      and(
        gte(votes.voteDate, startDate),
        lte(votes.voteDate, endDate),
        eq(products.status, "published")
      )
    )
    .groupBy(votes.productId)
    .orderBy(desc(sql`count(${votes.id})`));

  // Build ranked array
  const ranks = voteAggregates.map((item, index) => ({
    rank: index + 1,
    productId: item.productId,
    voteCount: item.voteCount,
    score: item.voteCount * 10,
  }));

  // Generate deterministic snapshot hash
  const snapshotData = {
    windowType: params.windowType,
    windowDate: endDate,
    startDate,
    rulesetVersion,
    ranks,
  };
  const snapshotHash = crypto.createHash("sha256").update(JSON.stringify(snapshotData)).digest("hex");

  const [snapshot] = await db
    .insert(rankingSnapshots)
    .values({
      windowType: params.windowType,
      windowDate: endDate,
      rulesetVersion,
      ranks,
      isFinal: true,
      snapshotHash,
    })
    .returning();

  return snapshot;
}

/**
 * Get the latest ranking snapshot for a window type.
 */
export async function getLatestRankingSnapshot(
  windowType: "daily" | "weekly" | "monthly" = "daily",
  customDb?: AppDb
) {
  const db = customDb || getDb();

  const [snapshot] = await db
    .select()
    .from(rankingSnapshots)
    .where(eq(rankingSnapshots.windowType, windowType))
    .orderBy(desc(rankingSnapshots.windowDate), desc(rankingSnapshots.createdAt))
    .limit(1);

  return snapshot;
}
