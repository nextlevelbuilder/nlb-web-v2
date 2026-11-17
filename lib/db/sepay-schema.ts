import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export type SepayProductKind = "membership" | "publishing_toolkit" | "course_video";
/**
 * `pending`: waiting for the bank transfer. `paid`: an exact-amount transfer matched and access was
 * granted. `amount_mismatch`: a transfer carried the code with a different amount; nothing granted,
 * resolved by an operator.
 */
export type SepayOrderStatus = "pending" | "paid" | "amount_mismatch";

/**
 * Vietnamese bank-transfer orders paid through SePay. The buyer transfers `amount_vnd` with
 * `order_code` in the transfer content; the SePay webhook matches both and grants access.
 * A paid membership order is a prepaid, non-renewing grant valid from `valid_from` to `valid_until`.
 */
export const sepayOrders = sqliteTable(
  "sepay_orders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderCode: text("order_code").notNull().unique(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    productKind: text("product_kind").$type<SepayProductKind>().notNull(),
    /** Polar product id (membership, toolkit) or course video id. */
    productRef: text("product_ref").notNull(),
    productName: text("product_name").notNull(),
    periodMonths: integer("period_months"),
    amountVnd: integer("amount_vnd").notNull(),
    status: text("status").$type<SepayOrderStatus>().notNull().default("pending"),
    locale: text("locale"),
    sepayTransactionId: text("sepay_transaction_id").unique(),
    receivedAmountVnd: integer("received_amount_vnd"),
    validFrom: integer("valid_from", { mode: "timestamp_ms" }),
    validUntil: integer("valid_until", { mode: "timestamp_ms" }),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).$defaultFn(() => new Date()).notNull(),
  },
  (t) => [index("sepay_orders_user_status_idx").on(t.userId, t.status)]
);
