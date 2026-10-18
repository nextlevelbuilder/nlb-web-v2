import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { communityWrappedSnapshots, renderJobs, users, yearlySnapshots } from "@/lib/db/schema";
import { communityWrappedYears, dueYear, runBuilderLeagueCron, type BuilderLeagueCronEnv } from "@/lib/builder-league/cron";
import { ensureYearSnapshot, snapshotData } from "@/lib/builder-league/year-review";
import { local, seedEvent } from "./year-review-fixtures";

let t: LocalD1;
const env = { DB: undefined as unknown as D1Database } satisfies BuilderLeagueCronEnv;

beforeAll(async () => {
  t = await createLocalD1();
  await t.db.insert(users).values([
    { id: "u1", name: "One", email: "u1@example.com" },
    { id: "u2", name: "Two", email: "u2@example.com" },
    { id: "mod", name: "Mod", email: "mod@example.com", role: "admin" },
  ]);
  await seedEvent(t.db, { id: "u1-launch", eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 1), visibility: "public" });
  await seedEvent(t.db, { id: "u2-mvp", subjectUserId: "u2", eventType: "build_mvp", stage: "build", occurredAt: local(2026, 8, 1) });
});

afterAll(async () => {
  await t.dispose();
});

describe("builder league cron", () => {
  it("knows which year is due at UTC+7 boundaries", () => {
    expect(dueYear(local(2026, 10, 17))).toBeNull();
    expect(dueYear(local(2026, 12, 30, 23, 59))).toBeNull();
    expect(dueYear(local(2026, 12, 31, 0, 1))).toEqual({ year: 2026, status: "provisional" });
    expect(dueYear(local(2027, 1, 3))).toEqual({ year: 2026, status: "provisional" });
    expect(dueYear(local(2027, 1, 8, 0, 0))).toEqual({ year: 2026, status: "final" });
    expect(dueYear(local(2027, 6, 1))).toBeNull();
  });

  it("refreshes Community Wrapped for the previous and current year from the league's first year on", () => {
    expect(communityWrappedYears(local(2026, 10, 17))).toEqual([2026]);
    expect(communityWrappedYears(local(2027, 1, 3))).toEqual([2026, 2027]);
  });

  it("keeps the current Community Wrapped fresh but builds no year snapshots before the provisional cutoff", async () => {
    const result = await runBuilderLeagueCron(env, "0 * * * *", local(2026, 10, 17), t.db);
    expect(result).toMatchObject({ yearSnapshots: null, communityWrapped: [{ year: 2026, status: "provisional", created: true }], errors: [] });
    expect(await t.db.select().from(yearlySnapshots)).toHaveLength(0);
    const again = await runBuilderLeagueCron(env, "0 * * * *", local(2026, 10, 17, 1), t.db);
    expect(again.communityWrapped).toEqual([{ year: 2026, status: "provisional", created: false }]);
  });

  it("publishes provisional snapshots, confirms unchanged earlier ones, catches up idempotently, then freezes the final ones", async () => {
    const early = await ensureYearSnapshot(t.db, "u1", 2026, local(2026, 12, 20));
    const first = await runBuilderLeagueCron(env, "0 * * * *", local(2026, 12, 31, 1), t.db);
    expect(first.errors).toEqual([]);
    expect(first.yearSnapshots).toEqual({ year: 2026, status: "provisional", created: 1, pending: 0 });
    const [confirmed] = await t.db.select().from(yearlySnapshots).where(eq(yearlySnapshots.id, early.snapshot.id));
    expect(confirmed.provenance).toMatchObject({ confirmedAt: local(2026, 12, 31, 1).getTime() });
    expect(confirmed.data).toEqual(early.snapshot.data);
    // Nothing new since the mid-year refresh, so no new version.
    expect(first.communityWrapped).toEqual([{ year: 2026, status: "provisional", created: false }]);

    const second = await runBuilderLeagueCron(env, "0 * * * *", local(2026, 12, 31, 2), t.db);
    expect(second.yearSnapshots).toEqual({ year: 2026, status: "provisional", created: 0, pending: 0 });
    expect(second.communityWrapped).toEqual([{ year: 2026, status: "provisional", created: false }]);

    const final = await runBuilderLeagueCron(env, "0 * * * *", local(2027, 1, 8, 1), t.db);
    expect(final.yearSnapshots).toEqual({ year: 2026, status: "final", created: 2, pending: 0 });
    expect(final.communityWrapped).toEqual([
      { year: 2026, status: "final", created: true },
      { year: 2027, status: "provisional", created: true },
    ]);
    const rows = await t.db.select().from(yearlySnapshots).where(and(eq(yearlySnapshots.userId, "u1"), eq(yearlySnapshots.status, "final")));
    expect(rows).toHaveLength(1);
    expect(snapshotData(rows[0]).milestones.map((m) => m.eventId)).toEqual(["u1-launch"]);
    expect(await t.db.select().from(communityWrappedSnapshots).where(eq(communityWrappedSnapshots.year, 2026))).toHaveLength(2);

    const rerun = await runBuilderLeagueCron(env, "0 * * * *", local(2027, 1, 8, 2), t.db);
    expect(rerun.yearSnapshots).toEqual({ year: 2026, status: "final", created: 0, pending: 0 });
  });


  it("expires stale queued render jobs even without a bucket", async () => {
    const [snapshot] = await t.db.select().from(yearlySnapshots).limit(1);
    await t.db.insert(renderJobs).values({
      userId: snapshot.userId, year: 2026, snapshotId: snapshot.id, format: "9x16", dedupeKey: "stale", createdAt: local(2027, 1, 1), updatedAt: local(2027, 1, 1),
    });
    const result = await runBuilderLeagueCron(env, "0 * * * *", local(2027, 6, 1), t.db);
    expect(result.renderJobsExpired).toBe(1);
    const [job] = await t.db.select().from(renderJobs).where(eq(renderJobs.dedupeKey, "stale"));
    expect(job.status).toBe("expired");
  });
});
