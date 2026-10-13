import { sql, type SQL } from "drizzle-orm";
import { products } from "@/lib/db/schema";
import { TRUST_POINTS } from "./trust";

/** Match the product Trust Passport formula before applying database pagination. */
export function productTrustScoreOrder(now = Date.now(), websiteUrl: SQL = sql`${products.websiteUrl}`) {
  // SQLite: scalar min()/max() replace least()/greatest(); created_at is epoch milliseconds.
  return sql<number>`min(${TRUST_POINTS.maximum},
    case when ${products.status} = 'published' then ${TRUST_POINTS.humanApproval} else 0 end
    + case when ${websiteUrl} like 'https://%' then ${TRUST_POINTS.https} else 0 end
    + min(max(${products.trustScore}, 0), ${TRUST_POINTS.maxVotes / TRUST_POINTS.perVote}) * ${TRUST_POINTS.perVote}
    + min((max(${now} - ${products.createdAt}, 0) / 604800000) * ${TRUST_POINTS.perWeek}, ${TRUST_POINTS.maxLongevity})
  )`;
}
