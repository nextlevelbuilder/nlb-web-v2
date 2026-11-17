import crypto from "crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers, entitlements, orders, sepayOrders } from "@/lib/db/schema";
import type { SepayOrderStatus } from "@/lib/db/sepay-schema";
import { videoFeatureKey } from "@/lib/courses/course-video-access";
import { tierForProductId } from "@/lib/membership/tiers";
import type { MembershipSubscriptionState } from "@/lib/membership/effective-tier";
import { enqueueAccessReconcile, enqueueJob } from "@/lib/onboarding/jobs";
import type { SepayProduct } from "./sepay-catalog";

export type SepayOrder = typeof sepayOrders.$inferSelect;

/** Prefix SePay's payment-code detection is configured with; the full code is `NLB` + 10 chars. */
export const SEPAY_ORDER_CODE_PREFIX = "NLB";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = new RegExp(`${SEPAY_ORDER_CODE_PREFIX}[${CODE_ALPHABET}]{10}`, "i");

export function generateOrderCode(): string {
  const bytes = crypto.randomBytes(10);
  let suffix = "";
  for (const byte of bytes) suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${SEPAY_ORDER_CODE_PREFIX}${suffix}`;
}

/** Find our order code in SePay's detected `code` or, failing that, the raw transfer content. */
export function extractOrderCode(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    const match = text?.replace(/[\s.-]/g, "").match(CODE_PATTERN);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

/** Constant-time check of `Authorization: Apikey <key>` against the configured key. */
export function verifySepayAuthorization(header: string | null, apiKey: string | undefined): boolean {
  if (!apiKey || !header) return false;
  const match = header.match(/^Apikey\s+(.+)$/i);
  if (!match) return false;
  const given = Buffer.from(match[1].trim());
  const expected = Buffer.from(apiKey);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** The fields we use from a SePay transaction webhook. */
export interface SepayTransfer {
  id: number | string;
  transferType: string;
  transferAmount: number;
  code?: string | null;
  content?: string | null;
  description?: string | null;
  referenceCode?: string | null;
}

/**
 * Normalise both SePay payload shapes: the account webhook (`id`, `transferType` in/out,
 * `transferAmount`, `code`) and the Bank Hub IPN (`transaction_id`, `transfer_type` credit/debit,
 * `amount`, `payment_code`). Bank Hub account events (no transaction) return null.
 */
export function parseSepayTransfer(body: unknown): SepayTransfer | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  const bankHub = data.transaction_id !== undefined || data.transfer_type !== undefined;
  const id = bankHub ? data.transaction_id : data.id;
  const rawType = bankHub ? data.transfer_type : data.transferType;
  const amount = Number(bankHub ? data.amount : data.transferAmount);
  if ((typeof id !== "number" && typeof id !== "string") || String(id) === "") return null;
  if (typeof rawType !== "string" || !Number.isFinite(amount)) return null;
  const transferType = rawType === "credit" ? "in" : rawType === "debit" ? "out" : rawType;
  return {
    id,
    transferType,
    transferAmount: amount,
    code: str(bankHub ? data.payment_code : data.code),
    content: str(data.content),
    description: str(data.description),
    referenceCode: str(bankHub ? data.reference_code : data.referenceCode),
  };
}

export async function createSepayOrder(
  db: AppDb,
  input: { userId: string; email: string; product: SepayProduct; locale: string | null }
): Promise<SepayOrder> {
  const [order] = await db
    .insert(sepayOrders)
    .values({
      orderCode: generateOrderCode(),
      userId: input.userId,
      email: input.email.trim().toLowerCase(),
      productKind: input.product.kind,
      productRef: input.product.productRef,
      productName: input.product.productName,
      periodMonths: input.product.periodMonths,
      amountVnd: input.product.amountVnd,
      locale: input.locale,
    })
    .returning();
  return order;
}

export async function getSepayOrder(db: AppDb, orderCode: string): Promise<SepayOrder | null> {
  const [order] = await db.select().from(sepayOrders).where(eq(sepayOrders.orderCode, orderCode.toUpperCase())).limit(1);
  return order ?? null;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Paid, still-valid SePay memberships of a user, in the shape the tier resolver reads. */
export async function getSepayMembershipStates(db: AppDb, userId: string, now: Date = new Date()): Promise<MembershipSubscriptionState[]> {
  const rows = await db
    .select({ productRef: sepayOrders.productRef, validUntil: sepayOrders.validUntil })
    .from(sepayOrders)
    .where(
      and(
        eq(sepayOrders.userId, userId),
        eq(sepayOrders.productKind, "membership"),
        eq(sepayOrders.status, "paid"),
        gt(sepayOrders.validUntil, now)
      )
    );
  // Stacked periods start where the previous same-tier period ends, so every unexpired row counts.
  return rows.map((row) => ({
    tier: tierForProductId(row.productRef),
    status: "active",
    currentPeriodEnd: row.validUntil,
    cancelAtPeriodEnd: true,
    pastDueSince: null,
    endedAt: null,
  }));
}

/** When a new prepaid membership starts: now, or the end of the user's latest same-tier SePay period. */
async function membershipPeriodStart(db: AppDb, order: SepayOrder, now: Date): Promise<Date> {
  const tier = tierForProductId(order.productRef);
  const rows = await db
    .select({ productRef: sepayOrders.productRef, validUntil: sepayOrders.validUntil })
    .from(sepayOrders)
    .where(
      and(
        eq(sepayOrders.userId, order.userId),
        eq(sepayOrders.productKind, "membership"),
        eq(sepayOrders.status, "paid"),
        gt(sepayOrders.validUntil, now)
      )
    )
    .orderBy(desc(sepayOrders.validUntil));
  const latest = rows.find((row) => tierForProductId(row.productRef) === tier);
  return latest?.validUntil ?? now;
}

export type SepayFulfillOutcome = "paid" | "ignored" | "no_order" | "already_paid" | "amount_mismatch";

export interface SepayFulfillResult {
  outcome: SepayFulfillOutcome;
  order?: SepayOrder;
  /** True only on the delivery that moved the order to `paid` (drives one-time notifications). */
  newlyPaid?: boolean;
}

/**
 * Match an incoming transfer to an order and grant access. Exact amount only: any other amount marks
 * the order `amount_mismatch` and grants nothing. The order is marked paid first and the grants run
 * after; every grant is idempotent, so a retry of the same transaction re-runs them safely.
 */
export async function fulfillSepayTransfer(
  db: AppDb,
  transfer: SepayTransfer,
  options: { onboardingV2: boolean },
  now: Date = new Date()
): Promise<SepayFulfillResult> {
  if (transfer.transferType !== "in") return { outcome: "ignored" };
  const code = extractOrderCode(transfer.code, transfer.content, transfer.description);
  if (!code) return { outcome: "no_order" };
  const order = await getSepayOrder(db, code);
  if (!order) return { outcome: "no_order" };
  const transactionId = String(transfer.id);

  if (order.status === "paid") {
    if (order.sepayTransactionId !== transactionId) return { outcome: "already_paid", order };
    await grantAccess(db, order, options);
    return { outcome: "paid", order, newlyPaid: false };
  }

  if (Math.round(transfer.transferAmount) !== order.amountVnd) {
    await db
      .update(sepayOrders)
      .set({ status: "amount_mismatch" satisfies SepayOrderStatus, receivedAmountVnd: Math.round(transfer.transferAmount), updatedAt: now })
      .where(and(eq(sepayOrders.id, order.id), sql`${sepayOrders.status} <> 'paid'`));
    return { outcome: "amount_mismatch", order };
  }

  let validFrom: Date | null = null;
  let validUntil: Date | null = null;
  if (order.productKind === "membership" && order.periodMonths) {
    validFrom = await membershipPeriodStart(db, order, now);
    validUntil = addMonths(validFrom, order.periodMonths);
  }

  const updated = await db
    .update(sepayOrders)
    .set({
      status: "paid" satisfies SepayOrderStatus,
      sepayTransactionId: transactionId,
      receivedAmountVnd: order.amountVnd,
      validFrom,
      validUntil,
      paidAt: now,
      updatedAt: now,
    })
    .where(and(eq(sepayOrders.id, order.id), sql`${sepayOrders.status} <> 'paid'`))
    .run();
  const paidOrder = (await getSepayOrder(db, code))!;
  if (updated.meta.changes !== 1) {
    // A concurrent delivery paid it first.
    if (paidOrder.sepayTransactionId !== transactionId) return { outcome: "already_paid", order: paidOrder };
    await grantAccess(db, paidOrder, options);
    return { outcome: "paid", order: paidOrder, newlyPaid: false };
  }

  await grantAccess(db, paidOrder, options);
  return { outcome: "paid", order: paidOrder, newlyPaid: true };
}

/** Local customer for the buyer's email, linked to the buyer when it is not linked yet. */
async function ensureSepayCustomer(db: AppDb, order: SepayOrder): Promise<string> {
  await db.insert(customers).values({ email: order.email, userId: order.userId }).onConflictDoNothing({ target: customers.email });
  const [customer] = await db
    .select({ id: customers.id, userId: customers.userId })
    .from(customers)
    .where(eq(customers.email, order.email))
    .limit(1);
  if (!customer.userId) {
    await db.update(customers).set({ userId: order.userId, updatedAt: new Date() }).where(eq(customers.id, customer.id));
  }
  return customer.id;
}

/** Order id used in the shared `orders` table, so account pages and access fallbacks see the purchase. */
export function sepayLedgerOrderId(orderCode: string): string {
  return `sepay_${orderCode}`;
}

async function grantAccess(db: AppDb, order: SepayOrder, options: { onboardingV2: boolean }): Promise<void> {
  const customerId = await ensureSepayCustomer(db, order);
  await db
    .insert(orders)
    .values({
      customerId,
      polarOrderId: sepayLedgerOrderId(order.orderCode),
      polarProductId: order.productKind === "course_video" ? `sepay_course_video:${order.productRef}` : order.productRef,
      productName: order.productName,
      amount: String(order.amountVnd),
      currency: "vnd",
      status: "paid",
      paidAt: order.paidAt ?? new Date(),
    })
    .onConflictDoNothing({ target: orders.polarOrderId });

  if (order.productKind === "course_video") {
    await db
      .insert(entitlements)
      .values({ userId: order.userId, featureKey: videoFeatureKey(order.productRef), isActive: true })
      .onConflictDoUpdate({
        target: [entitlements.userId, entitlements.featureKey],
        set: { isActive: true, validUntil: null },
      });
    return;
  }

  if (order.productKind === "membership" && options.onboardingV2) {
    await enqueueAccessReconcile(db, order.userId);
    await enqueueJob(db, {
      kind: "welcome_email",
      dedupeKey: `welcome_email:sepay:${order.orderCode}`,
      payload: { customerId, subscriptionId: sepayLedgerOrderId(order.orderCode), locale: order.locale },
      onlyOnce: true,
    });
    await enqueueJob(db, {
      kind: "admin_notify",
      dedupeKey: `admin_notify:new_membership:sepay:${order.orderCode}`,
      payload: { event: "new_membership", ref: sepayLedgerOrderId(order.orderCode) },
      onlyOnce: true,
    });
  }
}
