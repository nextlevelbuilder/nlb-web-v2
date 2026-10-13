import { NextResponse } from "next/server";
import { getDb, type AppDb } from "@/lib/db";
import { customers, subscriptions, orders, webhookEvents } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { sendWelcomeEmail } from "@/lib/resend";
import { sendForm01Email } from "@/lib/email-form01";
import { sendDiscordSalesNotification } from "@/lib/discord";
import { claimDeliveryIntent, markDeliveryComplete } from "@/lib/domain/events";
import { env } from "@/lib/env";
import {
  isOurProduct,
  isMembershipProduct,
  isDirectoryProduct,
  extractProductIdsFromEvent,
} from "@/lib/polar";
import { hasCourseVideoProduct, syncCourseVideoEntitlementFromOrder } from "@/lib/courses/course-webhook-entitlements";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import crypto from "crypto";

interface PolarWebhookPayload {
  id?: string;
  type: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
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

  // 1. Verify webhook signature using Polar SDK
  try {
    const headers = {
      "webhook-id": webhookId,
      "webhook-timestamp": request.headers.get("webhook-timestamp") || "",
      "webhook-signature": request.headers.get("webhook-signature") || "",
    };

    validateEvent(body, headers, env.POLAR_WEBHOOK_SECRET);
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
    // Course video products are created at publish time, so they are matched in D1, not the allowlist.
    const hasOurProducts =
      productIds.length > 0 &&
      (productIds.some(isOurProduct) || (await hasCourseVideoProduct(productIds, db)));

    if (!hasOurProducts) {
      console.log(
        `Skipping webhook event ${event.type} - ${productIds.length} product(s) not ours`
      );
      return NextResponse.json({ received: true, skipped: true });
    }

    // 3. Claim webhook event atomically in database
    let claimedEvent = null;
    try {
      const [inserted] = await db
        .insert(webhookEvents)
        .values({
          eventId,
          eventType: event.type,
          payload: event,
          processed: false,
        })
        .onConflictDoNothing({ target: webhookEvents.eventId })
        .returning();
      claimedEvent = inserted;
    } catch (error) {
      console.error("Error claiming webhook event:", error);
    }

    // If not claimed on initial insert, inspect existing event state
    if (!claimedEvent) {
      const [existingEvent] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.eventId, eventId))
        .limit(1);

      if (existingEvent?.processed) {
        console.log(
          `Webhook event ${eventId} already processed, skipping duplicate`
        );
        return NextResponse.json({ received: true, duplicate: true });
      }

      // Atomic stale lock reclaim: if claim is older than 5 minutes, attempt to reclaim atomically
      const [reclaimed] = await db
        .update(webhookEvents)
        .set({ processedAt: new Date() })
        .where(
          and(
            eq(webhookEvents.eventId, eventId),
            eq(webhookEvents.processed, false),
            lt(webhookEvents.createdAt, new Date(Date.now() - 5 * 60 * 1000))
          )
        )
        .returning();

      if (!reclaimed && !existingEvent?.error) {
        // Event is currently actively being processed by another worker -> return 500 so Polar retries
        console.log(
          `Webhook event ${eventId} currently locked by active in-flight worker`
        );
        return NextResponse.json(
          { error: "event_locked" },
          { status: 500 }
        );
      }
    }

    // 4. Execute domain event handler
    try {
      switch (event.type) {
        case "checkout.updated":
          await handleCheckoutUpdated(event, eventId, db);
          break;
        case "subscription.created":
          await handleSubscriptionCreated(event, eventId, db);
          break;
        case "subscription.updated":
          await handleSubscriptionUpdated(event, db);
          break;
        case "order.created":
        case "order.paid":
        case "order.updated":
          await handleOrderCreated(event, eventId, db);
          await syncCourseVideoEntitlementFromOrder(event, db);
          break;
        case "order.refunded":
          await syncCourseVideoEntitlementFromOrder(event, db);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Mark event as processed
      await db
        .update(webhookEvents)
        .set({ processed: true, processedAt: new Date(), error: null })
        .where(eq(webhookEvents.eventId, eventId));

      return NextResponse.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);

      // Log error to DB
      try {
        await db
          .update(webhookEvents)
          .set({
            error: error instanceof Error ? error.message : "Unknown error",
            processedAt: new Date(),
          })
          .where(eq(webhookEvents.eventId, eventId));
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
      discordInvite: env.DISCORD_INVITE_URL || "https://discord.gg/nextlevelbuilder",
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
  await ensureCustomer(
    {
      email: customerEmail,
      name: customerName,
      polarCustomerId: checkout.customer_id,
    },
    db
  );
}

async function handleSubscriptionCreated(event: PolarWebhookPayload, eventId: string, db: AppDb) {
  const subscription = event.data;
  if (!subscription) return;

  const polarCustomerId =
    subscription.customer_id || subscription.customer?.id;
  const customerEmail =
    subscription.customer?.email || subscription.customer_email;
  const customerName =
    subscription.customer?.name || subscription.customer_name;

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
    console.error("Customer not found for subscription:", subscription.id);
    return;
  }

  await db
    .insert(subscriptions)
    .values({
      customerId: customer.id,
      polarSubscriptionId: subscription.id || `sub_${crypto.randomUUID()}`,
      polarProductId: subscription.product_id || subscription.product?.id || "",
      productName: subscription.product?.name || "Premium Access",
      status: subscription.status || "active",
      currentPeriodStart: subscription.current_period_start
        ? new Date(subscription.current_period_start)
        : null,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    })
    .onConflictDoUpdate({
      target: subscriptions.polarSubscriptionId,
      set: {
        status: subscription.status || "active",
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start)
          : undefined,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end)
          : undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        updatedAt: new Date(),
      },
    });

  const productId = subscription.product_id || subscription.product?.id || "";
  if (subscription.status === "active" && isMembershipProduct(productId) && subscription.id) {
    await sendOnboardingEmails({
      email: customer.email,
      name: customer.name,
      subscriptionId: subscription.id,
      db,
    });
  }
}

async function handleSubscriptionUpdated(event: PolarWebhookPayload, db: AppDb) {
  const subscription = event.data;
  if (!subscription || !subscription.id) return;

  await db
    .update(subscriptions)
    .set({
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start
        ? new Date(subscription.current_period_start)
        : null,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.polarSubscriptionId, subscription.id));
}

async function handleOrderCreated(event: PolarWebhookPayload, eventId: string, db: AppDb) {
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
        status: orderStatus,
        productSlug: productSlug || undefined,
        paidAt: isPaid ? new Date() : undefined,
      },
    });
  if (!wasAlreadyPaid && isPaid) {
    const salesKey = `sales_discord:${order.id}`;
    const discordClaimed = await claimDeliveryIntent(salesKey, "discord_sales", db);
    if (discordClaimed) {
      try {
        const orderProductId = order.product_id || order.product?.id || "";
        const fallbackName = isDirectoryProduct(orderProductId)
          ? "Directory Listing Submission"
          : "Premium Community Access";
        await sendDiscordSalesNotification({
          customerName: customer.name || customer.email.split("@")[0],
          customerEmail: customer.email,
          productName: order.product?.name || fallbackName,
          amount: orderAmount,
          currency: order.currency || "usd",
          orderId: order.id,
        });
        await markDeliveryComplete(salesKey, "discord_sales", { sent: true }, db);
      } catch (error) {
        console.error(
          "Failed to send Discord sales notification (non-fatal):",
          error
        );
      }
    }
  }
}
