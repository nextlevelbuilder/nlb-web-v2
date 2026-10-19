import { describe, expect, it } from "vitest";
import {
  BUILDER_LEAGUE_NOT_ENABLED_MESSAGE,
  BuilderBackfillInputSchema,
  BuilderEnvelopeSchema,
  BuilderModerationDecisionInputSchema,
  BuilderYearHiddenScenesInputSchema,
  BuilderYearSchema,
  EditBuilderEvidenceSchema,
  OnboardingStatusResponseSchema,
  SubmitBuilderEvidenceSchema,
  describeBuilderApiFailure
} from "../src/index.js";

const submission = { eventType: "customer_interview", title: "Talked to five users", occurredAt: "2026-10-18" };
const errorBody = (code: string, message = "Server says no.", details?: unknown) => JSON.stringify({ error: { code, message, ...(details ? { details } : {}) } });

describe("Builder League request schemas", () => {
  it("accepts a plain submission and refuses every ledger field a caller could forge", () => {
    expect(SubmitBuilderEvidenceSchema.safeParse(submission).success).toBe(true);
    for (const forged of [{ verification: "moderator_verified" }, { status: "approved" }, { source: "moderator" }, { points: 10 }, { eventId: "evt_1" }]) {
      expect(SubmitBuilderEvidenceSchema.safeParse({ ...submission, ...forged }).success).toBe(false);
    }
  });

  it("requires at least one known field in an evidence edit", () => {
    expect(EditBuilderEvidenceSchema.safeParse({}).success).toBe(false);
    expect(EditBuilderEvidenceSchema.safeParse({ title: "New title" }).success).toBe(true);
    expect(EditBuilderEvidenceSchema.safeParse({ title: "New title", verification: "system_verified" }).success).toBe(false);
  });

  it("bounds years, scenes, decisions and backfill inputs", () => {
    expect(BuilderYearSchema.safeParse(2026).success).toBe(true);
    expect(BuilderYearSchema.safeParse(2025).success).toBe(false);
    expect(BuilderYearHiddenScenesInputSchema.safeParse({ hiddenScenes: ["launch"] }).success).toBe(true);
    expect(BuilderYearHiddenScenesInputSchema.safeParse({ hiddenScenes: ["bloopers"] }).success).toBe(false);
    expect(BuilderModerationDecisionInputSchema.safeParse({ decision: "award" }).success).toBe(false);
    expect(BuilderBackfillInputSchema.safeParse({ dryRun: true, userIds: ["u_1"] }).success).toBe(true);
  });

  it("requires data in a generic envelope", () => {
    expect(BuilderEnvelopeSchema.safeParse({ data: null }).success).toBe(true);
    expect(BuilderEnvelopeSchema.safeParse({ data: [], pagination: { nextCursor: null, limit: 20 }, extra: 1 }).success).toBe(true);
    expect(BuilderEnvelopeSchema.safeParse({ ok: true }).success).toBe(false);
  });
});

describe("describeBuilderApiFailure", () => {
  it("treats a collection 404 as the league being switched off", () => {
    const failure = describeBuilderApiFailure(404, errorBody("not_found", "Not found."));
    expect(failure).toMatchObject({ status: 404, code: "not_found", notEnabled: true });
    expect(failure.message).toBe(`HTTP 404 not_found: ${BUILDER_LEAGUE_NOT_ENABLED_MESSAGE}.`);
  });

  it("keeps an item 404 ambiguous", () => {
    const failure = describeBuilderApiFailure(404, errorBody("not_found"), "", { resource: true });
    expect(failure.notEnabled).toBe(false);
    expect(failure.message).toContain("Not found, or Builder League is not enabled on this environment");
  });

  it("explains membership and session refusals", () => {
    expect(describeBuilderApiFailure(403, errorBody("membership_required")).message).toContain("membership required");
    const session = describeBuilderApiFailure(403, errorBody("session_required", "Use the website."));
    expect(session).toMatchObject({ code: "session_required", notEnabled: false });
    expect(session.message).toContain("API keys and MCP agents are refused");
    expect(describeBuilderApiFailure(401, "").message).toContain("Sign in required");
  });

  it("appends validation issues and survives a non-JSON body", () => {
    const invalid = describeBuilderApiFailure(400, errorBody("validation_failed", "Invalid input.", [{ path: "title", message: "Too short" }]));
    expect(invalid.message).toBe("HTTP 400 validation_failed: Invalid input. (title: Too short)");
    const gateway = describeBuilderApiFailure(502, "<html>bad gateway</html>", "Bad Gateway");
    expect(gateway).toMatchObject({ status: 502, notEnabled: false });
    expect(gateway.code).toBeUndefined();
    expect(gateway.message).toContain("bad gateway");
  });
});

describe("Onboarding status contract", () => {
  const status = {
    payment: "none",
    membership: null,
    profile: { goal: "", profileLinks: [], skills: "", phone: "", commitmentAccepted: false, completed: false },
    connections: { discord: { status: "not_connected", nextAction: "connect" }, telegram: { status: "action_required", nextAction: "retry", errorCode: "bot_blocked" } }
  };

  it("accepts the status the web route returns", () => {
    expect(OnboardingStatusResponseSchema.safeParse({ data: status }).success).toBe(true);
  });

  it("rejects unknown payment states and connection statuses", () => {
    expect(OnboardingStatusResponseSchema.safeParse({ data: { ...status, payment: "paid" } }).success).toBe(false);
    const badConnection = { ...status, connections: { ...status.connections, discord: { status: "linked", nextAction: "none" } } };
    expect(OnboardingStatusResponseSchema.safeParse({ data: badConnection }).success).toBe(false);
  });
});
