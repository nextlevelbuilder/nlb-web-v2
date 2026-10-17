import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Switches that make the progression and directory hooks fail, to prove they are best-effort. */
const faults = vi.hoisted(() => ({ rank: false, project: false, rankCalls: [] as string[] }));

vi.mock("@/lib/auth-api-key", () => ({
  resolveCaller: async (headers: Headers) => {
    const id = headers.get("x-test-user");
    if (!id) return null;
    const role = id === "admin" || id === "mod2" ? "admin" : "user";
    return { user: { id, name: id, email: `${id}@example.com`, role, emailVerified: true }, authType: headers.get("x-test-auth") ?? "session" };
  },
}));
vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: undefined, vip: undefined },
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      BUILDER_EVIDENCE: (globalThis as { __BUILDER_EVIDENCE__?: unknown }).__BUILDER_EVIDENCE__,
      BUILDER_LEAGUE_ENABLED: process.env.BUILDER_LEAGUE_ENABLED,
    },
  }),
}));
vi.mock("@/lib/builder-league/ranks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder-league/ranks")>();
  return {
    ...actual,
    evaluateRank: async (...args: Parameters<typeof actual.evaluateRank>) => {
      faults.rankCalls.push(args[1]);
      if (faults.rank) throw new Error("rank evaluation unavailable");
      return actual.evaluateRank(...args);
    },
  };
});
vi.mock("@/lib/builder-league/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder-league/projects")>();
  return {
    ...actual,
    findOrCreateProductProject: async (...args: Parameters<typeof actual.findOrCreateProductProject>) => {
      if (faults.project) throw new Error("project store unavailable");
      return actual.findOrCreateProductProject(...args);
    },
  };
});

import { eq } from "drizzle-orm";
import {
  badgeAwards,
  builderEvents,
  builderPilotMembers,
  builderPrivacy,
  builderProjects,
  members,
  moderationCases,
  organizations,
  productRevisions,
  products,
  scoreCapSlots,
  scoreLedger,
  submissions,
} from "@/lib/db/schema";
import { submitEvidence } from "@/lib/builder-league/evidence";
import { decideEvidence } from "@/lib/builder-league/moderation";
import { createAppeal, resolveAppeal } from "@/lib/builder-league/appeals";
import { runBackfill } from "@/lib/builder-league/backfill";
import { recordDirectoryLaunch } from "@/lib/builder-league/directory-events";
import { recordModerationDecision } from "@/lib/domain/moderation";
import { TEST_NOW, V2_WEEK, createLeagueEnv, hoursAfter, longText, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;
const ADMIN = { actorId: "admin", actorRole: "admin" as const };

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: TEST_NOW });
  env = await createLeagueEnv();
});
afterAll(async () => {
  await env.dispose();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.setSystemTime(TEST_NOW);
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
  faults.rank = false;
  faults.project = false;
  faults.rankCalls.length = 0;
  await env.reset();
  await seedMembers(env.db);
});

const later = (minutes = 5) => vi.setSystemTime(new Date(Date.now() + minutes * 60_000));
const ledgerFor = (userId: string) => env.db.select().from(scoreLedger).where(eq(scoreLedger.userId, userId));
const badgesFor = async (userId: string) =>
  (await env.db.select().from(badgeAwards).where(eq(badgeAwards.userId, userId))).map((row) => row.badgeKey);

async function submitLaunch(userId = "alice") {
  const { evidence } = await submitEvidence(
    env.db,
    { userId, actorRole: "member" },
    {
      eventType: "ship_product_launch",
      projectId: `p-${userId}`,
      title: "Launched Alice app",
      summary: longText(160),
      occurredAt: hoursAfter(V2_WEEK, 2).toISOString(),
      links: ["https://alice.example/launch"],
    }
  );
  later();
  return evidence;
}

describe("progression refresh after RP is awarded", () => {
  it("evaluates rank and badges after a moderator approval", async () => {
    const evidence = await submitLaunch();
    const outcome = await decideEvidence(env.db, evidence.id, { decision: "approve" }, ADMIN);
    expect(outcome).toMatchObject({ decided: true, award: { created: true } });
    expect(faults.rankCalls).toEqual(["alice"]);
    expect(await badgesFor("alice")).toContain("first_ship");

    // A replayed approval awards nothing new, so it does not re-run the evaluation.
    await decideEvidence(env.db, evidence.id, { decision: "approve" }, ADMIN);
    expect(faults.rankCalls).toEqual(["alice"]);
  });

  it("evaluates rank and badges when an appeal is overturned", async () => {
    const evidence = await submitLaunch();
    await decideEvidence(env.db, evidence.id, { decision: "reject", reasonCodes: ["insufficient_evidence"] }, ADMIN);
    later();
    const appeal = await createAppeal(env.db, "alice", evidence.id, { reason: "The launch page is public; the link was mistyped and is now fixed." });
    later();
    await resolveAppeal(env.db, { evidenceId: evidence.id, appealId: appeal.id }, { outcome: "overturn", resolution: "Verified the launch." }, ADMIN);
    expect(faults.rankCalls).toEqual(["alice"]);
    expect(await badgesFor("alice")).toContain("first_ship");
  });

  it("records the role the approver actually decided in", async () => {
    const evidence = await submitLaunch();
    await decideEvidence(env.db, evidence.id, { decision: "approve" }, { actorId: "mod2", actorRole: "moderator" });
    const [event] = await launchEvents();
    expect(event).toMatchObject({ actorRole: "moderator", actorUserId: "mod2", source: "moderator", verification: "moderator_verified" });
    expect(await ledgerFor("alice")).toEqual([expect.objectContaining({ reason: "awarded_by:moderator:mod2" })]);

    const other = await submitLaunch("bob");
    await decideEvidence(env.db, other.id, { decision: "approve" }, ADMIN);
    expect(await ledgerFor("bob")).toEqual([expect.objectContaining({ reason: "awarded_by:admin:admin" })]);
  });

  it("keeps the award and the badges when the rank evaluation fails", async () => {
    faults.rank = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const evidence = await submitLaunch();
      const outcome = await decideEvidence(env.db, evidence.id, { decision: "approve" }, ADMIN);
      expect(outcome).toMatchObject({ decided: true, evidence: { status: "approved" }, award: { created: true } });
      expect(await ledgerFor("alice")).toEqual([expect.objectContaining({ rp: 100 })]);
      expect(await badgesFor("alice")).toContain("first_ship");
      expect(errors).toHaveBeenCalledWith(expect.stringContaining("rank evaluation after approval failed"), "rank evaluation unavailable");
    } finally {
      errors.mockRestore();
    }
  });
});

const APPROVED_AT = new Date("2026-11-10T09:00:00+07:00");

/** Alice owns org-a with product `prod-a`; her first revision waits in a moderation case. */
async function seedDirectory({ optIn = false } = {}) {
  await env.db.batch([
    env.db.insert(organizations).values({ id: "org-a", name: "A", slug: "org-a" }),
    env.db.insert(members).values({ id: "m1", organizationId: "org-a", userId: "alice", role: "owner" }),
    env.db.insert(products).values({
      id: "prod-a",
      orgId: "org-a",
      slug: "prod-a",
      title: "Product A",
      tagline: "Tagline A",
      websiteUrl: "https://prod-a.example",
      status: "draft",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    }),
    ...(optIn ? [env.db.insert(builderPrivacy).values({ userId: "alice", backfillOptIn: true })] : []),
  ]);
  return addRevision(1);
}

/** Adds revision `n` of `prod-a` with a pending submission and an open moderation case; returns the case id. */
async function addRevision(n: number) {
  await env.db.batch([
    env.db.insert(productRevisions).values({
      id: `rev-${n}`,
      productId: "prod-a",
      revisionNumber: n,
      contentHash: `hash-${n}`,
      title: "Product A",
      tagline: "Tagline A",
      description: "Product A",
      document: {},
      createdBy: "alice",
    }),
    env.db.insert(submissions).values({ id: `sub-${n}`, productId: "prod-a", revisionId: `rev-${n}`, submitterId: "alice", status: "pending" }),
    env.db.insert(moderationCases).values({ id: `case-${n}`, submissionId: `sub-${n}` }),
  ]);
  return `case-${n}`;
}

const approve = (caseId: string) =>
  recordModerationDecision({ caseId, decision: "approved", reasonCodes: ["ok"], humanReviewerId: "admin", reviewerRole: "admin" }, env.db);

const launchEvents = () => env.db.select().from(builderEvents).where(eq(builderEvents.eventType, "ship_product_launch"));

describe("directory launch events", () => {
  it("records one system-verified SHIP launch on the first approval and awards it", async () => {
    vi.setSystemTime(APPROVED_AT);
    await approve(await seedDirectory());

    const events = await launchEvents();
    expect(events).toEqual([
      expect.objectContaining({
        subjectUserId: "alice",
        source: "directory",
        externalEventId: "prod-a",
        verification: "system_verified",
        actorRole: "system",
        visibility: "private",
        occurredAt: APPROVED_AT,
      }),
    ]);
    expect(await ledgerFor("alice")).toEqual([expect.objectContaining({ rp: 100, stage: "ship", eventId: events[0].id })]);
    expect(faults.rankCalls).toEqual(["alice"]);
    expect(await badgesFor("alice")).toContain("first_ship");

    // A later revision of the same product is approved too, but the product launched once.
    later(60);
    await approve(await addRevision(2));
    expect(await launchEvents()).toHaveLength(1);
    expect(await ledgerFor("alice")).toHaveLength(1);

    // Replaying the first approval's hook is a no-op.
    const replay = await recordDirectoryLaunch(env.db, { submissionId: "sub-1", productId: "prod-a", submitterId: "alice", approvedAt: APPROVED_AT });
    expect(replay).toMatchObject({ status: "recorded", eventCreated: false });
    expect(await ledgerFor("alice")).toHaveLength(1);
  });

  it("never double-counts a launch the backfill already recorded, in either order", async () => {
    vi.setSystemTime(APPROVED_AT);
    await approve(await seedDirectory({ optIn: true }));
    later();
    const report = await runBackfill(env.db, { userIds: ["alice"], dryRun: false }, ADMIN);
    expect(report.users[0].items).toEqual([expect.objectContaining({ productId: "prod-a", action: "skipped", reason: "recorded_from_directory" })]);
    expect(await launchEvents()).toHaveLength(1);
    expect(await ledgerFor("alice")).toHaveLength(1);

    // Backfill first: the directory hook then skips the product.
    await env.reset();
    await seedMembers(env.db);
    vi.setSystemTime(APPROVED_AT);
    await seedDirectory({ optIn: true });
    await env.db.update(submissions).set({ status: "approved", reviewedAt: APPROVED_AT }).where(eq(submissions.id, "sub-1"));
    await env.db.update(products).set({ status: "published" }).where(eq(products.id, "prod-a"));
    later();
    await runBackfill(env.db, { userIds: ["alice"], dryRun: false }, ADMIN);
    expect(await launchEvents()).toEqual([expect.objectContaining({ source: "backfill" })]);
    expect(await recordDirectoryLaunch(env.db, { submissionId: "sub-1", productId: "prod-a", submitterId: "alice", approvedAt: APPROVED_AT })).toEqual({
      status: "skipped",
      reason: "already_recorded",
    });
    expect(await ledgerFor("alice")).toHaveLength(1);
  });

  it("writes nothing for a submitter without league access, who can still import the launch later", async () => {
    await env.db.delete(builderPilotMembers).where(eq(builderPilotMembers.userId, "alice"));
    vi.setSystemTime(APPROVED_AT);
    await approve(await seedDirectory({ optIn: true }));
    expect(await launchEvents()).toEqual([]);
    expect(await ledgerFor("alice")).toEqual([]);
    expect(await env.db.select().from(builderProjects).where(eq(builderProjects.productId, "prod-a"))).toEqual([]);
    expect(await env.db.select().from(scoreCapSlots)).toEqual([]);
    expect(faults.rankCalls).toEqual([]);
    expect(await recordDirectoryLaunch(env.db, { submissionId: "sub-1", productId: "prod-a", submitterId: "alice", approvedAt: APPROVED_AT })).toEqual({
      status: "skipped",
      reason: "no_league_access",
    });

    // Once in the league, the opt-in backfill imports the launch.
    await env.db.insert(builderPilotMembers).values({ userId: "alice", addedBy: "admin" });
    later();
    await runBackfill(env.db, { userIds: ["alice"], dryRun: false }, ADMIN);
    expect(await launchEvents()).toEqual([expect.objectContaining({ source: "backfill", subjectUserId: "alice" })]);
    expect(await ledgerFor("alice")).toEqual([expect.objectContaining({ rp: 100 })]);
  });

  it("launches a product once when two owners backfill it, even at the same time", async () => {
    vi.setSystemTime(APPROVED_AT);
    await seedDirectory({ optIn: true });
    await env.db.batch([
      env.db.insert(members).values({ id: "m2", organizationId: "org-a", userId: "bob", role: "owner" }),
      env.db.insert(builderPrivacy).values({ userId: "bob", backfillOptIn: true }),
      env.db.update(submissions).set({ status: "approved", reviewedAt: APPROVED_AT }).where(eq(submissions.id, "sub-1")),
      env.db.update(products).set({ status: "published" }).where(eq(products.id, "prod-a")),
    ]);
    later();
    const reports = await Promise.all([
      runBackfill(env.db, { userIds: ["alice"], dryRun: false }, ADMIN),
      runBackfill(env.db, { userIds: ["bob"], dryRun: false }, ADMIN),
    ]);
    const items = reports.flatMap((report) => report.users.flatMap((user) => user.items));
    expect(items.filter((item) => item.action === "created")).toHaveLength(1);
    expect(items.filter((item) => item.action === "skipped")).toEqual([expect.objectContaining({ reason: "launch_already_recorded" })]);
    expect(await launchEvents()).toHaveLength(1);
    expect((await ledgerFor("alice")).length + (await ledgerFor("bob")).length).toBe(1);

    // Dry runs report the same outcome without writing, and replays change nothing.
    const holder = (await launchEvents())[0].subjectUserId;
    const other = holder === "alice" ? "bob" : "alice";
    const dry = await runBackfill(env.db, { userIds: [other], dryRun: true }, ADMIN);
    expect(dry.users[0].items).toEqual([expect.objectContaining({ action: "skipped", reason: "launch_already_recorded" })]);
    const replay = await runBackfill(env.db, { userIds: [holder], dryRun: false }, ADMIN);
    expect(replay.users[0].items).toEqual([expect.objectContaining({ action: "existing" })]);
    expect(await launchEvents()).toHaveLength(1);
  });

  it("gives the launch claim back when a backfill fails before recording the launch", async () => {
    vi.setSystemTime(APPROVED_AT);
    await seedDirectory({ optIn: true });
    await env.db.update(submissions).set({ status: "approved", reviewedAt: APPROVED_AT }).where(eq(submissions.id, "sub-1"));
    await env.db.update(products).set({ status: "published" }).where(eq(products.id, "prod-a"));
    later();
    faults.project = true;
    await expect(runBackfill(env.db, { userIds: ["alice"], dryRun: false }, ADMIN)).rejects.toThrow("project store unavailable");
    expect(await env.db.select().from(scoreCapSlots)).toEqual([]);
    faults.project = false;
    await runBackfill(env.db, { userIds: ["alice"], dryRun: false }, ADMIN);
    expect(await launchEvents()).toEqual([expect.objectContaining({ source: "backfill", subjectUserId: "alice" })]);
  });

  it("evaluates rank and badges after a backfill that awarded RP", async () => {
    vi.setSystemTime(APPROVED_AT);
    await seedDirectory({ optIn: true });
    await env.db.update(submissions).set({ status: "approved", reviewedAt: APPROVED_AT }).where(eq(submissions.id, "sub-1"));
    await env.db.update(products).set({ status: "published" }).where(eq(products.id, "prod-a"));
    later();
    await runBackfill(env.db, { userIds: ["alice"], dryRun: true }, ADMIN);
    expect(faults.rankCalls).toEqual([]);
    await runBackfill(env.db, { userIds: ["alice"], dryRun: false }, ADMIN);
    expect(faults.rankCalls).toEqual(["alice"]);
    expect(await badgesFor("alice")).toContain("first_ship");
  });

  it("does not break the moderation decision when recording the launch fails", async () => {
    faults.project = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      vi.setSystemTime(APPROVED_AT);
      await expect(approve(await seedDirectory())).resolves.toBeDefined();
      const [product] = await env.db.select().from(products).where(eq(products.id, "prod-a"));
      expect(product.status).toBe("published");
      const [submission] = await env.db.select().from(submissions).where(eq(submissions.id, "sub-1"));
      expect(submission.status).toBe("approved");
      expect(await launchEvents()).toEqual([]);
      expect(errors).toHaveBeenCalledWith("builder league: directory launch event failed", "prod-a", "project store unavailable");
      // The failed hook gave its launch claim back, so the backfill can still import the launch.
      expect(await env.db.select().from(scoreCapSlots)).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("ignores non-approval decisions", async () => {
    vi.setSystemTime(APPROVED_AT);
    const caseId = await seedDirectory();
    await recordModerationDecision({ caseId, decision: "rejected", reasonCodes: ["spam"], humanReviewerId: "admin", reviewerRole: "admin" }, env.db);
    expect(await launchEvents()).toEqual([]);
  });
});
