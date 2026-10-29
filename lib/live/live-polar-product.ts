import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Polar } from "@polar-sh/sdk";
import type { AppDb } from "@/lib/db";
import { liveEvents } from "@/lib/db/schema";
import { LIVE_TICKET_PRODUCT_KIND } from "./types";
import { LiveError } from "./live-errors";
import type { LiveEventRow } from "./events";

/** The slice of the Polar SDK this module calls; injectable so tests never hit the network. */
export interface LivePolarProductsClient {
  products: Pick<Polar["products"], "create" | "update">;
}

/**
 * Ensure the event owns exactly one one-time Polar ticket product and return its id (mirrors
 * `ensureCourseVideoPolarProduct`). Idempotent: an existing `polarProductId` is returned without
 * calling Polar. Only draft or scheduled events get a product; afterwards the price is fixed
 * (`updateEvent` refuses price changes once a product exists). When two calls race, the
 * conditional update lets one id win and the loser archives its duplicate.
 */
export async function ensureLiveTicketPolarProduct(event: LiveEventRow, db: AppDb, client: LivePolarProductsClient): Promise<string> {
  if (event.polarProductId) return event.polarProductId;
  if (event.status !== "draft" && event.status !== "scheduled") {
    throw new LiveError(409, "event_locked", `A ${event.status} event cannot get a new payment product`);
  }

  let productId: string;
  try {
    const product = await client.products.create({
      name: event.titleEn,
      description: event.descriptionEn || null,
      recurringInterval: null,
      prices: [{ amountType: "fixed", priceAmount: event.priceCents, priceCurrency: event.currency }],
      metadata: { kind: LIVE_TICKET_PRODUCT_KIND, eventId: event.id, slug: event.slug },
    });
    productId = product.id;
  } catch (error) {
    console.error("Polar product creation failed for live event:", {
      eventId: event.id,
      error: error instanceof Error ? error.message : error,
    });
    throw new LiveError(502, "polar_product_failed", "Could not create the payment product for this event");
  }

  // The price stored with the product must be the one Polar charges, so the claim also checks it.
  const [claimed] = await db
    .update(liveEvents)
    .set({ polarProductId: productId, updatedAt: new Date() })
    .where(
      and(
        eq(liveEvents.id, event.id),
        isNull(liveEvents.polarProductId),
        eq(liveEvents.priceCents, event.priceCents),
        eq(liveEvents.currency, event.currency),
        inArray(liveEvents.status, ["draft", "scheduled"])
      )
    )
    .returning({ polarProductId: liveEvents.polarProductId });
  if (claimed?.polarProductId) return claimed.polarProductId;

  const [current] = await db
    .select({ polarProductId: liveEvents.polarProductId })
    .from(liveEvents)
    .where(eq(liveEvents.id, event.id))
    .limit(1);
  try {
    await client.products.update({ id: productId, productUpdate: { isArchived: true } });
  } catch (error) {
    console.error("Failed to archive duplicate Polar live ticket product; archive it manually:", {
      productId,
      error: error instanceof Error ? error.message : error,
    });
  }
  if (!current?.polarProductId) throw new LiveError(409, "conflict", "The event changed while creating its product; retry");
  return current.polarProductId;
}
