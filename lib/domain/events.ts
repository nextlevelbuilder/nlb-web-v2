import { getDb, type AppDb } from "@/lib/db";
import { domainEvents, outboxEvents, deliveryIntents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface CreateEventParams {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number;
  payload: Record<string, unknown>;
  actorId?: string;
  actorRole?: string;
  targetQueue?: string;
}

/**
 * Record a domain event and an outbox event in the same atomic database transaction.
 */
export async function recordDomainEvent(params: CreateEventParams, customDb?: AppDb) {
  const db = customDb || getDb();
  const eventId = `evt_${crypto.randomUUID()}`;

  // Domain event + optional outbox row are written in one atomic D1 batch.
  const domainInsert = db
    .insert(domainEvents)
    .values({
      eventId,
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion ?? 1,
      payload: params.payload,
      actorId: params.actorId,
      actorRole: params.actorRole,
    })
    .returning();

  if (!params.targetQueue) {
    const [domainEvent] = await domainInsert;
    return domainEvent;
  }

  const [[domainEvent]] = await db.batch([
    domainInsert,
    db.insert(outboxEvents).values({
      eventId,
      eventType: params.eventType,
      targetQueue: params.targetQueue,
      payload: params.payload,
      status: "pending",
      attempts: 0,
    }),
  ]);
  return domainEvent;
}

/**
 * Claim an external delivery intent idempotently.
 * Returns true if claimed for the first time, false if already claimed/sent.
 * Throws on real database errors so callers can retry.
 */
export async function claimDeliveryIntent(eventId: string, sink: string, customDb?: AppDb): Promise<boolean> {
  const db = customDb || getDb();
  const idempotencyKey = `${eventId}:${sink}`;

  try {
    const [inserted] = await db
      .insert(deliveryIntents)
      .values({
        eventId,
        sink,
        idempotencyKey,
        status: "sending",
      })
      .onConflictDoNothing({ target: deliveryIntents.idempotencyKey })
      .returning();

    return !!inserted;
  } catch (error: unknown) {
    // Unique violations that ON CONFLICT DO NOTHING did not absorb mean the intent already exists.
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return false;
    }
    // Re-throw transient database errors
    throw error;
  }
}

/**
 * Mark a delivery intent as successfully delivered.
 */
export async function markDeliveryComplete(
  eventId: string,
  sink: string,
  responsePayload?: Record<string, unknown>,
  customDb?: AppDb
) {
  const db = customDb || getDb();
  const idempotencyKey = `${eventId}:${sink}`;
  await db
    .update(deliveryIntents)
    .set({
      status: "sent",
      responsePayload: responsePayload ?? null,
      deliveredAt: new Date(),
    })
    .where(eq(deliveryIntents.idempotencyKey, idempotencyKey));
}
