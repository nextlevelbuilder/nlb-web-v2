import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { users } from "@/lib/db/schema";
import { canonicalJson } from "@/lib/builder-league/ruleset";
import {
  MIN_COHORT,
  buildCommunityWrappedData,
  communityWrappedData,
  computeCommunityWrapped,
  ensureCommunityWrapped,
  type CommunityEvent,
} from "@/lib/builder-league/community-wrapped";
import { local, seedEvent } from "./year-review-fixtures";

let t: LocalD1;
const FINAL_NOW = local(2027, 1, 8, 0, 0);
const builders = ["b1", "b2", "b3", "b4", "b5", "b6"];

beforeAll(async () => {
  t = await createLocalD1();
  await t.db.insert(users).values([...builders, "mod"].map((id) => ({ id, name: id, email: `${id}@example.com`, role: id === "mod" ? "admin" : "user" })));
  for (const [i, id] of builders.entries()) {
    await seedEvent(t.db, { id: `${id}-validate`, subjectUserId: id, eventType: "validate_problem_signal", stage: "validate", occurredAt: local(2026, 3, i + 1) });
  }
  // Only three launches: below the cohort threshold.
  for (const id of builders.slice(0, 3)) {
    await seedEvent(t.db, { id: `${id}-launch`, subjectUserId: id, eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 1), projectId: null });
  }
  // A peer-confirmed launch does not count as a launch (strict verification).
  await seedEvent(t.db, { id: "b4-launch", subjectUserId: "b4", eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 2), verification: "peer_confirmed" });
  // Self-reported activity never counts.
  await seedEvent(t.db, { id: "b6-self", subjectUserId: "b6", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 6, 3), verification: "self_reported" });
  // A reversed event drops out.
  await seedEvent(t.db, { id: "b5-launch", subjectUserId: "b5", eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 4) });
  await seedEvent(t.db, { id: "b5-launch-rev", subjectUserId: "b5", kind: "reversal", eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 5), supersedesEventId: "b5-launch" });
  // Dec 31 local only reaches the final version.
  await seedEvent(t.db, { id: "b6-dec31", subjectUserId: "b6", eventType: "validate_customer_interview", stage: "validate", occurredAt: local(2026, 12, 31, 9) });
});

afterAll(async () => {
  await t.dispose();
});

describe("community wrapped", () => {
  it("suppresses cohorts smaller than the minimum and names no member", async () => {
    const data = await computeCommunityWrapped(t.db, 2026, FINAL_NOW);
    const byKey = Object.fromEntries(data.metrics.map((m) => [m.key, m]));
    expect(MIN_COHORT).toBe(5);
    expect(byKey.active_builders).toMatchObject({ value: 6, members: 6, suppressed: false, denominator: null });
    expect(byKey.active_validators).toMatchObject({ value: 6, suppressed: false, denominator: { key: "active_builders", value: 6 } });
    expect(byKey.launches).toMatchObject({ value: null, members: null, suppressed: true, verification: ["moderator_verified", "system_verified"] });
    expect(byKey.paying_products.suppressed).toBe(true);
    expect(byKey.peer_help.suppressed).toBe(true);
    const json = JSON.stringify(data);
    for (const id of builders) expect(json).not.toContain(`"${id}"`);
  });

  it("labels provisional versus final and moves Dec 31 (UTC+7) into the final version only", async () => {
    const provisional = await computeCommunityWrapped(t.db, 2026, local(2027, 1, 2));
    const final = await computeCommunityWrapped(t.db, 2026, FINAL_NOW);
    expect(provisional.status).toBe("provisional");
    expect(final.status).toBe("final");
    expect(provisional.eventHash).not.toBe(final.eventHash);
    expect(final.timeframe.timeZone).toBe("Asia/Ho_Chi_Minh");
  });

  it("is deterministic regardless of input order", () => {
    const events: CommunityEvent[] = builders.map((id, i) => ({
      id: `e${i}`, subjectUserId: id, projectId: null, stage: "build", eventType: "build_mvp", verification: "moderator_verified", backfill: i === 0, counterpartyUserId: null,
    }));
    const a = buildCommunityWrappedData({ year: 2026, status: "final", cutoffAt: 1, events });
    const b = buildCommunityWrappedData({ year: 2026, status: "final", cutoffAt: 1, events: [...events].reverse() });
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.backfilledEvents).toBe(1);
  });

  it("stores versions only on change and never replaces the final snapshot", async () => {
    const first = await ensureCommunityWrapped(t.db, 2026, local(2027, 1, 2));
    const same = await ensureCommunityWrapped(t.db, 2026, local(2027, 1, 3));
    expect(first.created).toBe(true);
    expect(same).toMatchObject({ created: false, snapshot: { id: first.snapshot.id } });
    const final = await ensureCommunityWrapped(t.db, 2026, FINAL_NOW);
    expect(final.snapshot).toMatchObject({ version: 2, status: "final" });
    await seedEvent(t.db, { id: "late", subjectUserId: "b1", eventType: "build_mvp", stage: "build", occurredAt: local(2026, 5, 1), receivedAt: local(2027, 1, 20) });
    const frozen = await ensureCommunityWrapped(t.db, 2026, local(2027, 2, 1));
    expect(frozen).toMatchObject({ created: false, snapshot: { id: final.snapshot.id } });
    expect(communityWrappedData(frozen.snapshot).status).toBe("final");
  });
});
