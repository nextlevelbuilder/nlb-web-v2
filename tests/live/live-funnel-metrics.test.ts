import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { holdSeat } from "@/lib/live/seats";
import { syncLiveTicketFromOrder } from "@/lib/live/live-webhook-tickets";
import { getLiveFunnelMetrics } from "@/lib/live/live-funnel-metrics";
import { archiveTopic, createTopicGroup, listActiveTopicGroups } from "@/lib/live/topics";
import { nextSeq, seedOnSaleEvent, seedTopics, seedUser } from "./live-fixtures";

const NOW = new Date(Date.UTC(2029, 5, 1, 3, 0));

describe("live funnel metrics", () => {
  it("reports aggregate counts only", async () => {
    const event = await seedOnSaleEvent({ capacity: 5 });
    const [a, b] = [await seedUser("f"), await seedUser("f")];
    const { reservation } = await holdSeat({ eventId: event.id, userId: a.id, now: NOW, recordingConsent: true }, getDb());
    await holdSeat({ eventId: event.id, userId: b.id, now: NOW, recordingConsent: true }, getDb());
    await syncLiveTicketFromOrder(
      { type: "order.paid", data: { id: `ord-${nextSeq()}`, status: "paid", product_id: event.polarProductId ?? "", metadata: { userId: a.id, reservationId: reservation.id } } },
      getDb(),
      NOW
    );

    const metrics = await getLiveFunnelMetrics(getDb(), NOW);
    const row = metrics.events.find((e) => e.eventId === event.id);
    expect(row).toMatchObject({ holdsCreated: 2, activeHolds: 1, attendees: 0, tickets: { active: 1, refunded: 0, cancelled: 0, exception: 0 } });
    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toContain(a.id);
    expect(serialized).not.toContain(a.email);
  });
});

describe("topic curation", () => {
  it("refuses duplicate slugs and hides archived topics", async () => {
    const [kept, archived] = await seedTopics(2);
    await archiveTopic(archived, getDb());
    const groups = await listActiveTopicGroups(getDb());
    const topicIds = groups.flatMap((g) => g.topics.map((t) => t.id));
    expect(topicIds).toContain(kept);
    expect(topicIds).not.toContain(archived);
    const slug = `dup-${nextSeq()}`;
    await createTopicGroup({ slug, titleEn: "A", titleVi: "A" }, getDb());
    await expect(createTopicGroup({ slug, titleEn: "B", titleVi: "B" }, getDb())).rejects.toMatchObject({ code: "conflict" });
  });
});
