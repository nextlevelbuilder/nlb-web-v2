import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { activityEvidence, builderPrivacy, builderProjects, timeCapsuleEntries, users } from "@/lib/db/schema";
import { canonicalJson } from "@/lib/builder-league/ruleset";
import {
  computeYearReview,
  ensureYearSnapshot,
  setHiddenScenes,
  snapshotCutoff,
  snapshotData,
  snapshotStatusAt,
  toPublicYearReview,
  yearWindow,
} from "@/lib/builder-league/year-review";
import { local, seedEvent } from "./year-review-fixtures";

let t: LocalD1;
const IN_YEAR = local(2026, 11, 15);
const FINAL_NOW = local(2027, 1, 8, 0, 0);

beforeAll(async () => {
  t = await createLocalD1();
  await t.db.insert(users).values([
    { id: "u1", name: "Builder", email: "u1@example.com" },
    { id: "u2", name: "Consenting peer", email: "u2@example.com" },
    { id: "u3", name: "Private peer", email: "u3@example.com" },
    { id: "u4", name: "Shipper only", email: "u4@example.com" },
    { id: "u5", name: "Cutoff", email: "u5@example.com" },
    { id: "u6", name: "Backfill", email: "u6@example.com" },
    { id: "mod", name: "Mod", email: "mod@example.com", role: "admin" },
  ]);
  await t.db.insert(builderPrivacy).values([
    { userId: "u2", peerMentionsOk: true },
    { userId: "u3", peerMentionsOk: false },
  ]);
  await t.db.insert(builderProjects).values({ id: "p1", ownerUserId: "u1", name: "Signal app", slug: "signal-app" });
  await t.db.insert(activityEvidence).values({
    id: "ev-mvp", userId: "u1", projectId: "p1", eventType: "build_mvp", stage: "build", title: "Working MVP", summary: "secret details",
    occurredAt: local(2026, 3, 2), status: "approved", source: "member", clientKey: "mvp", eventId: "mvp",
  });

  // u1: a full year with public and private milestones, a reversal and peer help.
  await seedEvent(t.db, { id: "signal", eventType: "validate_problem_signal", stage: "validate", occurredAt: local(2026, 2, 1), projectId: "p1", visibility: "public", rp: 10 });
  await seedEvent(t.db, { id: "pivot", eventType: "validate_stop_pivot", stage: "validate", occurredAt: local(2026, 2, 20), projectId: "p1", rp: 40 });
  await seedEvent(t.db, { id: "mvp", eventType: "build_mvp", stage: "build", occurredAt: local(2026, 3, 2), projectId: "p1", visibility: "public", evidenceId: "ev-mvp", rp: 30 });
  await seedEvent(t.db, { id: "launch", eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 1), projectId: "p1", visibility: "public", rp: 100 });
  await seedEvent(t.db, { id: "fake-pay", eventType: "ship_first_payment", stage: "ship", occurredAt: local(2026, 6, 5), projectId: "p1", visibility: "public", rp: 100 });
  await seedEvent(t.db, { id: "fake-pay-rev", kind: "reversal", eventType: "ship_first_payment", stage: "ship", occurredAt: local(2026, 6, 9), supersedesEventId: "fake-pay", rp: -100 });
  await seedEvent(t.db, { id: "help-1", eventType: "contribute_peer_help", stage: "contribute", occurredAt: local(2026, 7, 1), payload: { counterpartyUserId: "u2" }, rp: 8 });
  await seedEvent(t.db, { id: "help-2", eventType: "contribute_peer_help", stage: "contribute", occurredAt: local(2026, 7, 1, 15), payload: { counterpartyUserId: "u3" }, rp: 8 });
  await seedEvent(t.db, { id: "unverified", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 8, 1), verification: "self_reported" });
  await t.db.insert(timeCapsuleEntries).values({ userId: "u1", year: 2027, kind: "intent", body: "Ship the paid tier", visibility: "private", createdAt: local(2026, 11, 1) });

  // u4: only SHIP posts.
  await seedEvent(t.db, { id: "u4-post", subjectUserId: "u4", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 5, 1), visibility: "public" });

  // u5: events around the provisional cutoff (Dec 30 23:59:59.999 local).
  await seedEvent(t.db, { id: "u5-dec30", subjectUserId: "u5", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 12, 30, 23, 30), receivedAt: local(2026, 12, 30, 23, 45) });
  await seedEvent(t.db, { id: "u5-dec31", subjectUserId: "u5", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 12, 31, 0, 30), receivedAt: local(2026, 12, 31, 1) });
  await seedEvent(t.db, { id: "u5-late", subjectUserId: "u5", eventType: "build_mvp", stage: "build", occurredAt: local(2026, 12, 20), receivedAt: local(2027, 1, 3) });

  // u6: backfilled October only.
  await seedEvent(t.db, {
    id: "u6-bf", subjectUserId: "u6", kind: "backfill", source: "backfill", eventType: "ship_product_launch", stage: "ship",
    occurredAt: local(2026, 10, 3), receivedAt: local(2026, 10, 17), provenance: { source: "legacy-d1-import" },
  });
});

afterAll(async () => {
  await t.dispose();
});

describe("year review cutoffs", () => {
  it("uses Dec 30 local for provisional and Dec 31 plus grace for final", () => {
    const window = yearWindow(2026);
    expect(new Date(window.start).toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(new Date(window.provisionalCutoff).toISOString()).toBe("2026-12-30T16:59:59.999Z");
    expect(new Date(window.end).toISOString()).toBe("2026-12-31T16:59:59.999Z");
    expect(snapshotStatusAt(2026, local(2027, 1, 7, 23, 59))).toBe("provisional");
    expect(snapshotStatusAt(2026, FINAL_NOW)).toBe("final");
    expect(snapshotCutoff(2026, IN_YEAR).readUntil).toBe(IN_YEAR.getTime());
  });

  it("includes Dec 30 (UTC+7) in the provisional review and Dec 31 and late approvals only in the final one", async () => {
    const provisional = await computeYearReview(t.db, "u5", 2026, local(2027, 1, 4));
    expect(provisional.status).toBe("provisional");
    expect(provisional.milestones.map((m) => m.eventId)).toEqual(["u5-dec30"]);
    const final = await computeYearReview(t.db, "u5", 2026, FINAL_NOW);
    expect(final.status).toBe("final");
    expect(final.milestones.map((m) => m.eventId)).toEqual(["u5-late", "u5-dec30", "u5-dec31"]);
  });
});

describe("year review data", () => {
  it("is deterministic: the same inputs give byte-identical JSON", async () => {
    const a = await computeYearReview(t.db, "u1", 2026, FINAL_NOW);
    const b = await computeYearReview(t.db, "u1", 2026, local(2027, 2, 1));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("counts verified milestones only, drops reversed ones and omits missing scenes", async () => {
    const data = await computeYearReview(t.db, "u1", 2026, FINAL_NOW);
    expect(data.milestones.map((m) => m.eventId)).toEqual(["signal", "pivot", "mvp", "launch", "help-1", "help-2"]);
    expect(data.scenes.map((s) => s.key)).toEqual([
      "year_in_numbers", "first_idea", "pivotal_learning", "mvp", "launch", "community_impact", "next_year",
    ]);
    expect(data.missing.scenes).toEqual(["validation", "first_customer", "league_highlights"]);
    expect(data.stats).toMatchObject({ verifiedMilestones: 6, rp: 196, peopleHelped: 2, learnings: 1, projects: 1 });
    expect(data.milestones.find((m) => m.eventId === "mvp")).toMatchObject({ title: "Working MVP", projectName: "Signal app" });
    expect(JSON.stringify(data)).not.toContain("secret details");
    expect(data.rulesetVersion).toBe("v2");
    expect(data.archetype?.key).toBeDefined();
  });

  it("mentions only peers who consented", async () => {
    const data = await computeYearReview(t.db, "u1", 2026, FINAL_NOW);
    expect(data.peerMentions).toEqual([{ userId: "u2", name: "Consenting peer" }]);
  });

  it("omits every scene without a real milestone", async () => {
    const data = await computeYearReview(t.db, "u4", 2026, FINAL_NOW);
    expect(data.scenes.map((s) => s.key)).toEqual(["year_in_numbers"]);
    expect(data.score).toBeNull();
  });

  it("labels backfilled history and does not invent earlier months", async () => {
    const data = await computeYearReview(t.db, "u6", 2026, FINAL_NOW);
    expect(data.milestones).toHaveLength(1);
    expect(data.milestones[0]).toMatchObject({ backfill: true, provenanceLabel: "legacy-d1-import", localDate: "2026-10-03" });
    expect(data.provenance.backfill).toMatchObject({ count: 1, labels: ["legacy-d1-import"] });
    expect(data.missing).toMatchObject({ trackedFrom: "2026-10-03", untrackedBeforeTrackedFrom: true });
    expect(data.stats.activeWeeks).toBe(1);
  });
});

describe("shared (public) version", () => {
  it("never exposes private items, counts or text", async () => {
    const data = await computeYearReview(t.db, "u1", 2026, FINAL_NOW);
    const shared = toPublicYearReview(data, []);
    expect(shared.milestones.map((m) => m.eventId)).toEqual(["signal", "mvp", "launch"]);
    expect(shared.stats.verifiedMilestones).toBe(3);
    expect(shared.scenes.map((s) => s.key)).toEqual(["year_in_numbers", "first_idea", "mvp", "launch"]);
    expect(shared.nextYearNote).toBeNull();
    expect(shared.peerMentions).toEqual([]); // the help events behind them are private
    expect(shared.provenance.backfill).toBeNull();
    const json = JSON.stringify(shared);
    for (const secret of ["\"pivot\"", "help-1", "Ship the paid tier", "\"rp\"", "\"score\""]) expect(json).not.toContain(secret);
  });

  it("drops scenes the member hid", async () => {
    const data = await computeYearReview(t.db, "u1", 2026, FINAL_NOW);
    expect(toPublicYearReview(data, ["mvp", "year_in_numbers"]).scenes.map((s) => s.key)).toEqual(["first_idea", "launch"]);
  });
});

describe("snapshot persistence", () => {
  it("stores a new version only when data changes and freezes the final snapshot", async () => {
    const first = await ensureYearSnapshot(t.db, "u4", 2026, IN_YEAR);
    const again = await ensureYearSnapshot(t.db, "u4", 2026, local(2026, 11, 20));
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, snapshot: { id: first.snapshot.id, version: 1 } });

    await setHiddenScenes(t.db, "u4", 2026, ["year_in_numbers"]);
    await seedEvent(t.db, { id: "u4-post-2", subjectUserId: "u4", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 11, 21), receivedAt: local(2026, 11, 21, 13) });
    const second = await ensureYearSnapshot(t.db, "u4", 2026, local(2026, 11, 22));
    expect(second.snapshot).toMatchObject({ version: 2, status: "provisional", hiddenScenes: ["year_in_numbers"] });

    const final = await ensureYearSnapshot(t.db, "u4", 2026, FINAL_NOW);
    expect(final.snapshot).toMatchObject({ version: 3, status: "final" });
    await seedEvent(t.db, { id: "u4-post-3", subjectUserId: "u4", eventType: "ship_public_post", stage: "ship", occurredAt: local(2026, 11, 25), receivedAt: local(2027, 1, 20) });
    const frozen = await ensureYearSnapshot(t.db, "u4", 2026, local(2027, 2, 1));
    expect(frozen).toMatchObject({ created: false, snapshot: { id: final.snapshot.id } });
    expect(snapshotData(frozen.snapshot).milestones).toHaveLength(2);
  });

  it("rejects unknown scene keys", async () => {
    await expect(setHiddenScenes(t.db, "u4", 2026, ["not_a_scene"])).rejects.toMatchObject({ status: 400 });
  });
});
