import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { builderModerationActions, builderProjects, scoreCapSlots, scoreLedger, users } from "@/lib/db/schema";
import {
  awardForEvent,
  awardForEventDetailed,
  getLedger,
  getRpTotal,
  getStageTotals,
  recordBuilderEvent,
  reverseAward,
  type RecordBuilderEventInput,
} from "@/lib/builder-league/ledger";
import { parseCursor } from "@/lib/builder-league/http";
import type { EventTypeKey } from "@/lib/builder-league/types";

const MOD = { actorId: "mod", actorRole: "moderator" as const };
/** Monday 2026-09-28 10:00 local; the whole week is in the past for these tests. */
const WEEK_START = new Date("2026-09-28T03:00:00Z");
const at = (hours: number) => new Date(WEEK_START.getTime() + hours * 3_600_000);

let local: LocalD1;

beforeEach(async () => {
  local = await createLocalD1();
  await local.db.insert(users).values([
    { id: "u1", name: "Builder", email: "u1@example.com" },
    { id: "u2", name: "Peer", email: "u2@example.com" },
    { id: "mod", name: "Moderator", email: "mod@example.com", role: "admin" },
  ]);
  await local.db.insert(builderProjects).values([
    { id: "p1", ownerUserId: "u1", name: "Project one", slug: "project-one" },
    { id: "p2", ownerUserId: "u1", name: "Project two", slug: "project-two" },
  ]);
});

afterEach(async () => {
  await local.dispose();
});

function eventInput(externalEventId: string, overrides: Partial<RecordBuilderEventInput> = {}): RecordBuilderEventInput {
  return {
    subjectUserId: "u1",
    actorUserId: "mod",
    actorRole: "moderator",
    projectId: "p1",
    eventType: "ship_public_post" satisfies EventTypeKey,
    source: "moderator",
    externalEventId,
    occurredAt: at(1),
    rulesetVersion: "v2",
    verification: "moderator_verified",
    ...overrides,
  };
}

async function verifiedEvent(externalEventId: string, overrides: Partial<RecordBuilderEventInput> = {}) {
  const { event } = await recordBuilderEvent(local.db, eventInput(externalEventId, overrides));
  return event;
}

describe("builder ledger on local D1", () => {
  it("replays an event and its award idempotently", async () => {
    const first = await recordBuilderEvent(local.db, eventInput("post-1"));
    const replay = await recordBuilderEvent(local.db, eventInput("post-1"));
    expect(first.created).toBe(true);
    expect(replay).toMatchObject({ created: false, event: { id: first.event.id } });

    const award = await awardForEvent(local.db, first.event.id, MOD);
    const again = await awardForEvent(local.db, first.event.eventId, MOD);
    expect(award).toMatchObject({ created: true, rp: 10, stage: "ship", rulesetVersion: "v2" });
    expect(again).toMatchObject({ created: false, id: award!.id });
    expect(await getRpTotal(local.db, "u1")).toBe(10);
  });

  it("awards a concurrently duplicated event exactly once", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => recordBuilderEvent(local.db, eventInput("dup"))));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.event.id)).size).toBe(1);

    const awards = await Promise.all(Array.from({ length: 6 }, () => awardForEvent(local.db, results[0].event.id, MOD)));
    expect(awards.filter((a) => a?.created)).toHaveLength(1);
    expect(new Set(awards.map((a) => a?.id)).size).toBe(1);
    expect(await local.db.select().from(scoreLedger)).toHaveLength(1);
  });

  it("dedupes once-per-project events on the project", async () => {
    const mvp = await verifiedEvent("mvp-a", { eventType: "build_mvp" });
    const sameProject = await verifiedEvent("mvp-b", { eventType: "build_mvp" });
    const otherProject = await verifiedEvent("mvp-c", { eventType: "build_mvp", projectId: "p2" });
    expect((await awardForEvent(local.db, mvp.id, MOD))?.created).toBe(true);
    expect((await awardForEvent(local.db, sameProject.id, MOD))?.created).toBe(false);
    expect((await awardForEvent(local.db, otherProject.id, MOD))?.created).toBe(true);
    expect(await getRpTotal(local.db, "u1")).toBe(60);
  });

  it("never awards an event whose subject was replaced by a privacy-delete tombstone", async () => {
    const event = await verifiedEvent("post-t", { subjectUserId: "deleted-0b5f7c1e" });
    expect(await awardForEventDetailed(local.db, event.id, MOD)).toEqual({ entry: null, created: false, reason: "subject_deleted" });
    expect(await local.db.select().from(scoreLedger)).toHaveLength(0);
  });

  it("never re-awards a reversed entry when the same event is awarded again", async () => {
    const event = await verifiedEvent("post-again");
    const award = (await awardForEvent(local.db, event.id, MOD))!;
    await reverseAward(local.db, award.id, { actorId: "mod", reason: "wrong link" });
    expect(await awardForEvent(local.db, event.id, MOD)).toMatchObject({ id: award.id, created: false });
    expect(await getRpTotal(local.db, "u1")).toBe(0);
  });

  it("reverses an award with a negative entry, never touching the original", async () => {
    const event = await verifiedEvent("post-r");
    const award = (await awardForEvent(local.db, event.id, MOD))!;
    const reversal = await reverseAward(local.db, award.id, { actorId: "mod", reason: "duplicate link" });
    expect(reversal).toMatchObject({ rp: -10, reversesEntryId: award.id, stage: "ship" });
    expect(reversal.occurredAt.getTime()).toBe(award.occurredAt.getTime());

    const [original] = await local.db.select().from(scoreLedger).where(eq(scoreLedger.id, award.id));
    expect(original.rp).toBe(10);
    expect(await getRpTotal(local.db, "u1")).toBe(0);
    expect(await reverseAward(local.db, award.id, { actorId: "mod", reason: "again" })).toMatchObject({ id: reversal.id });
    await expect(reverseAward(local.db, reversal.id, { actorId: "mod", reason: "undo" })).rejects.toMatchObject({ status: 400 });

    const audit = await local.db.select().from(builderModerationActions).where(eq(builderModerationActions.targetId, award.id));
    expect(audit).toMatchObject([{ action: "reverse", actorId: "mod", notes: "duplicate link" }]);
    expect(await local.db.select().from(scoreCapSlots).where(eq(scoreCapSlots.entryId, award.id))).toHaveLength(0);
  });

  it("enforces weekly caps, also under concurrency, and frees a slot on reversal", async () => {
    const events = [];
    for (let i = 0; i < 6; i++) events.push(await verifiedEvent(`cap-${i}`, { occurredAt: at(i) }));
    const results = await Promise.all(events.map((event) => awardForEventDetailed(local.db, event.id, MOD)));
    const awarded = results.filter((r) => r.entry);
    expect(awarded).toHaveLength(4);
    expect(results.filter((r) => !r.entry).map((r) => r.reason)).toEqual(["cap_week_user_4", "cap_week_user_4"]);
    expect(await getRpTotal(local.db, "u1")).toBe(40);

    // The next local week starts fresh (Monday 2026-10-05 00:00 local).
    const nextWeek = await verifiedEvent("cap-next", { occurredAt: new Date("2026-10-04T17:00:00Z") });
    expect((await awardForEvent(local.db, nextWeek.id, MOD))?.created).toBe(true);

    await reverseAward(local.db, awarded[0].entry!.id, { actorId: "mod", reason: "not public" });
    const retry = results.find((r) => !r.entry)!;
    const skippedEvent = events[results.indexOf(retry)];
    expect((await awardForEvent(local.db, skippedEvent.id, MOD))?.created).toBe(true);
    expect(await getRpTotal(local.db, "u1")).toBe(50);
  });

  it("only lets moderators, admins and the system award verified events", async () => {
    await expect(recordBuilderEvent(local.db, eventInput("api-1", { actorRole: "api", source: "api" }))).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      recordBuilderEvent(local.db, eventInput("member-1", { actorRole: "member", source: "member" }))
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      recordBuilderEvent(local.db, eventInput("future", { occurredAt: new Date(Date.now() + 3_600_000) }))
    ).rejects.toMatchObject({ status: 400 });

    const selfReported = await verifiedEvent("self-1", { actorRole: "member", source: "member", verification: "self_reported" });
    expect(await awardForEventDetailed(local.db, selfReported.id, MOD)).toMatchObject({ entry: null, reason: "insufficient_verification" });
    await expect(awardForEvent(local.db, selfReported.id, { actorId: "u1", actorRole: "member" })).rejects.toMatchObject({ status: 403 });
    await expect(awardForEvent(local.db, selfReported.id, { actorId: "key", actorRole: "agent" })).rejects.toMatchObject({ status: 403 });

    const noProject = await verifiedEvent("np-1", { projectId: null });
    expect(await awardForEventDetailed(local.db, noProject.id, MOD)).toMatchObject({ reason: "project_required" });
  });

  it("reports totals per stage and pages the ledger newest first", async () => {
    for (let i = 0; i < 3; i++) await awardForEvent(local.db, (await verifiedEvent(`t-post-${i}`, { occurredAt: at(i) })).id, MOD);
    await awardForEvent(local.db, (await verifiedEvent("t-mvp", { eventType: "build_mvp", occurredAt: at(5) })).id, MOD);
    const help = await verifiedEvent("t-help", {
      eventType: "contribute_peer_help",
      projectId: null,
      verification: "peer_confirmed",
      occurredAt: at(6),
      payload: { counterpartyUserId: "u2" },
    });
    await awardForEvent(local.db, help.id, MOD);

    expect(await getStageTotals(local.db, "u1")).toEqual({ validate: 0, build: 30, ship: 30, contribute: 8 });
    expect(await getStageTotals(local.db, "u1", { from: at(4) })).toEqual({ validate: 0, build: 30, ship: 0, contribute: 8 });
    expect(await getRpTotal(local.db, "u1")).toBe(68);
    expect(await getRpTotal(local.db, "u2")).toBe(0);

    const first = await getLedger(local.db, "u1", { limit: 2 });
    expect(first.items.map((e) => e.awardType)).toEqual(["contribute_peer_help", "build_mvp"]);
    const second = await getLedger(local.db, "u1", { limit: 2, cursor: parseCursor(first.nextCursor) });
    const third = await getLedger(local.db, "u1", { limit: 2, cursor: parseCursor(second.nextCursor) });
    expect([...second.items, ...third.items].map((e) => e.occurredAt.getTime())).toEqual([at(2), at(1), at(0)].map((d) => d.getTime()));
    expect(third.nextCursor).toBeNull();
  });
});
