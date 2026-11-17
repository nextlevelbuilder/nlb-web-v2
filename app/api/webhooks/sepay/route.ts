import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, type AppDb } from "@/lib/db";
import { env } from "@/lib/env";
import { sendDiscordSalesNotification } from "@/lib/discord";
import { claimDeliveryIntent, markDeliveryComplete } from "@/lib/domain/events";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/domain/webhook-event-lock";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { runDueJobs } from "@/lib/onboarding/runner";
import { fulfillSepayTransfer, parseSepayTransfer, verifySepayAuthorization, type SepayOrder } from "@/lib/payments/sepay-orders";

export const dynamic = "force-dynamic";

/**
 * SePay transaction webhook. Authenticated by `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`.
 * Each bank transaction id is claimed once through the shared webhook-event lease; any non-2xx
 * answer is logged; SePay itself retries only on network failures, so a failed delivery is recovered
 * by replaying it from the SePay dashboard. Transfers that match no order are acknowledged only.
 */
export async function POST(request: Request) {
  if (!verifySepayAuthorization(request.headers.get("authorization"), env.SEPAY_WEBHOOK_API_KEY)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }
  const transfer = parseSepayTransfer(body);
  // Bank Hub also posts account events (linked/unlinked) here; acknowledge them, nothing to match.
  if (!transfer) return NextResponse.json({ success: true, outcome: "ignored" });

  const db = getDb();
  const eventId = `sepay:${transfer.id}`;
  const claim = await claimWebhookEvent(db, { eventId, eventType: `sepay.transfer_${transfer.transferType}`, payload: body });
  if (claim === "duplicate") return NextResponse.json({ success: true, duplicate: true });
  if (claim === "locked") return NextResponse.json({ success: false, error: "event_locked" }, { status: 409 });

  try {
    const onboardingV2 = isOnboardingV2Enabled();
    const result = await fulfillSepayTransfer(db, transfer, { onboardingV2 });
    if (result.outcome === "amount_mismatch" || result.outcome === "already_paid") {
      console.warn(`SePay transfer ${transfer.id}: ${result.outcome} for order ${result.order?.orderCode}`);
    }
    await completeWebhookEvent(db, eventId);
    if (result.outcome === "paid" && result.order) {
      await notifyPaidOrder(db, result.order);
      if (onboardingV2 && result.order.productKind === "membership") scheduleJobRun(db);
    }
    return NextResponse.json({ success: true, outcome: result.outcome });
  } catch (error) {
    console.error("SePay webhook processing failed:", error);
    try {
      await failWebhookEvent(db, eventId, error instanceof Error ? error.message : "Unknown error");
    } catch {
      console.error("Recording the SePay webhook failure failed");
    }
    return NextResponse.json({ success: false, error: "processing_failed" }, { status: 500 });
  }
}

/** One Discord message per paid order, kept to one by a delivery intent keyed by the order code. */
async function notifyPaidOrder(db: AppDb, order: SepayOrder): Promise<void> {
  const webhookUrl = env.SEPAY_ORDERS_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  const key = `sepay_discord:${order.orderCode}`;
  if (!(await claimDeliveryIntent(key, "discord_sepay_orders", db))) return;
  const task = sendDiscordSalesNotification({
    productName: order.productName,
    amount: order.amountVnd,
    currency: "vnd",
    customerEmail: order.email,
    source: "SePay",
    reference: order.orderCode,
    paidAt: order.paidAt ?? new Date(),
    webhookUrl,
  })
    .then((sent) => markDeliveryComplete(key, "discord_sepay_orders", { sent }, db))
    .catch(() => console.error("SePay Discord notification bookkeeping failed (non-fatal)"));
  try {
    getCloudflareContext().ctx.waitUntil(task);
  } catch {
    await task;
  }
}

function scheduleJobRun(db: AppDb) {
  try {
    getCloudflareContext().ctx.waitUntil(
      runDueJobs(db, { limit: 5 }).catch(() => console.warn("onboarding job run after SePay webhook failed; the cron will retry"))
    );
  } catch {
    // No Worker context: the minute cron drains the queue.
  }
}
