import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { eq } from "drizzle-orm";
import { runWithDb } from "@/lib/db";
import {
  builderEvents,
  builderModerationActions,
  builderPrivacy,
  builderProjects,
  leagueSnapshots,
  members,
  organizations,
  productRevisions,
  products,
  scoreLedger,
  submissions,
} from "@/lib/db/schema";
import { BACKFILL_PROVENANCE_SOURCE, runBackfill } from "@/lib/builder-league/backfill";
import { POST as backfillRoute } from "@/app/api/v1/builder-admin/backfill/route";
import { TEST_NOW, createLeagueEnv, formRequest, jsonRequest, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;
const ADMIN = { actorId: "admin", actorRole: "admin" as const };

/** Approved under ruleset v1 (before v2's effective date). */
const V1_APPROVAL = new Date("2026-06-15T09:30:00+07:00");
/** Approved under ruleset v2. */
const V2_APPROVAL = new Date("2026-11-05T14:00:00+07:00");
/** Legacy product without an approved submission: its creation date stands in for the launch. */
const LEGACY_CREATED = new Date("2026-03-01T08:00:00+07:00");

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
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
  await env.reset();
  await seedMembers(env.db);
  await seedDirectory();
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);

function product(id: string, orgId: string, status: string, createdAt = new Date("2026-05-01T00:00:00Z")) {
  return { id, orgId, slug: id, title: `Product ${id}`, tagline: `Tagline ${id}`, websiteUrl: `https://${id}.example`, status, createdAt };
}

function approved(productId: string, reviewedAt: Date, status = "approved") {
  return {
    revision: {
      id: `rev-${productId}-${reviewedAt.getTime()}`,
      productId,
      contentHash: "hash",
      title: productId,
      tagline: productId,
      description: productId,
      document: {},
      createdBy: "alice",
    },
    submission: { id: `sub-${productId}-${reviewedAt.getTime()}`, productId, revisionId: `rev-${productId}-${reviewedAt.getTime()}`, submitterId: "alice", status, reviewedAt },
  };
}

/**
 * Alice owns org-a (four products: v1 launch, v2 launch, legacy without a submission, draft) and is only a
 * member of org-c (one published product that is not hers). Bob owns org-b and did not opt in.
 */
async function seedDirectory() {
  const approvals = [
    approved("launch-v1", V1_APPROVAL),
    approved("launch-v1", new Date("2026-07-01T00:00:00Z")), // a later re-approval keeps the original date
    approved("launch-v1", new Date("2026-05-01T00:00:00Z"), "rejected"),
    approved("launch-v2", V2_APPROVAL),
    approved("bob-launch", V1_APPROVAL),
    approved("not-hers", V1_APPROVAL),
  ];
  await env.db.batch([
    env.db.insert(organizations).values([
      { id: "org-a", name: "A", slug: "org-a" },
      { id: "org-b", name: "B", slug: "org-b" },
      { id: "org-c", name: "C", slug: "org-c" },
    ]),
    env.db.insert(members).values([
      { id: "m1", organizationId: "org-a", userId: "alice", role: "owner" },
      { id: "m2", organizationId: "org-b", userId: "bob", role: "owner" },
      { id: "m3", organizationId: "org-c", userId: "alice", role: "member" },
      { id: "m4", organizationId: "org-c", userId: "carol", role: "owner" },
    ]),
    env.db.insert(products).values([
      product("launch-v1", "org-a", "published"),
      product("launch-v2", "org-a", "published"),
      product("legacy", "org-a", "published", LEGACY_CREATED),
      product("draft", "org-a", "draft"),
      product("bob-launch", "org-b", "published"),
      product("not-hers", "org-c", "published"),
    ]),
    env.db.insert(productRevisions).values(approvals.map((row) => row.revision)),
    env.db.insert(submissions).values(approvals.map((row) => row.submission)),
    env.db.insert(builderPrivacy).values([{ userId: "alice", backfillOptIn: true }]),
  ]);
}

describe("directory backfill", () => {
  it("plans without writing by default, only for members who opted in", async () => {
    const report = await runBackfill(env.db, {}, ADMIN);
    expect(report.dryRun).toBe(true);
    expect(report.users.map((user) => user.userId)).toEqual(["alice"]);
    expect(report.totals).toEqual({ created: 0, existing: 0, planned: 3, skipped: 0 });
    const items = Object.fromEntries(report.users[0].items.map((item) => [item.productId, item]));
    expect(Object.keys(items).sort()).toEqual(["launch-v1", "launch-v2", "legacy"]);
    expect(items["launch-v1"]).toMatchObject({ occurredAt: V1_APPROVAL.toISOString(), rulesetVersion: "v1", originalTable: "submissions" });
    expect(items["launch-v2"]).toMatchObject({ occurredAt: V2_APPROVAL.toISOString(), rulesetVersion: "v2" });
    expect(items["legacy"]).toMatchObject({ occurredAt: LEGACY_CREATED.toISOString(), originalTable: "products", originalId: "legacy" });
    expect(await env.db.select().from(builderEvents)).toHaveLength(0);
    expect(await env.db.select().from(builderProjects).where(eq(builderProjects.ownerUserId, "alice"))).toHaveLength(2);

    // Naming a member who did not opt in changes nothing.
    const bob = await runBackfill(env.db, { userIds: ["bob"], dryRun: false }, ADMIN);
    expect(bob.users).toEqual([{ userId: "bob", optedIn: false, items: [] }]);
    expect(await env.db.select().from(builderEvents)).toHaveLength(0);
  });

  it("imports launches at their original dates with provenance, scored by the ruleset in force then", async () => {
    const importedAt = new Date(TEST_NOW);
    const report = await runBackfill(env.db, { dryRun: false }, ADMIN, importedAt);
    expect(report.totals).toEqual({ created: 3, existing: 0, planned: 0, skipped: 0 });

    const events = await env.db.select().from(builderEvents);
    expect(events).toHaveLength(3);
    const byProduct = Object.fromEntries(events.map((event) => [(event.provenance as { productId: string }).productId, event]));
    expect(byProduct["launch-v1"]).toMatchObject({
      kind: "backfill",
      source: "backfill",
      subjectUserId: "alice",
      eventType: "ship_product_launch",
      stage: "ship",
      verification: "system_verified",
      visibility: "private",
      rulesetVersion: "v1",
      externalEventId: "product:launch-v1",
      occurredAt: V1_APPROVAL,
      provenance: {
        source: BACKFILL_PROVENANCE_SOURCE,
        importedAt: importedAt.toISOString(),
        originalTable: "submissions",
        originalId: `sub-launch-v1-${V1_APPROVAL.getTime()}`,
        productId: "launch-v1",
      },
    });
    expect(byProduct["launch-v2"]).toMatchObject({ rulesetVersion: "v2", occurredAt: V2_APPROVAL });
    expect(byProduct["legacy"]).toMatchObject({ rulesetVersion: "v1", occurredAt: LEGACY_CREATED, provenance: { originalTable: "products", originalId: "legacy" } });

    // One ledger entry per real launch, dated at the launch: no synthesized months or snapshots.
    const ledger = await env.db.select().from(scoreLedger).where(eq(scoreLedger.userId, "alice"));
    expect(ledger.map((entry) => [entry.occurredAt.toISOString(), entry.rulesetVersion, entry.rp]).sort()).toEqual(
      [
        [LEGACY_CREATED.toISOString(), "v1", 100],
        [V1_APPROVAL.toISOString(), "v1", 100],
        [V2_APPROVAL.toISOString(), "v2", 100],
      ].sort()
    );
    expect(await env.db.select().from(leagueSnapshots)).toHaveLength(0);

    // Each launch gets a private SHIP project linked to the directory product.
    const projects = await env.db.select().from(builderProjects).where(eq(builderProjects.productId, "launch-v1"));
    expect(projects).toEqual([expect.objectContaining({ ownerUserId: "alice", stage: "ship", visibility: "private" })]);
    expect(events.every((event) => event.projectId)).toBe(true);

    const audit = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.action, "backfill"));
    expect(audit).toEqual([expect.objectContaining({ targetId: "alice", actorId: "admin", reasonCodes: [BACKFILL_PROVENANCE_SOURCE] })]);
  });

  it("is idempotent across reruns and concurrent runs", async () => {
    await Promise.all([runBackfill(env.db, { dryRun: false }, ADMIN), runBackfill(env.db, { dryRun: false }, ADMIN)]);
    const rerun = await runBackfill(env.db, { dryRun: false }, ADMIN);
    expect(rerun.totals).toEqual({ created: 0, existing: 3, planned: 0, skipped: 0 });
    const dryRun = await runBackfill(env.db, {}, ADMIN);
    expect(dryRun.totals).toEqual({ created: 0, existing: 3, planned: 0, skipped: 0 });
    expect(await env.db.select().from(builderEvents)).toHaveLength(3);
    expect(await env.db.select().from(scoreLedger)).toHaveLength(3);
    expect((await env.db.select().from(builderProjects).where(eq(builderProjects.ownerUserId, "alice"))).length).toBe(5);
  });

  it("is admin-only, session-only and works from a plain HTML form", async () => {
    await expect(runBackfill(env.db, {}, { actorId: "alice", actorRole: "member" })).rejects.toMatchObject({ status: 403 });
    expect((await call(() => backfillRoute(jsonRequest("/x", "alice", {})))).status).toBe(404);
    expect((await call(() => backfillRoute(jsonRequest("/x", "admin", {}, { auth: "api_key" })))).status).toBe(403);
    expect((await call(() => backfillRoute(jsonRequest("/x", "admin", { dryRun: "nope" })))).status).toBe(400);

    const json = await call(() => backfillRoute(jsonRequest("/x", "admin", { userIds: ["alice"] })));
    expect((await json.json()).data.totals.planned).toBe(3);

    const form = new FormData();
    form.set("dryRun", "false");
    form.set("userIds", "alice\nbob");
    const response = await call(() => backfillRoute(formRequest("/api/v1/builder-admin/backfill", "admin", form)));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://nlb.test/studio/builder-league?notice=backfill_done_3");
    expect(await env.db.select().from(builderEvents)).toHaveLength(3);
  });
});
