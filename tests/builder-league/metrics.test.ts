import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pageSession = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string } }));

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
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => (pageSession.user ? { user: pageSession.user } : null) } }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");
  return {
    Link: ({ href, children, ...rest }: { href: string; children?: unknown }) => createElement("a", { href, ...rest }, children as never),
    getPathname: ({ href }: { href: string }) => href,
  };
});
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      BUILDER_EVIDENCE: (globalThis as { __BUILDER_EVIDENCE__?: unknown }).__BUILDER_EVIDENCE__,
      BUILDER_LEAGUE_ENABLED: process.env.BUILDER_LEAGUE_ENABLED,
    },
  }),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { eq, type InferInsertModel } from "drizzle-orm";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { runWithDb } from "@/lib/db";
import {
  activityEvidence,
  builderEvents,
  builderModerationActions,
  builderPilotMembers,
  builderShareLinks,
  evidenceAppeals,
  rewardClaims,
  rewardItems,
  scoreLedger,
  seasonEnrollments,
  shareAttributions,
  yearlySnapshots,
} from "@/lib/db/schema";
import { BuilderApiError } from "@/lib/builder-league/http";
import { periodKey } from "@/lib/builder-league/time-windows";
import { getBuilderMetrics, parseMetricsWindow, quantile, type DistributionCohort } from "@/lib/builder-league/metrics";
import { getMetricsCopy } from "@/content/builder-league/metrics-copy";
import MetricsPage from "@/app/[locale]/studio/builder-league/metrics/page";
import { TEST_NOW, createLeagueEnv, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;

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
  pageSession.user = null;
  await env.reset();
  await seedMembers(env.db);
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);
/** 10:00 local time (UTC+7) on the given date. */
const at = (key: string, hour = 10) => new Date(Date.parse(`${key}T${String(hour).padStart(2, "0")}:00:00Z`) - 7 * 3_600_000);

type EventSeed = {
  id: string;
  user: string;
  kind?: "activity" | "backfill" | "reversal";
  stage: "validate" | "build" | "ship" | "contribute";
  type: string;
  verification?: "self_reported" | "peer_confirmed" | "moderator_verified" | "system_verified";
  occurred: string;
  received?: string;
  supersedes?: string;
};

const event = (seed: EventSeed) => ({
  id: seed.id,
  eventId: `evt-${seed.id}`,
  kind: seed.kind ?? "activity",
  subjectUserId: seed.user,
  actorRole: "member" as const,
  stage: seed.stage,
  eventType: seed.type,
  source: seed.kind === "backfill" ? ("backfill" as const) : ("member" as const),
  externalEventId: seed.id,
  dedupeKey: `dedupe-${seed.id}`,
  occurredAt: at(seed.occurred),
  receivedAt: at(seed.received ?? seed.occurred),
  rulesetVersion: "v2",
  verification: seed.verification ?? "moderator_verified",
  supersedesEventId: seed.supersedes ?? null,
});

type EvidenceSeed = {
  id: string;
  user: string;
  type: string;
  stage: "validate" | "build" | "ship" | "contribute";
  created: string;
  status?: "submitted" | "approved" | "rejected" | "withdrawn";
  decided?: string;
  counterparty?: string;
  confirmed?: string;
};

const evidence = (seed: EvidenceSeed) => ({
  id: seed.id,
  userId: seed.user,
  eventType: seed.type,
  stage: seed.stage,
  title: seed.id,
  occurredAt: at(seed.created),
  source: "member" as const,
  clientKey: seed.id,
  status: seed.status ?? "submitted",
  decidedAt: seed.decided ? at(seed.decided) : null,
  decidedBy: seed.decided ? "admin" : null,
  counterpartyUserId: seed.counterparty ?? null,
  counterpartyConfirmedAt: seed.confirmed ? at(seed.confirmed) : null,
  createdAt: at(seed.created),
  updatedAt: at(seed.created),
});

const ledger = (id: string, user: string, stage: "validate" | "build" | "ship" | "contribute", rp: number, occurred: string, created = occurred, reverses?: string) => ({
  id,
  userId: user,
  eventId: `evt-${id}`,
  awardType: reverses ? "reversal" : "activity",
  stage,
  rp,
  rulesetVersion: "v2",
  dedupeKey: `ledger-${id}`,
  reversesEntryId: reverses ?? null,
  occurredAt: at(occurred),
  createdAt: at(created),
});

/**
 * Alice, Bob and Carol are pilot members with submissions; the outsider has activity but is not
 * enrolled, so it must never count as an active member. Every expected number below is derived by hand
 * from these rows.
 */
async function seedDataset() {
  const db = env.db;
  // One statement per row: D1 caps bound parameters per statement.
  const rows = <T extends AnySQLiteTable>(table: T, values: InferInsertModel<T>[]) => values.map((value) => db.insert(table).values(value as never));
  await db.batch([
    db.update(builderPilotMembers).set({ addedAt: at("2026-06-01") }).where(eq(builderPilotMembers.userId, "alice")),
    db.update(builderPilotMembers).set({ addedAt: at("2026-06-01") }).where(eq(builderPilotMembers.userId, "bob")),
    db.update(builderPilotMembers).set({ addedAt: at("2026-10-01") }).where(eq(builderPilotMembers.userId, "carol")),
    db.insert(builderPilotMembers).values({ userId: "mod2", addedBy: "admin", addedAt: at("2026-11-01") }),
    db.insert(seasonEnrollments).values({ userId: "carol", seasonKey: "2026-s2", track: "build", joinedAt: at("2026-09-20") }),
    ...rows(activityEvidence, [
      evidence({ id: "ev-a1", user: "alice", type: "validate_problem_signal", stage: "validate", created: "2026-06-10" }),
      evidence({ id: "ev-ph1", user: "bob", type: "contribute_peer_help", stage: "contribute", created: "2026-07-01", status: "approved", decided: "2026-07-03", counterparty: "alice", confirmed: "2026-07-02" }),
      evidence({ id: "ev-ph2", user: "alice", type: "contribute_peer_help", stage: "contribute", created: "2026-07-02", counterparty: "bob", confirmed: "2026-07-02" }),
      evidence({ id: "ev-a3", user: "alice", type: "contribute_peer_help", stage: "contribute", created: "2026-08-01", status: "withdrawn", counterparty: "carol" }),
      evidence({ id: "ev-b2", user: "bob", type: "ship_public_post", stage: "ship", created: "2026-09-15", status: "approved", decided: "2026-09-16" }),
      evidence({ id: "ev-ph3", user: "carol", type: "contribute_peer_help", stage: "contribute", created: "2026-10-05", status: "rejected", decided: "2026-10-06", counterparty: "alice" }),
      evidence({ id: "ev-c2", user: "carol", type: "build_mvp", stage: "build", created: "2026-11-03" }),
      evidence({ id: "ev-o1", user: "outsider", type: "ship_public_post", stage: "ship", created: "2026-05-01", status: "rejected", decided: "2026-10-08" }),
    ]),
    ...rows(builderEvents, [
      event({ id: "a0", user: "alice", kind: "backfill", stage: "ship", type: "ship_public_post", verification: "system_verified", occurred: "2026-05-01", received: "2026-06-02" }),
      event({ id: "a1", user: "alice", stage: "validate", type: "validate_problem_signal", occurred: "2026-06-15" }),
      event({ id: "a2", user: "alice", stage: "build", type: "build_first_real_user", occurred: "2026-07-10" }),
      event({ id: "b1", user: "bob", stage: "contribute", type: "contribute_peer_help", verification: "peer_confirmed", occurred: "2026-07-05" }),
      event({ id: "b2", user: "bob", stage: "ship", type: "ship_public_post", occurred: "2026-07-20" }),
      event({ id: "b2r", user: "bob", kind: "reversal", stage: "ship", type: "ship_public_post", occurred: "2026-07-20", received: "2026-07-21", supersedes: "b2" }),
      event({ id: "b3", user: "bob", stage: "validate", type: "validate_problem_signal", occurred: "2026-10-20" }),
      event({ id: "b4", user: "bob", stage: "ship", type: "ship_public_post", occurred: "2026-05-15" }),
      event({ id: "b5", user: "bob", stage: "ship", type: "ship_public_post", occurred: "2026-05-20" }),
      event({ id: "c1", user: "carol", stage: "build", type: "build_mvp", occurred: "2026-10-10" }),
      event({ id: "c2", user: "carol", stage: "validate", type: "validate_problem_signal", verification: "self_reported", occurred: "2026-11-05" }),
      event({ id: "o1", user: "outsider", stage: "ship", type: "ship_public_post", occurred: "2026-11-10" }),
    ]),
    ...rows(scoreLedger, [
      ledger("l1", "alice", "validate", 10, "2026-06-15"),
      ledger("l2", "alice", "build", 20, "2026-07-10"),
      ledger("l3", "bob", "contribute", 5, "2026-07-05"),
      ledger("l4", "bob", "ship", 30, "2026-07-20"),
      ledger("l5", "bob", "ship", -30, "2026-07-20", "2026-07-21", "l4"),
      ledger("l6", "carol", "build", 15, "2026-10-10"),
      ledger("l7", "bob", "validate", 10, "2026-10-20"),
      ledger("l8", "outsider", "ship", 50, "2026-11-10"),
    ]),
    ...rows(builderModerationActions, [
      { id: "m1", targetType: "evidence", targetId: "ev-ph3", action: "reject", actorId: "admin", actorRole: "admin", reasonCodes: ["insufficient_evidence", "duplicate"], createdAt: at("2026-10-06") },
      { id: "m2", targetType: "evidence", targetId: "ev-o1", action: "reject", actorId: "admin", actorRole: "admin", reasonCodes: ["insufficient_evidence"], createdAt: at("2026-10-08") },
      { id: "m3", targetType: "evidence", targetId: "ev-old", action: "reject", actorId: "admin", actorRole: "admin", reasonCodes: ["spam"], createdAt: at("2026-05-20") },
      { id: "m4", targetType: "evidence", targetId: "ev-b2", action: "approve", actorId: "admin", actorRole: "admin", reasonCodes: ["ignored"], createdAt: at("2026-09-16") },
    ]),
    ...rows(evidenceAppeals, [
      { id: "ap1", evidenceId: "ev-ph3", userId: "carol", reason: "It happened", createdAt: at("2026-10-07") },
      { id: "ap2", evidenceId: "ev-o1", userId: "outsider", reason: "Please look again", status: "upheld", resolvedBy: "admin", resolvedAt: at("2026-10-10"), createdAt: at("2026-10-09") },
    ]),
    ...rows(rewardItems, [
      { id: "r-limited", key: "limited", kind: "perk", title: { en: "Limited perk", vi: "Ưu đãi giới hạn" }, description: { en: "x", vi: "x" }, inventory: 3, active: true, createdAt: at("2026-05-01") },
      { id: "r-open", key: "open", kind: "perk", title: { en: "Open perk", vi: "Ưu đãi mở" }, description: { en: "x", vi: "x" }, inventory: null, active: true, createdAt: at("2026-05-02") },
    ]),
    ...rows(rewardClaims, [
      { id: "rc1", rewardId: "r-limited", userId: "alice", periodKey: "2026-10", status: "requested", createdAt: at("2026-10-01") },
      { id: "rc2", rewardId: "r-limited", userId: "bob", periodKey: "2026-10", status: "redeemed", createdAt: at("2026-10-02") },
      { id: "rc3", rewardId: "r-limited", userId: "carol", periodKey: "2026-05", status: "approved", createdAt: at("2026-05-10") },
      { id: "rc4", rewardId: "r-limited", userId: "outsider", periodKey: "2026-10", status: "rejected", createdAt: at("2026-10-03") },
      { id: "rc5", rewardId: "r-open", userId: "alice", periodKey: "2026-10", status: "redeemed", createdAt: at("2026-10-04") },
    ]),
    ...rows(yearlySnapshots, [
      { id: "ys-a", userId: "alice", year: 2026, rulesetVersion: "v2", data: {}, createdAt: at("2026-11-01") },
      { id: "ys-b", userId: "bob", year: 2026, rulesetVersion: "v2", data: {}, createdAt: at("2026-11-02") },
      { id: "ys-c", userId: "carol", year: 2025, rulesetVersion: "v1", data: {}, createdAt: at("2026-05-01") },
    ]),
    ...rows(builderShareLinks, [
      { id: "sl-a", tokenHash: "hash-a", userId: "alice", kind: "year_review", year: 2026, createdAt: at("2026-11-03") },
      { id: "sl-b", tokenHash: "hash-b", userId: "bob", kind: "passport", createdAt: at("2026-11-03") },
    ]),
    ...rows(shareAttributions, [
      { id: "sa1", shareLinkId: "sl-a", kind: "visit", createdAt: at("2026-11-04") },
      { id: "sa2", shareLinkId: "sl-a", kind: "visit", createdAt: at("2026-11-05") },
      { id: "sa3", shareLinkId: "sl-a", kind: "visit", createdAt: at("2026-11-06") },
      { id: "sa4", shareLinkId: "sl-a", kind: "signup", userId: "outsider", createdAt: at("2026-11-05") },
      { id: "sa5", shareLinkId: "sl-a", kind: "signup", userId: "mod2", createdAt: at("2026-11-06") },
      { id: "sa6", shareLinkId: "sl-a", kind: "paid", userId: "outsider", createdAt: at("2026-11-07") },
      { id: "sa7", shareLinkId: "sl-b", kind: "visit", createdAt: at("2026-11-07") },
    ]),
  ]);
}

const WINDOW = { from: "2026-06-01", to: "2026-11-20" };
const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator > 0 ? numerator / denominator : null });
const cohort = (metrics: { distribution: DistributionCohort[] }, key: DistributionCohort["key"]) => metrics.distribution.find((row) => row.key === key);

describe("metrics window", () => {
  it("defaults to the last 90 local days ending today", () => {
    const window = parseMetricsWindow({}, TEST_NOW);
    expect(window).toMatchObject({ fromKey: "2026-08-23", toKey: "2026-11-20", days: 90 });
    expect(window.start.toISOString()).toBe("2026-08-22T17:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-20T16:59:59.999Z");
  });

  it("accepts an explicit inclusive range up to 731 days", () => {
    expect(parseMetricsWindow(WINDOW, TEST_NOW).days).toBe(173);
    expect(parseMetricsWindow({ from: "2024-11-20", to: "2026-11-20" }, TEST_NOW).days).toBe(731);
  });

  it.each([
    [{ from: "2026-02-30" }],
    [{ to: "20261120" }],
    [{ to: "2026-11-21" }],
    [{ from: "2026-11-10", to: "2026-11-01" }],
    [{ from: "2024-11-19", to: "2026-11-20" }],
  ])("rejects %j with a 400", (input) => {
    let error: unknown;
    try {
      parseMetricsWindow(input, TEST_NOW);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(BuilderApiError);
    expect(error).toMatchObject({ status: 400, code: "invalid_window" });
  });

  it("interpolates quantiles linearly", () => {
    expect(quantile([30, 15, 15], 0.75)).toBe(22.5);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("dashboard metrics on a seeded league", () => {
  it("computes every metric with its numerator, denominator and window", async () => {
    await seedDataset();
    const window = parseMetricsWindow(WINDOW, TEST_NOW);
    const m = await getBuilderMetrics(env.db, window, TEST_NOW);

    expect(m.window).toEqual({ fromKey: "2026-06-01", toKey: "2026-11-20", days: 173, start: "2026-05-31T17:00:00.000Z", end: "2026-11-20T16:59:59.999Z" });
    expect(m.activeMembers).toBe(3);

    expect(m.northStar).toEqual({
      horizonDays: 90,
      cohort: 3,
      pending: 1,
      reached: ratio(1, 2),
      reachedPending: 1,
      cohortWindow: { start: "2026-05-31T17:00:00.000Z", end: "2026-11-20T16:59:59.999Z" },
    });

    expect(m.timeToFirst[0]).toMatchObject({ key: "problem_signal", reached: ratio(2, 3), medianDays: 58, minDays: 5, maxDays: 111 });
    expect(m.timeToFirst[1]).toMatchObject({ key: "customer_or_payment", reached: ratio(1, 3), medianDays: 30, minDays: 30, maxDays: 30 });

    expect(m.activity.months.map((p) => [p.key, p.active])).toEqual([
      ["2026-06", ratio(1, 1)],
      ["2026-07", ratio(2, 2)],
      ["2026-08", ratio(0, 2)],
      ["2026-09", ratio(0, 2)],
      ["2026-10", ratio(2, 3)],
      ["2026-11", ratio(0, 3)],
    ]);
    expect(m.activity.months[0].range).toEqual({ start: "2026-05-31T17:00:00.000Z", end: "2026-06-30T16:59:59.999Z" });
    expect(m.activity.weeks).toHaveLength(12);
    const week = (key: string) => m.activity.weeks.find((p) => p.key === periodKey("week", at(key)))?.active;
    expect(week("2026-10-10")).toEqual(ratio(1, 3));
    expect(week("2026-10-20")).toEqual(ratio(1, 3));
    expect(week("2026-11-10")).toEqual(ratio(0, 3));

    expect(m.peerHelp).toEqual({
      submitted: 4,
      confirmed: 2,
      approved: 1,
      confirmedApproved: ratio(1, 4),
      rejected: 1,
      open: 1,
      withdrawn: 1,
      helpers: 3,
      helped: 3,
      reciprocalPairs: 1,
    });

    expect(m.retention).toEqual([
      { cohort: "2026-06", size: 1, months: [{ offset: 1, month: "2026-07", active: ratio(1, 1) }, { offset: 2, month: "2026-08", active: ratio(1, 1) }, { offset: 3, month: "2026-09", active: ratio(0, 1) }] },
      { cohort: "2026-07", size: 1, months: [{ offset: 1, month: "2026-08", active: ratio(0, 1) }, { offset: 2, month: "2026-09", active: ratio(1, 1) }, { offset: 3, month: "2026-10", active: ratio(0, 1) }] },
      { cohort: "2026-10", size: 1, months: [{ offset: 1, month: "2026-11", active: ratio(1, 1) }, null, null] },
    ]);

    expect(m.rewards.items).toEqual([
      {
        rewardId: "r-limited",
        key: "limited",
        title: { en: "Limited perk", vi: "Ưu đãi giới hạn" },
        active: true,
        remaining: 3,
        capacity: 6,
        claims: { requested: 1, approved: 0, rejected: 1, redeemed: 1, expired: 0, cancelled: 0 },
        redeemed: ratio(1, 3),
        heldAllTime: 2,
        redeemedAllTime: 1,
      },
      {
        rewardId: "r-open",
        key: "open",
        title: { en: "Open perk", vi: "Ưu đãi mở" },
        active: true,
        remaining: null,
        capacity: null,
        claims: { requested: 0, approved: 0, rejected: 0, redeemed: 1, expired: 0, cancelled: 0 },
        redeemed: ratio(1, 1),
        heldAllTime: 0,
        redeemedAllTime: 1,
      },
    ]);
    expect(m.rewards).toMatchObject({ claims: 4, redeemed: ratio(2, 4), capacityUsed: ratio(1, 6) });

    expect(m.integrity).toEqual({
      rejection: ratio(2, 4),
      approved: 2,
      rejected: 2,
      reasonCodes: [
        { code: "insufficient_evidence", count: 2 },
        { code: "duplicate", count: 1 },
      ],
      reversals: ratio(1, 7),
      reversedRp: 30,
      appeals: { opened: 2, open: 1, upheld: 1, overturned: 0, withdrawn: 0 },
    });

    expect(m.wrapped).toEqual({ completed: 2, shared: ratio(1, 2), visits: 3, signups: ratio(2, 3), paid: ratio(1, 2) });

    expect(cohort(m, "all")).toEqual({ key: "all", members: 3, scored: ratio(3, 3), p25: 15, median: 15, p75: 22.5, max: 30 });
    expect(cohort(m, "newcomers")).toEqual({ key: "newcomers", members: 1, scored: ratio(1, 1), p25: 15, median: 15, p75: 15, max: 15 });
    expect(cohort(m, "established")).toEqual({ key: "established", members: 2, scored: ratio(2, 2), p25: 18.75, median: 22.5, p75: 26.25, max: 30 });
    expect(cohort(m, "specialist_validate")).toMatchObject({ members: 1, max: 15 });
    expect(cohort(m, "specialist_build")).toMatchObject({ members: 2, p25: 18.75, max: 30 });
    expect(cohort(m, "specialist_ship")).toEqual({ key: "specialist_ship", members: 0, scored: ratio(0, 0), p25: null, median: null, p75: null, max: null });
    expect(cohort(m, "specialist_contribute")).toMatchObject({ members: 0 });
    expect(cohort(m, "contributors")).toMatchObject({ members: 1, max: 15 });

    expect(m.pilot).toEqual({
      weeks: 8,
      enrolled: 4,
      pending: 1,
      evaluated: 3,
      before: { withEvent: ratio(2, 3), events: 3, importedEvents: 1, meanPerMember: 1, medianPerMember: 1 },
      after: { withEvent: ratio(3, 3), events: 4, importedEvents: 0, meanPerMember: 4 / 3, medianPerMember: 1 },
      improved: ratio(2, 3),
      unchanged: ratio(0, 3),
      declined: ratio(1, 3),
      enrollmentWindow: { start: "2026-05-31T17:00:00.000Z", end: "2026-11-20T16:59:59.999Z" },
    });
  });

  it("returns zero denominators and null rates on an empty league", async () => {
    const m = await getBuilderMetrics(env.db, parseMetricsWindow({}, TEST_NOW), TEST_NOW);
    expect(m.activeMembers).toBe(0);
    expect(m.northStar.reached).toEqual(ratio(0, 0));
    expect(m.timeToFirst[0]).toMatchObject({ reached: ratio(0, 0), medianDays: null });
    expect(m.retention).toEqual([]);
    expect(m.wrapped.signups.rate).toBeNull();
    expect(m.pilot.evaluated).toBe(0);
  });

  it("only counts what falls inside a narrower window", async () => {
    await seedDataset();
    const m = await getBuilderMetrics(env.db, parseMetricsWindow({ from: "2026-10-01", to: "2026-10-31" }, TEST_NOW), TEST_NOW);
    expect(m.northStar).toMatchObject({ cohort: 1, pending: 1, reached: ratio(0, 0), reachedPending: 1 });
    expect(m.activity.months.map((p) => p.key)).toEqual(["2026-10"]);
    expect(m.peerHelp.submitted).toBe(1);
    expect(m.integrity).toMatchObject({ rejection: ratio(2, 2), reversals: ratio(0, 2) });
    expect(m.wrapped.completed).toBe(0);
    expect(m.pilot).toMatchObject({ enrolled: 0 });
  });
});

describe("metrics page access", () => {
  const props = (query: Record<string, string> = {}) => ({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(query) });
  const signIn = (id: string | null) => {
    pageSession.user = id ? { id, name: id, email: `${id}@example.com`, role: id === "admin" ? "admin" : "user" } : null;
  };
  const notFoundError = expect.objectContaining({ digest: expect.stringContaining("404") });

  it("is a 404 for signed-out visitors and members, even pilot members", async () => {
    signIn(null);
    await expect(call(() => MetricsPage(props()))).rejects.toEqual(notFoundError);
    signIn("alice");
    await expect(call(() => MetricsPage(props()))).rejects.toEqual(notFoundError);
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    await expect(call(() => MetricsPage(props()))).rejects.toEqual(notFoundError);
  });

  it("renders the dashboard for admins, server-side and with every number's basis", async () => {
    await seedDataset();
    signIn("admin");
    const html = renderToStaticMarkup(await call(() => MetricsPage(props(WINDOW))));
    const copy = getMetricsCopy("en");
    expect(html).toContain(copy.title);
    expect(html).toContain(copy.northStar.title);
    expect(html).toContain(copy.pilot.title);
    expect(html).toContain('method="get"');
    expect(html).toContain('value="2026-06-01"');
    expect(html).toContain("1 / 2");
    expect(html).not.toContain('role="alert"');
  });

  it("falls back to the default window and says so when the query is invalid", async () => {
    signIn("admin");
    const html = renderToStaticMarkup(await call(() => MetricsPage(props({ from: "2026-13-01" }))));
    expect(html).toContain('role="alert"');
    expect(html).toContain(getMetricsCopy("en").form.invalid);
    expect(html).toContain('value="2026-08-23"');
  });

  it("renders Vietnamese copy", async () => {
    signIn("admin");
    const html = renderToStaticMarkup(await call(() => MetricsPage({ ...props(), params: Promise.resolve({ locale: "vi" }) })));
    expect(html).toContain(getMetricsCopy("vi").title);
  });
});
