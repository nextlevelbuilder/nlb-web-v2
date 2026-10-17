import { describe, it, expect, vi } from "vitest";
import { recordDomainEvent, claimDeliveryIntent, markDeliveryComplete } from "@/lib/domain/events";
import type { AppDb } from "@/lib/db";
import { domainEvents, outboxEvents } from "@/lib/db/schema";
import { createLocalD1 } from "./helpers/local-d1";

describe("Transactional Outbox & Domain Event Ledger", () => {
  it("should record domain event and outbox event atomically in one D1 batch", async () => {
    const local = await createLocalD1();
    try {
      const result = await recordDomainEvent(
        {
          eventType: "product.created",
          aggregateType: "product",
          aggregateId: "prod_123",
          payload: { name: "Test" },
          targetQueue: "nlb-polar-webhooks",
        },
        local.db
      );
      expect(result.eventId).toMatch(/^evt_/);
      expect(result.payload).toEqual({ name: "Test" });
      const outbox = await local.db.select().from(outboxEvents);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({ eventId: result.eventId, targetQueue: "nlb-polar-webhooks", status: "pending" });
    } finally {
      await local.dispose();
    }
  });

  it("should not write an outbox row when no target queue is given", async () => {
    const local = await createLocalD1();
    try {
      await recordDomainEvent({ eventType: "x", aggregateType: "product", aggregateId: "p", payload: {} }, local.db);
      expect(await local.db.select().from(domainEvents)).toHaveLength(1);
      expect(await local.db.select().from(outboxEvents)).toHaveLength(0);
    } finally {
      await local.dispose();
    }
  });

  it("should claim delivery intent and return true on first claim", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "uuid-intent-1",
                eventId: "evt_123",
                sink: "discord",
                idempotencyKey: "evt_123:discord",
                status: "sending",
              },
            ]),
          }),
        }),
      }),
    } as unknown as AppDb;

    const claimed = await claimDeliveryIntent("evt_123", "discord", mockDb);
    expect(claimed).toBe(true);
  });

  it("should return false when delivery intent has already been claimed", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // Empty return on conflict
          }),
        }),
      }),
    } as unknown as AppDb;

    const claimed = await claimDeliveryIntent("evt_123", "discord", mockDb);
    expect(claimed).toBe(false);
  });
});
