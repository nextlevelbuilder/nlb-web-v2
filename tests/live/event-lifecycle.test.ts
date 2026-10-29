import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { liveSeats } from "@/lib/db/schema";
import type { LiveEventStatus } from "@/lib/live/types";
import { LIVE_EVENT_TRANSITIONS, assertTransition, canTransition, transitionEvent } from "@/lib/live/event-lifecycle";
import { openSales, setEventCapacity, updateEvent } from "@/lib/live/events";
import { ensureLiveTicketPolarProduct } from "@/lib/live/live-polar-product";
import { getPublicEventBySlug, listUpcomingEvents } from "@/lib/live/event-read-models";
import { LiveError } from "@/lib/live/live-errors";
import { fakePolarProducts, seedDraftEvent, seedOnSaleEvent, seedTopics } from "./live-fixtures";

const ALL: LiveEventStatus[] = ["draft", "scheduled", "sales_open", "live", "ended", "cancelled", "archived"];
const ALLOWED = new Set([
  "draft>scheduled",
  "draft>cancelled",
  "scheduled>sales_open",
  "scheduled>cancelled",
  "sales_open>live",
  "sales_open>cancelled",
  "live>ended",
  "live>cancelled",
  "ended>archived",
]);

describe("event state machine", () => {
  it("allows exactly the ADR transitions and refuses every other pair", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(ALLOWED.has(`${from}>${to}`));
      }
    }
    expect(Object.keys(LIVE_EVENT_TRANSITIONS).sort()).toEqual([...ALL].sort());
    expect(() => assertTransition("ended", "live")).toThrowError(LiveError);
  });

  it("refuses skipping states and side-effect transitions through transitionEvent", async () => {
    const draft = await seedDraftEvent();
    await expect(transitionEvent(draft.id, "live", getDb())).rejects.toMatchObject({ code: "invalid_transition" });
    // @ts-expect-error sales_open is only reachable through openSales
    await expect(transitionEvent(draft.id, "sales_open", getDb())).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(transitionEvent(draft.id, "scheduled", getDb())).resolves.toMatchObject({ status: "scheduled" });
    await expect(transitionEvent(draft.id, "scheduled", getDb())).rejects.toMatchObject({ code: "invalid_transition" });
  });
});

describe("opening sales and capacity", () => {
  it("requires a Polar product, then creates capacity seats once (idempotent)", async () => {
    const draft = await seedDraftEvent({ capacity: 7 });
    await transitionEvent(draft.id, "scheduled", getDb());
    await expect(openSales(draft.id, getDb())).rejects.toMatchObject({ code: "polar_product_missing" });

    await ensureLiveTicketPolarProduct({ ...draft, status: "scheduled" }, getDb(), fakePolarProducts("polar-open-1"));
    const first = await openSales(draft.id, getDb());
    expect(first.event.status).toBe("sales_open");
    expect(first.seatsCreated).toBe(7);
    const again = await openSales(draft.id, getDb());
    expect(again.seatsCreated).toBe(0);
    const seats = await getDb().select().from(liveSeats).where(eq(liveSeats.eventId, draft.id));
    expect(seats.map((s) => s.seatNo).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("only grows capacity after sales open and locks the price", async () => {
    const event = await seedOnSaleEvent({ capacity: 3 });
    await expect(setEventCapacity(event.id, 2, getDb())).rejects.toMatchObject({ code: "capacity_shrink_refused" });
    const grown = await setEventCapacity(event.id, 5, getDb());
    expect(grown.capacity).toBe(5);
    const seats = await getDb().select().from(liveSeats).where(eq(liveSeats.eventId, event.id));
    expect(seats).toHaveLength(5);
    await expect(updateEvent(event.id, { priceCents: 999 }, getDb())).rejects.toMatchObject({ code: "price_locked" });
    await expect(updateEvent(event.id, { capacity: 4 }, getDb())).rejects.toMatchObject({ code: "capacity_shrink_refused" });
    await expect(updateEvent(event.id, { hostName: "New host" }, getDb())).resolves.toMatchObject({ hostName: "New host" });
  });

  it("refuses a topic or voting round that does not exist with a validation error", async () => {
    await expect(seedDraftEvent({ topicId: "no-such-topic" })).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    await expect(seedDraftEvent({ pollRoundId: "no-such-round" })).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    const draft = await seedDraftEvent();
    await expect(updateEvent(draft.id, { topicId: "no-such-topic" }, getDb())).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    await expect(updateEvent(draft.id, { pollRoundId: "no-such-round" }, getDb())).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    const [topicId] = await seedTopics(1);
    await expect(updateEvent(draft.id, { topicId }, getDb())).resolves.toMatchObject({ topicId });
    await expect(updateEvent(draft.id, { topicId: null }, getDb())).resolves.toMatchObject({ topicId: null });
  });

  it("refuses a price change once the product exists, even before sales open", async () => {
    const draft = await seedDraftEvent();
    await ensureLiveTicketPolarProduct(draft, getDb(), fakePolarProducts("polar-lock-1"));
    await expect(updateEvent(draft.id, { priceCents: 500 }, getDb())).rejects.toMatchObject({ code: "price_locked" });
  });
});

describe("public event read models", () => {
  it("never returns drafts and reports seats left while on sale", async () => {
    const draft = await seedDraftEvent();
    const onSale = await seedOnSaleEvent({ capacity: 4 });
    const now = new Date(Date.UTC(2029, 0, 1));
    expect(await getPublicEventBySlug(getDb(), draft.slug, now)).toBeNull();
    const view = await getPublicEventBySlug(getDb(), onSale.slug, now);
    expect(view).toMatchObject({ status: "sales_open", seatsLeft: 4 });
    expect(view).not.toHaveProperty("polarProductId");
    const upcoming = await listUpcomingEvents(getDb(), now);
    expect(upcoming.map((e) => e.slug)).toContain(onSale.slug);
    expect(upcoming.map((e) => e.slug)).not.toContain(draft.slug);
  });
});
