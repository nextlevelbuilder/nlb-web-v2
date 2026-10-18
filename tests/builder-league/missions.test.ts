import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalD1 } from "../helpers/local-d1";
import { activityEvidence } from "@/lib/db/schema";
import { getMissionPlan, planMissions, type MissionKey } from "@/lib/builder-league/missions";
import type { VerifiedEvent } from "@/lib/builder-league/verified-history";
import type { EventTypeKey, Stage } from "@/lib/builder-league/types";
import { at, seedMembers, verified } from "./progression-fixtures";

const STAGE: Record<string, Stage> = { validate: "validate", build: "build", ship: "ship", contribute: "contribute" };
let n = 0;
const ev = (eventType: EventTypeKey, day: number): VerifiedEvent => ({
  id: `e${++n}`,
  eventType,
  stage: STAGE[eventType.split("_")[0]],
  projectId: "p",
  occurredAt: at(day),
  verification: "moderator_verified",
  counterpartyUserId: null,
});
const statusOf = (plan: ReturnType<typeof planMissions>, key: MissionKey) => plan.missions.find((m) => m.key === key)?.status;

describe("mission planning", () => {
  it("starts a new builder at problem discovery with a contribute mission", () => {
    const plan = planMissions([]);
    expect(plan.currentStage).toBe("validate");
    expect(plan.recommended).toEqual(["problem_discovery", "help_a_builder"]);
    expect(plan.missions.every((m) => m.href.startsWith("/builder-league/evidence/new?type="))).toBe(true);
    expect(plan.missions.find((m) => m.key === "first_payment")?.status).toBe("available"); // nothing is locked
  });

  it("follows the stage the member is in", () => {
    const validate = planMissions([ev("validate_problem_signal", 1), ev("validate_interviews", 2)]);
    expect(validate.recommended[0]).toBe("qualified_waitlist");
    expect(validate.currentStage).toBe("validate");

    const build = planMissions([ev("validate_problem_signal", 1), ev("validate_wtp_commitment", 2), ev("build_mvp", 3)]);
    expect(build.currentStage).toBe("build");
    expect(build.recommended[0]).toBe("first_core_action");

    const ship = planMissions([ev("build_mvp", 1), ev("build_first_real_user", 2), ev("ship_product_launch", 3)]);
    expect(ship.currentStage).toBe("ship");
    expect(ship.recommended[0]).toBe("distribution_experiment");
    expect(statusOf(ship, "public_launch")).toBe("done");
  });

  it("offers skipped validation as an optional revisit instead of forcing a funnel", () => {
    const plan = planMissions([ev("build_mvp", 1)]);
    expect(plan.recommended[0]).toBe("first_core_action");
    expect(plan.recommended[1]).toBe("problem_discovery");
    expect(plan.missions.find((m) => m.key === "problem_discovery")?.revisit).toBe(true);
  });

  it("loops back to VALIDATE after a verified pivot and starts a new cycle", () => {
    const plan = planMissions([ev("validate_problem_signal", 1), ev("build_mvp", 2), ev("validate_stop_pivot", 3)]);
    expect(plan).toMatchObject({ cycle: 2, loopedBack: true, currentStage: "validate" });
    expect(plan.recommended[0]).toBe("problem_discovery");
    expect(statusOf(plan, "scoped_mvp")).toBe("available");

    const later = planMissions([ev("validate_problem_signal", 1), ev("validate_stop_pivot", 3), ev("validate_problem_signal", 4)]);
    expect(later).toMatchObject({ cycle: 2, loopedBack: false });
    expect(later.recommended[0]).toBe("customer_interviews");
  });

  it("marks evidence in review and skips it in recommendations; no streak fields exist", () => {
    const plan = planMissions([], new Set(["validate_problem_signal"]));
    expect(statusOf(plan, "problem_discovery")).toBe("in_review");
    expect(plan.recommended[0]).toBe("customer_interviews");
    expect(JSON.stringify(plan)).not.toMatch(/streak|deadline|penalt/i);
  });
});

describe("mission plan on local D1", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("reads only verified history plus pending evidence", async () => {
    const local = await createLocalD1();
    try {
      await seedMembers(local.db, ["u1", "admin"]);
      await verified(local.db, "u1", "validate_problem_signal", at(1), { verification: "self_reported", actorRole: "member", source: "member" });
      await local.db.insert(activityEvidence).values({
        userId: "u1",
        eventType: "validate_interviews",
        stage: "validate",
        title: "5 interviews",
        occurredAt: at(2),
        source: "member",
        clientKey: "k1",
      });
      const plan = await getMissionPlan(local.db, "u1");
      expect(statusOf(plan, "problem_discovery")).toBe("recommended"); // self-reported does not count
      expect(statusOf(plan, "customer_interviews")).toBe("in_review");
    } finally {
      await local.dispose();
    }
  });
});
