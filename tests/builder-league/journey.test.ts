import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { activityEvidence, badgeAwards, builderProjects, users } from "@/lib/db/schema";
import { getJourney, journeyMonths, paginateJourney, publicJourneyItems } from "@/lib/builder-league/journey";
import { parseCursor } from "@/lib/builder-league/http";
import { journeyItemLabel } from "@/components/builder-league/journey/journey-timeline";
import { getJourneyCopy } from "@/content/builder-league/journey-copy";
import { local, seedEvent } from "./year-review-fixtures";

let t: LocalD1;

beforeEach(async () => {
  t = await createLocalD1();
  await t.db.insert(users).values([
    { id: "u1", name: "Builder", email: "u1@example.com" },
    { id: "u2", name: "Other", email: "u2@example.com" },
    { id: "mod", name: "Mod", email: "mod@example.com", role: "admin" },
  ]);
  await t.db.insert(builderProjects).values([
    { id: "p1", ownerUserId: "u1", name: "Old idea", slug: "old-idea" },
    { id: "p2", ownerUserId: "u1", name: "New idea", slug: "new-idea" },
  ]);
});

afterEach(async () => {
  await t.dispose();
});

describe("builder journey", () => {
  it("orders by occurredAt then id, stably", async () => {
    const same = local(2026, 10, 5, 9);
    await seedEvent(t.db, { id: "b-event", eventType: "ship_public_post", stage: "ship", occurredAt: same });
    await seedEvent(t.db, { id: "a-event", eventType: "ship_public_post", stage: "ship", occurredAt: same });
    await seedEvent(t.db, { id: "c-event", eventType: "validate_problem_signal", stage: "validate", occurredAt: local(2026, 10, 1) });
    const journey = await getJourney(t.db, "u1");
    expect(journey.items.map((i) => i.id)).toEqual(["c-event", "a-event", "b-event"]);
    const again = await getJourney(t.db, "u1");
    expect(again.items.map((i) => i.id)).toEqual(journey.items.map((i) => i.id));
  });

  it("shows corrections and reversals as their own items and marks what they supersede", async () => {
    await seedEvent(t.db, { id: "orig", eventType: "build_mvp", stage: "build", occurredAt: local(2026, 10, 2), projectId: "p1", rp: 30 });
    await seedEvent(t.db, { id: "rev", kind: "reversal", eventType: "build_mvp", stage: "build", occurredAt: local(2026, 10, 9), supersedesEventId: "orig", payload: { note: "duplicate" }, rp: -30 });
    await seedEvent(t.db, { id: "post", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, 3) });
    await seedEvent(t.db, { id: "fix", kind: "correction", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, 4), supersedesEventId: "post" });

    const { items } = await getJourney(t.db, "u1");
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("orig")).toMatchObject({ state: "reversed", rp: 30, relations: [{ type: "reversed_by", itemId: "rev" }] });
    expect(byId.get("rev")).toMatchObject({ kind: "reversal", summary: "duplicate", relations: [{ type: "reverses", itemId: "orig" }] });
    expect(byId.get("post")).toMatchObject({ state: "corrected", relations: [{ type: "corrected_by", itemId: "fix" }] });
    expect(byId.get("fix")).toMatchObject({ kind: "correction", state: "verified" });
  });

  it("labels backfill with provenance and never invents months", async () => {
    await seedEvent(t.db, {
      id: "bf1", kind: "backfill", source: "backfill", eventType: "ship_product_launch", stage: "ship",
      occurredAt: local(2026, 10, 3), receivedAt: local(2026, 10, 17), provenance: { source: "legacy-d1-import" },
    });
    await seedEvent(t.db, { id: "live", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, 20) });
    const { items } = await getJourney(t.db, "u1");
    expect(items.find((i) => i.id === "bf1")?.provenance).toEqual({
      source: "backfill", label: "legacy-d1-import", originalAt: local(2026, 10, 3).getTime(), importedAt: local(2026, 10, 17).getTime(),
    });
    expect(items.find((i) => i.id === "live")?.provenance).toBeNull();
    expect(journeyMonths(items)).toEqual(["2026-10"]);
  });

  it("links a pivot to the next validation and flags it as a learning", async () => {
    await seedEvent(t.db, { id: "pivot", eventType: "validate_stop_pivot", stage: "validate", occurredAt: local(2026, 10, 1), projectId: "p1" });
    await seedEvent(t.db, { id: "signal", eventType: "validate_problem_signal", stage: "validate", occurredAt: local(2026, 10, 6), projectId: "p2" });
    const { items, projects } = await getJourney(t.db, "u1");
    expect(items[0]).toMatchObject({ id: "pivot", learning: true, relations: [{ type: "led_to", itemId: "signal" }] });
    expect(items[1].relations).toEqual([{ type: "followed_pivot", itemId: "pivot" }]);
    expect(projects.map((p) => p.projectName)).toEqual(["Old idea", "New idea"]);
  });

  it("includes pending evidence and badges as non-milestones and keeps private items out of the public view", async () => {
    await t.db.insert(activityEvidence).values({
      id: "ev1", userId: "u1", eventType: "build_mvp", stage: "build", title: "Pending MVP", occurredAt: local(2026, 10, 8),
      status: "submitted", source: "member", clientKey: "k1",
    });
    await t.db.insert(badgeAwards).values({ id: "bd1", userId: "u1", badgeKey: "first_ship", awardedAt: local(2026, 10, 9) });
    await seedEvent(t.db, { id: "pub", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, 2), visibility: "public" });
    await seedEvent(t.db, { id: "priv", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, 3) });
    await seedEvent(t.db, { id: "selfrep", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, 4), visibility: "public", verification: "self_reported" });
    await seedEvent(t.db, { id: "other", subjectUserId: "u2", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, 4) });

    const { items } = await getJourney(t.db, "u1");
    expect(items.find((i) => i.id === "evidence:ev1")).toMatchObject({ state: "pending", title: "Pending MVP" });
    expect(items.find((i) => i.id === "badge:bd1")).toMatchObject({ badgeKey: "first_ship", state: "verified" });
    expect(items.some((i) => i.id === "other")).toBe(false);
    expect(publicJourneyItems(items).map((i) => i.id)).toEqual(["pub"]);
  });

  it("shows a badge once when the award also wrote a badge event", async () => {
    await t.db.insert(badgeAwards).values({ id: "bd1", userId: "u1", badgeKey: "signal_hunter", awardedAt: local(2026, 10, 9) });
    await seedEvent(t.db, {
      id: "badge-event", kind: "badge", eventType: "badge:signal_hunter", stage: "validate", occurredAt: local(2026, 10, 9),
      verification: "system_verified", payload: { badgeKey: "signal_hunter", awardId: "bd1" },
    });
    const { items } = await getJourney(t.db, "u1");
    expect(items.map((i) => i.id)).toEqual(["badge:bd1"]);
    expect(journeyItemLabel(items[0], getJourneyCopy("vi"), "vi")).toBe(`${getJourneyCopy("vi").kinds.badge}: Thợ săn tín hiệu`);
  });

  it("paginates with the shared keyset cursor", async () => {
    for (let day = 1; day <= 5; day++) {
      await seedEvent(t.db, { id: `e${day}`, eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 10, day) });
    }
    const { items } = await getJourney(t.db, "u1");
    const first = paginateJourney(items, { cursor: null, limit: 2 });
    const second = paginateJourney(items, { cursor: parseCursor(first.nextCursor), limit: 2 });
    const third = paginateJourney(items, { cursor: parseCursor(second.nextCursor), limit: 2 });
    expect([...first.items, ...second.items, ...third.items].map((i) => i.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(third.nextCursor).toBeNull();
  });
});
