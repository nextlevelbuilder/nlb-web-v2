import { env } from "@/lib/env";
import { PRODUCT_IDS } from "@/lib/polar";
import { MEMBERSHIP_PRICES, type BillingCycle, type MembershipPlan } from "@/lib/constants/launch";
import type { SepayProductKind } from "@/lib/db/sepay-schema";

/** What a SePay checkout sells, resolved server-side; the client only names a SKU. */
export interface SepayProduct {
  kind: SepayProductKind;
  /** Polar product id (membership, toolkit) or course video id. */
  productRef: string;
  productName: string;
  /** Prepaid membership length; null for one-time products. */
  periodMonths: number | null;
  amountVnd: number;
}

/** Membership SKUs are `<plan>_<billing>`; prices come from the USD list prices on the pricing page. */
export type SepayStaticSku = "premium_quarterly" | "premium_annual" | "vip_quarterly" | "vip_annual" | "publishing_toolkit";

type MembershipSku = Exclude<SepayStaticSku, "publishing_toolkit">;

const MEMBERSHIP_SKUS: Record<MembershipSku, { plan: MembershipPlan; billing: BillingCycle; productRef: string; name: string; months: number }> = {
  premium_quarterly: { plan: "premium", billing: "quarterly", productRef: PRODUCT_IDS.PREMIUM_QUARTERLY, name: "Premium Access (Quarterly, prepaid)", months: 3 },
  premium_annual: { plan: "premium", billing: "annual", productRef: PRODUCT_IDS.PREMIUM_ANNUAL, name: "Premium Access (Annual, prepaid)", months: 12 },
  vip_quarterly: { plan: "vip", billing: "quarterly", productRef: PRODUCT_IDS.VIP_QUARTERLY, name: "VIP Access (Quarterly, prepaid)", months: 3 },
  vip_annual: { plan: "vip", billing: "annual", productRef: PRODUCT_IDS.VIP_ANNUAL, name: "VIP Access (Annual, prepaid)", months: 12 },
};

export function isSepayEnabled(): boolean {
  return env.SEPAY_ENABLED === "true" && Boolean(env.SEPAY_BANK_ACCOUNT && env.SEPAY_BANK_CODE && usdVndRate());
}

function usdVndRate(): number | null {
  const rate = Number(env.SEPAY_USD_VND_RATE);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** USD × rate, rounded to the nearest 1,000 VND (bank transfers in VN rarely carry smaller units). */
export function usdToVnd(usd: number, rate: number): number {
  return Math.round((usd * rate) / 1000) * 1000;
}

/** Resolve a fixed SKU (memberships, toolkit) to its VND price; null when it is not sold via SePay. */
export function resolveStaticSku(sku: SepayStaticSku): SepayProduct | null {
  const rate = usdVndRate();
  if (!rate) return null;
  if (sku === "publishing_toolkit") {
    const usd = Number(env.SEPAY_PUBLISHING_TOOLKIT_USD);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return {
      kind: "publishing_toolkit",
      productRef: PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD,
      productName: "Publishing Studio Toolkit",
      periodMonths: null,
      amountVnd: usdToVnd(usd, rate),
    };
  }
  const plan = MEMBERSHIP_SKUS[sku];
  return {
    kind: "membership",
    productRef: plan.productRef,
    productName: plan.name,
    periodMonths: plan.months,
    amountVnd: usdToVnd(MEMBERSHIP_PRICES[plan.plan][plan.billing].amount, rate),
  };
}

/** A published course video priced in USD cents, converted to VND. */
export function resolveCourseVideo(video: { id: string; title: string; priceCents: number; currency: string }): SepayProduct | null {
  const rate = usdVndRate();
  if (!rate || video.currency.toLowerCase() !== "usd" || video.priceCents <= 0) return null;
  return {
    kind: "course_video",
    productRef: video.id,
    productName: video.title,
    periodMonths: null,
    amountVnd: usdToVnd(video.priceCents / 100, rate),
  };
}

/** VietQR image (rendered by SePay) that pre-fills account, amount and transfer content. */
export function sepayQrUrl(orderCode: string, amountVnd: number): string {
  const params = new URLSearchParams({
    acc: env.SEPAY_BANK_ACCOUNT ?? "",
    bank: env.SEPAY_BANK_CODE ?? "",
    amount: String(amountVnd),
    des: orderCode,
  });
  return `https://qr.sepay.vn/img?${params.toString()}`;
}

/** What the transfer page shows for an order: bank details, exact amount, content and QR. */
export function sepayOrderView(order: {
  orderCode: string;
  productName: string;
  productKind: SepayProductKind;
  amountVnd: number;
  status: string;
  validUntil: Date | null;
}) {
  return {
    orderCode: order.orderCode,
    productName: order.productName,
    productKind: order.productKind,
    amountVnd: order.amountVnd,
    bankCode: env.SEPAY_BANK_CODE ?? null,
    bankAccount: env.SEPAY_BANK_ACCOUNT ?? null,
    transferContent: order.orderCode,
    qrUrl: sepayQrUrl(order.orderCode, order.amountVnd),
    status: order.status,
    validUntil: order.validUntil?.toISOString() ?? null,
  };
}

export type SepayOrderView = ReturnType<typeof sepayOrderView>;
