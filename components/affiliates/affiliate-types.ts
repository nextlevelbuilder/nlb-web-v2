/** View shapes the dashboard receives from the shared affiliate read models (type-only imports). */
import type { affiliateSummary, linkView, listAffiliatePayouts, listConversions, listLedger } from "@/lib/referrals/affiliate-read-models";
import type { payoutMethodView } from "@/lib/referrals/affiliate-payouts";

export type AffiliateSummaryView = Awaited<ReturnType<typeof affiliateSummary>>;
export type AffiliateLinkView = ReturnType<typeof linkView>;
export type AffiliateConversionView = Awaited<ReturnType<typeof listConversions>>[number];
export type AffiliateLedgerView = Awaited<ReturnType<typeof listLedger>>[number];
export type AffiliatePayoutView = Awaited<ReturnType<typeof listAffiliatePayouts>>[number];
export type AffiliatePayoutMethodView = NonNullable<ReturnType<typeof payoutMethodView>>;
