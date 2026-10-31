import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, type AppDb } from "@/lib/db";
import { customers, subscriptions, orders } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendWelcomeEmail } from "@/lib/resend";
import { sendForm01Email } from "@/lib/email-form01";
import { sendDiscordSalesNotification } from "@/lib/discord";
import { claimDeliveryIntent, markDeliveryComplete } from "@/lib/domain/events";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/domain/webhook-event-lock";
import { env } from "@/lib/env";
import { resolveDiscordInvite } from "@/lib/constants/socials";
import {
  isOurProduct,
  isMembershipProduct,
  isDirectoryProduct,
  extractProductIdsFromEvent,
  MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS,
} from "@/lib/polar";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { enqueueAccessReconcile, enqueueJob } from "@/lib/onboarding/jobs";
import { runDueJobs } from "@/lib/onboarding/runner";
import { linkCustomerFromPurchase, type PurchaseRefs } from "@/lib/membership/member-access";
import { applySubscriptionSnapshot, markSubscriptionRefunded } from "@/lib/membership/subscription-sync";
import { hasCourseVideoProduct, syncCourseVideoEntitlementFromOrder } from "@/lib/courses/course-webhook-entitlements";
import { hasLiveTicketProduct, syncLiveTicketFromOrder } from "@/lib/live/live-webhook-tickets";
import { recordPaidShareConversion } from "@/lib/builder-league/attribution";
import { WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { verifyPolarWebhook } from "@/lib/polar-webhook-signature";
import crypto from "crypto";

interface PolarWebhookPayload {
  id?: string;
  type: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    subscription_id?: string | null;
    customer_email?: string;
    customer_name?: string;
    billing_name?: string;
    product_id?: string;
    product_name?: string;
    amount?: number;
    total_amount?: number;
    currency?: string;
    paid?: boolean;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
    ended_at?: string | null;
    started_at?: string | null;
    created_at?: string | null;
    modified_at?: string | null;
    billing_reason?: string | null;
    customer?: {
      id?: string;
      email?: string;
      name?: string;
    };
    product?: {
      id?: string;
      name?: string;
    };
    metadata?: Record<string, unknown>;
  };
}

export async function POST(request: Request) {
  const body = await request.text();
  const webhookId = request.headers.get("webhook-id") || "";

  // 1. Verify the webhook signature (legacy Polar or Standard Webhooks secret)
  try {
    const headers = {
      "webhook-id": webhookId,
      "webhook-timestamp": request.headers.get("webhook-timestamp") || "",
      "webhook-signature": request.headers.get("webhook-signature") || "",
    };

    verifyPolarWebhook(body, headers, env.POLAR_WEBHOOK_SECRET);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }
    console.error("Webhook validation error:", error);
    return NextResponse.json(
      { error: "Webhook validation failed" },
      { status: 401 }
    );
  }

  // 2. Process verified webhook payload
  const db = getDb();
  try {
    const event = JSON.parse(body) as PolarWebhookPayload;
    const eventId = webhookId || event.id || crypto.randomUUID();
    const productIds = extractProductIdsFromEvent(event);
    // Course video and Live ticket products are created at runtime, so they are matched in D1, not the allowlist.
    const hasOurProducts =
      productIds.length > 0 &&
      (productIds.some(isOurProduct) ||
        (await hasCourseVideoProduct(productIds, db)) ||
        (await hasLiveTicketProduct(productIds, db)));

    if (!hasOurProducts) {
      console.log(
        `Skipping webhook event ${event.type} - ${productIds.length} product(s) not ours`
      );
      return NextResponse.json({ received: true, skipped: true });
    }

    // 3. Claim the event with a processing lease (atomic insert, or conditional reclaim).
    const claim = await claimWebhookEvent(db, { eventId, eventType: event.type, payload: event });
    if (claim === "duplicate") {
      console.log(`Webhook event ${eventId} already processed, skipping duplicate`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim === "locked") {
      // Another delivery holds an unexpired lease -> 500 so Polar retries later.
      console.log(`Webhook event ${eventId} currently locked by active in-flight worker`);
      return NextResponse.json({ error: "event_locked" }, { status: 500 });
    }

    // 4. Execute domain event handler. Provider work (community access, onboarding email) is only
    // queued here; the job runner does it after the durable writes, never inline.
    const effects: WebhookEffects = { onboardingV2: isOnboardingV2Enabled(), jobsEnqueued: false };
    try {
      switch (event.type) {
        case "checkout.updated":
          await handleCheckoutUpdated(event, eventId, db);
          break;
        case "subscription.created":
        case "subscription.updated":
        case "subscription.active":
        case "subscription.canceled":
        case "subscription.uncanceled":
        case "subscription.revoked":
        case "subscription.past_due":
          await handleSubscriptionEvent(event, db, effects);
          break;
        case "order.created":
        case "order.paid":
        case "order.updated":
          await handleOrderCreated(event, eventId, db, effects);
          await syncCourseVideoEntitlementFromOrder(event, db);
          await syncLiveTicketFromOrder(event, db);
          break;
        case "order.refunded":
          await handleOrderRefunded(event, db, effects);
          await syncCourseVideoEntitlementFromOrder(event, db);
          await syncLiveTicketFromOrder(event, db);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      await completeWebhookEvent(db, eventId);
      if (effects.jobsEnqueued) scheduleJobRun(db);

      return NextResponse.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);

      // Log error to DB
      try {
        await failWebhookEvent(db, eventId, error instanceof Error ? error.message : "Unknown error");
      } catch (dbError) {
        console.error("Error logging webhook error to DB:", dbError);
      }

      return NextResponse.json(
        { error: "processing_failed" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Webhook top-level error:", error);
    return NextResponse.json(
      { error: "internal" },
      { status: 500 }
    );
  }
}

async function ensureCustomer(
  {
    email,
    name,
    polarCustomerId,
  }: {
    email: string;
    name?: string | null;
    polarCustomerId?: string | null;
  },
  db: AppDb
) {
  if (!email) {
    return null;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const customerName = name || normalizedEmail.split("@")[0];

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, normalizedEmail))
    .limit(1);

  if (!customer) {
    const [newCustomer] = await db
      .insert(customers)
      .values({
        email: normalizedEmail,
        name: customerName,
        polarCustomerId: polarCustomerId || null,
      })
      .onConflictDoUpdate({
        target: customers.email,
        set: {
          name: customerName,
          polarCustomerId: polarCustomerId || undefined,
          updatedAt: new Date(),
        },
      })
      .returning();
    return newCustomer;
  }

  if (polarCustomerId && !customer.polarCustomerId) {
    await db
      .update(customers)
      .set({ polarCustomerId, updatedAt: new Date() })
      .where(eq(customers.id, customer.id));
    customer.polarCustomerId = polarCustomerId;
  }

  return customer;
}

async function sendOnboardingEmails({
  email,
  name,
  subscriptionId,
  db,
}: {
  email: string;
  name?: string | null;
  subscriptionId: string;
  db: AppDb;
}) {
  const customerName = name || email.split("@")[0] || "Builder";
  const welcomeKey = `sub_onboard:${subscriptionId}`;

  // Guard welcome email delivery with idempotent intent
  const welcomeClaimed = await claimDeliveryIntent(welcomeKey, "resend_welcome", db);
  if (welcomeClaimed) {
    const welcomeRes = await sendWelcomeEmail({
      email,
      name: customerName,
      discordInvite: resolveDiscordInvite(env.DISCORD_INVITE_URL),
      idempotencyKey: `nlb-welcome-${subscriptionId}`,
    });
    if (!welcomeRes.success) {
      console.error("sendWelcomeEmail failed:", welcomeRes.error);
      throw new Error(`sendWelcomeEmail failed: ${JSON.stringify(welcomeRes.error)}`);
    }
    await markDeliveryComplete(welcomeKey, "resend_welcome", { data: welcomeRes.data }, db);
  }

  // Guard Form01 email delivery with idempotent intent
  const formClaimed = await claimDeliveryIntent(welcomeKey, "resend_form01", db);
  if (formClaimed) {
    const formRes = await sendForm01Email({
      email,
      name: customerName,
      idempotencyKey: `nlb-form01-${subscriptionId}`,
    });
    if (!formRes.success) {
      console.error("sendForm01Email failed:", formRes.error);
      throw new Error(`sendForm01Email failed: ${JSON.stringify(formRes.error)}`);
    }
    await markDeliveryComplete(welcomeKey, "resend_form01", { data: formRes.data }, db);
  }
}

interface WebhookEffects {
  /** `ONBOARDING_V2_ENABLED` at the time of delivery. Off keeps the legacy email flow unchanged. */
  onboardingV2: boolean;
  jobsEnqueued: boolean;
}

/** A purchase this recent counts as new for the onboarding welcome; older ones are renewals or existing members. */
const NEW_MEMBERSHIP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function metadataString(data: PolarWebhookPayload["data"], key: string): string | null {
  const value = data?.metadata?.[key];
  return typeof value === "string" && value ? value : null;
}

/** Drain queued onboarding jobs after the response, when the Worker context is available. */
function scheduleJobRun(db: AppDb) {
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(
      runDueJobs(db, { limit: 5 }).catch(() => {
        console.warn("onboarding job run after webhook failed; the cron will retry");
      })
    );
  } catch {
    // No Worker context (local Node, tests): the minute cron drains the queue.
  }
}

/** Continue a best-effort task through `waitUntil`; without a Worker context (tests) finish it inline. */
async function runAfterResponse(task: Promise<unknown>): Promise<void> {
  try {
    getCloudflareContext().ctx.waitUntil(task);
    return;
  } catch {
    // No Worker request context.
  }
  await task;
}

/**
 * Link the Polar customer to an NLB user from server-trusted signals only (see
 * `linkCustomerFromPurchase`): `metadata.nlb_user_id` (set server-side by /api/checkout for a
 * signed-in buyer and copied by Polar onto the checkout, subscription and order) when the customer
 * is new to us or its email is that user's verified email, else a user whose verified email equals
 * the customer email (trim + lowercase only). Polar's external customer id is not used: existing
 * customers may carry none or one set elsewhere. Never overwrites an existing link. Returns the
 * linked user id.
 */
async function linkCustomerFromEvent(
  customer: { id: string; email: string; userId?: string | null },
  data: PolarWebhookPayload["data"],
  refs: PurchaseRefs,
  db: AppDb
): Promise<string | null> {
  return linkCustomerFromPurchase(db, customer, { metadataUserId: metadataString(data, "nlb_user_id"), refs });
}

async function handleCheckoutUpdated(event: PolarWebhookPayload, eventId: string, db: AppDb) {
  const checkout = event.data;
  if (!checkout || checkout.status !== "succeeded") {
    return;
  }

  const customerEmail = checkout.customer_email;
  const customerName = checkout.customer_name || customerEmail?.split("@")[0];

  if (!customerEmail) {
    console.error("No customer email in checkout");
    return;
  }

  // Synchronize customer identity; never dispatch onboarding emails from checkout events
  const customer = await ensureCustomer(
    {
      email: customerEmail,
      name: customerName,
      polarCustomerId: checkout.customer_id,
    },
    db
  );
  if (customer) {
    await linkCustomerFromEvent(customer, checkout, { polarSubscriptionIds: [checkout.subscription_id] }, db);
  }
}

async function resolveEventCustomer(data: NonNullable<PolarWebhookPayload["data"]>, db: AppDb) {
  const polarCustomerId = data.customer_id || data.customer?.id;
  const customerEmail = data.customer?.email || data.customer_email;
  const customerName = data.customer?.name || data.customer_name;
  if (customerEmail) {
    return ensureCustomer({ email: customerEmail, name: customerName, polarCustomerId }, db);
  }
  if (polarCustomerId) {
    const [c] = await db.select().from(customers).where(eq(customers.polarCustomerId, polarCustomerId)).limit(1);
    return c ?? null;
  }
  return null;
}

/**
 * Every `subscription.*` event carries the full subscription, so all of them persist the same way
 * through `applySubscriptionSnapshot`, whose ordering rule keeps an older delivery from overwriting
 * newer state. Legacy flag-off behaviour is kept: only `subscription.created` for an active
 * membership sends the welcome and Form 01 emails, inline.
 */
async function handleSubscriptionEvent(event: PolarWebhookPayload, db: AppDb, effects: WebhookEffects) {
  const subscription = event.data;
  if (!subscription || !subscription.id) return;

  const customer = await resolveEventCustomer(subscription, db);
  if (!customer) {
    console.error("Customer not found for subscription:", subscription.id);
    return;
  }

  const productId = subscription.product_id || subscription.product?.id || "";
  await applySubscriptionSnapshot(db, {
    polarSubscriptionId: subscription.id,
    customerId: customer.id,
    productId,
    productName: subscription.product?.name ?? null,
    status: subscription.status || "active",
    currentPeriodStart: parseDate(subscription.current_period_start),
    currentPeriodEnd: parseDate(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    endedAt: parseDate(subscription.ended_at),
    modifiedAt: parseDate(subscription.modified_at) ?? parseDate(subscription.created_at),
  });

  const userId = await linkCustomerFromEvent(customer, subscription, { polarSubscriptionIds: [subscription.id] }, db);
  // Builder League share attribution: no-op without a signup attribution or an effective tier.
  if (userId && MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS.has(productId)) await recordPaidShareConversion(db, userId);

  if (!effects.onboardingV2) {
    if (event.type === "subscription.created" && subscription.status === "active" && isMembershipProduct(productId)) {
      await sendOnboardingEmails({
        email: customer.email,
        name: customer.name,
        subscriptionId: subscription.id,
        db,
      });
    }
    return;
  }

  if (!MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS.has(productId)) return;

  if (userId) {
    await enqueueAccessReconcile(db, userId);
    effects.jobsEnqueued = true;
  }

  // New purchases only: renewals and members who bought long ago never get a welcome email.
  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const startedAt = parseDate(subscription.started_at) ?? parseDate(subscription.created_at);
  const isNewPurchase = !startedAt || Date.now() - startedAt.getTime() < NEW_MEMBERSHIP_WINDOW_MS;
  if (
    isActive &&
    isNewPurchase &&
    (event.type === "subscription.created" || event.type === "subscription.active") &&
    isMembershipProduct(productId)
  ) {
    await enqueueJob(db, {
      kind: "welcome_email",
      dedupeKey: `welcome_email:${subscription.id}`,
      payload: { customerId: customer.id, subscriptionId: subscription.id, locale: metadataString(subscription, "nlb_locale") },
      onlyOnce: true,
    });
    await enqueueJob(db, {
      kind: "admin_notify",
      dedupeKey: `admin_notify:new_membership:${subscription.id}`,
      payload: { event: "new_membership", ref: subscription.id },
      onlyOnce: true,
    });
    effects.jobsEnqueued = true;
  }
}

/**
 * Persist refunds. A full refund of the membership order that paid for the subscription's current
 * period ends that subscription for entitlement (see `markSubscriptionRefunded`). Partial refunds,
 * refunds of an earlier period's order and refunds of a mid-period plan-change charge keep access.
 */
async function handleOrderRefunded(event: PolarWebhookPayload, db: AppDb, effects: WebhookEffects) {
  const order = event.data;
  if (!order || !order.id || !order.status) return;

  await db.update(orders).set({ status: order.status }).where(eq(orders.polarOrderId, order.id));

  const productId = order.product_id || order.product?.id || "";
  if (order.status !== "refunded" || !order.subscription_id || !MEMBERSHIP_ENTITLEMENT_PRODUCT_IDS.has(productId)) return;

  if (order.billing_reason === "subscription_update") return;
  const orderCreatedAt = parseDate(order.created_at);
  if (!orderCreatedAt) {
    console.warn(`order.refunded ${order.id} has no created_at; subscription access left unchanged`);
    return;
  }
  const refundedAt = parseDate(order.modified_at) ?? new Date();
  const subscription = await markSubscriptionRefunded(db, order.subscription_id, { refundedAt, orderCreatedAt });
  if (!subscription || !effects.onboardingV2) return;

  const [customer] = await db
    .select({ userId: customers.userId })
    .from(customers)
    .where(eq(customers.id, subscription.customerId))
    .limit(1);
  if (customer?.userId) {
    await enqueueAccessReconcile(db, customer.userId);
    effects.jobsEnqueued = true;
  }
}

async function handleOrderCreated(event: PolarWebhookPayload, eventId: string, db: AppDb, effects: WebhookEffects) {
  const order = event.data;
  if (!order || !order.id) return;

  const customerEmail = order.customer?.email || order.customer_email;
  const customerName =
    order.customer?.name || order.customer_name || order.billing_name;
  const polarCustomerId = order.customer_id || order.customer?.id;

  let customer = null;
  if (customerEmail) {
    customer = await ensureCustomer(
      {
        email: customerEmail,
        name: customerName,
        polarCustomerId,
      },
      db
    );
  } else if (polarCustomerId) {
    const [c] = await db
      .select()
      .from(customers)
      .where(eq(customers.polarCustomerId, polarCustomerId))
      .limit(1);
    customer = c;
  }

  if (!customer) {
    console.error("Could not find or create customer for order:", order.id);
    return;
  }

  // An order can be the first delivery carrying the buyer's `nlb_user_id`; a new link changes access.
  const wasLinked = Boolean(customer.userId);
  const linkedUserId = await linkCustomerFromEvent(
    customer,
    order,
    { polarSubscriptionIds: [order.subscription_id], polarOrderIds: [order.id] },
    db
  );
  if (linkedUserId && !wasLinked && effects.onboardingV2) {
    await enqueueAccessReconcile(db, linkedUserId);
    effects.jobsEnqueued = true;
  }

  const isPaid =
    order.paid === true ||
    order.status === "paid" ||
    event.type === "order.paid";
  const orderAmount = order.total_amount ?? order.amount ?? 0;
  const orderStatus = order.status || (isPaid ? "paid" : "pending");

  const productSlug = (order as any).metadata?.productSlug || (order as any).custom_field?.productSlug || null;

  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.polarOrderId, order.id))
    .limit(1);

  const wasAlreadyPaid =
    !!existingOrder &&
    (existingOrder.status === "paid" || !!existingOrder.paidAt);

  await db
    .insert(orders)
    .values({
      customerId: customer.id,
      polarOrderId: order.id,
      polarProductId: order.product_id || order.product?.id || "",
      productName: order.product?.name || "Product Order",
      productSlug,
      amount: orderAmount.toString(),
      currency: order.currency || "usd",
      status: orderStatus,
      paidAt: isPaid ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: orders.polarOrderId,
      set: {
        // Refunds are terminal: a late or retried paid/updated event must not resurrect a refunded order.
        status: sql`case when ${orders.status} in ('refunded', 'partially_refunded') and excluded.status not in ('refunded', 'partially_refunded') then ${orders.status} else excluded.status end`,
        productSlug: productSlug || undefined,
        paidAt: isPaid ? new Date() : undefined,
      },
    });
  if (!wasAlreadyPaid && isPaid) {
    // One notification per paid order: the delivery intent survives Polar retries and the
    // order.created/order.paid pair. Sent off the response path so Discord never fails the webhook.
    const salesKey = `sales_discord:${order.id}`;
    if (await claimDeliveryIntent(salesKey, "discord_sales", db)) {
      const orderProductId = order.product_id || order.product?.id || "";
      const fallbackName = isDirectoryProduct(orderProductId)
        ? "Directory Listing Submission"
        : "Premium Community Access";
      await runAfterResponse(
        sendDiscordSalesNotification({
          productName: order.product?.name || fallbackName,
          amount: orderAmount,
          currency: order.currency || "usd",
          customerEmail: customer.email,
          source: "Polar",
        })
          .then((sent) => markDeliveryComplete(salesKey, "discord_sales", { sent }, db))
          .catch(() => console.error("Discord sales notification bookkeeping failed (non-fatal)"))
      );
    }
  }
}
