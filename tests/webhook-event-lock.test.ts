import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent, WEBHOOK_LOCK_LEASE_MS } from "@/lib/domain/webhook-event-lock";

let seq = 0;
const nextEvent = () => ({ eventId: `evt-lock-${++seq}`, eventType: "order.paid", payload: { seq } });

describe("webhook event processing lease", () => {
  it("lets exactly one of several concurrent first deliveries claim the event", async () => {
    const event = nextEvent();
    const results = await Promise.all([1, 2, 3, 4].map(() => claimWebhookEvent(getDb(), event)));
    expect(results.filter((result) => result === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result === "locked")).toHaveLength(3);
  });

  it("refuses a redelivery while the lease is live and lets exactly one caller reclaim an expired lease", async () => {
    const event = nextEvent();
    const start = new Date("2026-10-13T00:00:00Z");
    expect(await claimWebhookEvent(getDb(), event, start)).toBe("claimed");
    expect(await claimWebhookEvent(getDb(), event, new Date(start.getTime() + 60_000))).toBe("locked");

    const afterLease = new Date(start.getTime() + WEBHOOK_LOCK_LEASE_MS + 1);
    const results = await Promise.all([1, 2, 3].map(() => claimWebhookEvent(getDb(), event, afterLease)));
    expect(results.filter((result) => result === "claimed")).toHaveLength(1);

    // The reclaim renewed the lease, so the event stays locked for others.
    expect(await claimWebhookEvent(getDb(), event, new Date(afterLease.getTime() + 1000))).toBe("locked");
  });

  it("releases the lease on failure so one retry can claim at once", async () => {
    const event = nextEvent();
    expect(await claimWebhookEvent(getDb(), event)).toBe("claimed");
    await failWebhookEvent(getDb(), event.eventId, "boom");
    const results = await Promise.all([1, 2].map(() => claimWebhookEvent(getDb(), event)));
    expect(results.sort()).toEqual(["claimed", "locked"]);
  });

  it("reports duplicates once processed and clears the lease", async () => {
    const event = nextEvent();
    await claimWebhookEvent(getDb(), event);
    await completeWebhookEvent(getDb(), event.eventId);
    expect(await claimWebhookEvent(getDb(), event)).toBe("duplicate");
    const [row] = await getDb().select().from(webhookEvents).where(eq(webhookEvents.eventId, event.eventId));
    expect(row).toMatchObject({ processed: true, lockedUntil: null, error: null });
  });
});
