import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { communityConnections } from "@/lib/db/schema";
import { ProviderError, type CommunityConnection } from "./types";

/**
 * Re-read the connection right before granting access. A grant goes ahead only while the row still
 * exists, points at the same external account and has no pending unlink; otherwise the adapter
 * stops with a retryable error so the job runs again against the current row. This keeps a slow
 * reconcile from re-granting access to an account the member just unlinked.
 */
export async function assertConnectionGrantable(db: AppDb, connection: CommunityConnection): Promise<void> {
  const [row] = await db
    .select({ externalUserId: communityConnections.externalUserId, unlinkRequestedAt: communityConnections.unlinkRequestedAt })
    .from(communityConnections)
    .where(eq(communityConnections.id, connection.id))
    .limit(1);
  if (!row || row.externalUserId !== connection.externalUserId || row.unlinkRequestedAt) {
    throw new ProviderError("connection_changed", { retryable: true });
  }
}
