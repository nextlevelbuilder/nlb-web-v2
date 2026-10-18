import { describe, expect, it } from "vitest";
import { getRuleset } from "@/lib/builder-league/ruleset";
import {
  applyCaps,
  compareForRanking,
  leagueScore,
  levelForRp,
  levelProgress,
  levelThreshold,
  rankEligibility,
  type CapPriorEntry,
  type RankStats,
} from "@/lib/builder-league/scoring";

const v2 = getRuleset("v2");
const local = (iso: string) => new Date(`${iso}+07:00`);

describe("levels", () => {
  it("follows round(50·n^1.6)", () => {
    expect(levelThreshold(1, v2)).toBe(0);
    expect(levelThreshold(2, v2)).toBe(50);
    expect(levelThreshold(3, v2)).toBe(Math.round(50 * 2 ** 1.6));
    expect(levelThreshold(11, v2)).toBe(Math.round(50 * 10 ** 1.6));
    expect(levelForRp(0, v2)).toBe(1);
    expect(levelForRp(49, v2)).toBe(1);
    expect(levelForRp(50, v2)).toBe(2);
    expect(levelForRp(-20, v2)).toBe(1);
    expect(levelForRp(10_000_000, v2)).toBe(100);
    const progress = levelProgress(100, v2);
    expect(progress).toMatchObject({ level: 2, levelStartRp: 50, rpIntoLevel: 50 });
    expect(progress.nextLevelRp).toBe(levelThreshold(3, v2));
  });
});

describe("caps", () => {
  const post = (occurredAt: Date, extra: Partial<CapPriorEntry> = {}): CapPriorEntry => ({
    userId: "u1",
    eventType: "ship_public_post",
    occurredAt,
    projectId: "p1",
    ...extra,
  });

  it("allows 4 public posts per local week and refuses the fifth", () => {
    const monday = local("2026-10-26T09:00:00");
    const prior = [0, 1, 2, 3].map(() => post(monday));
    expect(applyCaps(post(monday), prior.slice(0, 3), v2)).toMatchObject({ allowed: true });
    expect(applyCaps(post(monday), prior, v2)).toMatchObject({ allowed: false, reason: "cap_week_user_4" });
    // Reversed entries free their slot, and the next week starts fresh.
    expect(applyCaps(post(monday), [...prior.slice(0, 3), post(monday, { reversed: true })], v2).allowed).toBe(true);
    expect(applyCaps(post(local("2026-11-02T00:00:00")), prior, v2).allowed).toBe(true);
  });

  it("skips slots already taken in storage", () => {
    const at = local("2026-10-26T09:00:00");
    const first = applyCaps(post(at), [], v2);
    if (!first.allowed) throw new Error("expected allowed");
    const second = applyCaps(post(at), [], v2, new Set(first.slotKeys));
    if (!second.allowed) throw new Error("expected allowed");
    expect(second.slotKeys[0]).not.toBe(first.slotKeys[0]);
    expect(second.slotKeys[0].endsWith("|1")).toBe(true);
  });

  it("caps once-per-project events per project and needs the scope id", () => {
    const at = local("2026-10-26T09:00:00");
    const mvp = { userId: "u1", eventType: "build_mvp" as const, occurredAt: at, projectId: "p1" };
    expect(applyCaps(mvp, [mvp], v2)).toMatchObject({ allowed: false, reason: "cap_lifetime_project_1" });
    expect(applyCaps({ ...mvp, projectId: "p2" }, [mvp], v2).allowed).toBe(true);
    expect(applyCaps({ ...mvp, projectId: null }, [], v2)).toMatchObject({ allowed: false, reason: "missing_scope_project" });
  });

  it("limits help to the same person to once a week", () => {
    const at = local("2026-10-26T09:00:00");
    const help = { userId: "u1", eventType: "contribute_peer_help" as const, occurredAt: at, counterpartyUserId: "u2" };
    expect(applyCaps(help, [help], v2)).toMatchObject({ allowed: false, reason: "cap_week_counterparty_1" });
    expect(applyCaps({ ...help, counterpartyUserId: "u3" }, [help], v2).allowed).toBe(true);
  });
});

describe("league score", () => {
  it("weights normalised components 35/20/35/10 and caps each one", () => {
    const score = leagueScore(
      [
        { stage: "validate", rp: 60 }, // 50% of 120
        { stage: "build", rp: 500 }, // capped at 100
        { stage: "ship", rp: 75 }, // 50% of 150
        { stage: "contribute", rp: 20 }, // 50% of 40
      ],
      v2
    );
    expect(score.components).toEqual({ validate: 60, build: 100, ship: 75, contribute: 20 });
    expect(score.normalized).toEqual({ validate: 50, build: 100, ship: 50, contribute: 50 });
    expect(score.total).toBe(0.35 * 50 + 0.2 * 100 + 0.35 * 50 + 0.1 * 50);
  });

  it("nets reversals, floors at zero and scales caps by period", () => {
    const week = leagueScore([{ stage: "ship", rp: 100 }, { stage: "ship", rp: -100 }, { stage: "build", rp: -30 }], v2);
    expect(week.components).toEqual({ validate: 0, build: 0, ship: 0, contribute: 0 });
    expect(week.total).toBe(0);
    const month = leagueScore([{ stage: "ship", rp: 600 }], v2, "month");
    expect(month.components.ship).toBe(600);
    expect(month.normalized.ship).toBe(100);
  });

  it("keeps stage specialists on top of their own stage board", () => {
    const specialist = leagueScore([{ stage: "validate", rp: 120 }], v2);
    const generalist = leagueScore(
      [{ stage: "validate", rp: 40 }, { stage: "build", rp: 50 }, { stage: "ship", rp: 75 }, { stage: "contribute", rp: 20 }],
      v2
    );
    expect(specialist.components.validate).toBeGreaterThan(generalist.components.validate);
    expect(specialist.total).toBe(35);
  });
});

describe("ranking ties", () => {
  it("breaks ties on verified events, then earlier reach time, then userId", () => {
    const at = new Date("2026-10-26T00:00:00Z");
    const later = new Date("2026-10-27T00:00:00Z");
    const rows = [
      { userId: "d", score: 50, verifiedEventCount: 3, reachedAt: at },
      { userId: "c", score: 50, verifiedEventCount: 5, reachedAt: later },
      { userId: "b", score: 50, verifiedEventCount: 5, reachedAt: at },
      { userId: "a", score: 50, verifiedEventCount: 5, reachedAt: at },
      { userId: "e", score: 60, verifiedEventCount: 1, reachedAt: later },
    ];
    expect([...rows].sort(compareForRanking).map((r) => r.userId)).toEqual(["e", "a", "b", "c", "d"]);
  });
});

describe("rank eligibility", () => {
  const base: RankStats = {
    rp: 0,
    tenureDays: 0,
    shipCount: 0,
    contributorWeeks: 0,
    isApprovedContributor: false,
    feedbackRate: 0,
    weeklyCheckIns: 0,
    peopleHelped: 0,
    highlightedPosts: 0,
    hasFeaturedContribution: false,
    mentorNominations: {},
  };

  it("starts at Apprentice and reaches Builder through SHIPs or Contributor weeks", () => {
    expect(rankEligibility(base, v2).eligibleRank).toBe("apprentice");
    const builder = { ...base, rp: 120, tenureDays: 50, feedbackRate: 0.85, weeklyCheckIns: 4 };
    expect(rankEligibility({ ...builder, shipCount: 8 }, v2)).toMatchObject({ eligibleRank: "builder", nextRank: "architect" });
    expect(rankEligibility({ ...builder, contributorWeeks: 8, isApprovedContributor: true }, v2).eligibleRank).toBe("builder");
    expect(rankEligibility({ ...builder, contributorWeeks: 8 }, v2).eligibleRank).toBe("apprentice");
  });

  it("needs every lower gate and two mentor nominations for Legend", () => {
    const legend: RankStats = {
      rp: 2500,
      tenureDays: 400,
      shipCount: 120,
      contributorWeeks: 0,
      isApprovedContributor: false,
      feedbackRate: 0.97,
      weeklyCheckIns: 50,
      peopleHelped: 10,
      highlightedPosts: 5,
      hasFeaturedContribution: true,
      mentorNominations: { legend: 2 },
      withinRankQuota: { legend: true },
    };
    expect(rankEligibility(legend, v2)).toMatchObject({ eligibleRank: "legend", nextRank: null });
    expect(rankEligibility({ ...legend, mentorNominations: { legend: 1 } }, v2).eligibleRank).toBe("master");
    expect(rankEligibility({ ...legend, withinRankQuota: {} }, v2).eligibleRank).toBe("master");
    // A missing Architect requirement blocks every rank above it.
    expect(rankEligibility({ ...legend, peopleHelped: 0 }, v2).eligibleRank).toBe("builder");
  });
});
