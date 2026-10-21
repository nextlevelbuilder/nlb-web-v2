import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ledger rule for non-human callers: an API key or an MCP-delegated agent can only submit self-reported
 * activity. It can never pick a verification level, set a status, approve, award or confirm. These tests
 * drive the HTTP routes with each caller type and check both the response and what reached the database.
 */

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
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: async () => null } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      BUILDER_EVIDENCE: (globalThis as { __BUILDER_EVIDENCE__?: unknown }).__BUILDER_EVIDENCE__,
      BUILDER_LEAGUE_ENABLED: process.env.BUILDER_LEAGUE_ENABLED,
    },
  }),
}));

import { eq } from "drizzle-orm";
import { BuilderEvidenceListResponseSchema, BuilderEvidenceResponseSchema } from "@nextlevelbuilder/contracts";
import { runWithDb } from "@/lib/db";
import { activityEvidence, builderEvents } from "@/lib/db/schema";
import { submitEvidence } from "@/lib/builder-league/evidence";
import { GET as listRoute, POST as submitRoute } from "@/app/api/v1/builder-evidence/route";
import { GET as getRoute, PATCH as patchRoute } from "@/app/api/v1/builder-evidence/[id]/route";
import { POST as confirmRoute } from "@/app/api/v1/builder-evidence/[id]/confirm/route";
import { POST as decisionRoute } from "@/app/api/v1/builder-admin/evidence/[id]/decision/route";
import { TEST_NOW, V2_WEEK, createLeagueEnv, hoursAfter, jsonRequest, longText, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;
const NON_HUMAN = [
  ["api_key", "api"],
  ["delegation", "agent"],
] as const;

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
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
  await env.reset();
  await seedMembers(env.db);
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const shipPost = (overrides: Record<string, unknown> = {}) => ({
  eventType: "ship_public_post",
  projectId: "p-alice",
  title: "Launch thread on X",
  summary: "Posted the launch thread.",
  occurredAt: hoursAfter(V2_WEEK, 2).toISOString(),
  links: ["https://x.com/alice/status/1"],
  ...overrides,
});

describe("API-key and agent evidence submissions", () => {
  it.each(NON_HUMAN)("refuses forged ledger fields from a %s caller and stores nothing", async (auth) => {
    const forgeries = [
      { verification: "moderator_verified" },
      { verification: "system_verified" },
      { status: "approved" },
      { source: "moderator" },
      { eventId: "evt_forged" },
      { points: 500 },
    ];
    for (const [index, forged] of forgeries.entries()) {
      const response = await call(() => submitRoute(jsonRequest("/api/v1/builder-evidence", "alice", shipPost({ ...forged, clientKey: `f-${index}` }), { auth })));
      expect(response.status, JSON.stringify(forged)).toBe(400);
    }
    expect(await env.db.select().from(activityEvidence)).toHaveLength(0);
    expect(await env.db.select().from(builderEvents)).toHaveLength(0);
  });

  it.each(NON_HUMAN)("records an accepted %s submission as pending self-reported work with no ledger entry", async (auth, source) => {
    const response = await call(() => submitRoute(jsonRequest("/api/v1/builder-evidence", "alice", shipPost({ clientKey: `ok-${auth}` }), { auth })));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(BuilderEvidenceResponseSchema.parse(body).data).toMatchObject({ status: "submitted", source, eventId: null, decision: null });

    const [row] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, body.data.id));
    expect(row).toMatchObject({ status: "submitted", source, eventId: null, decidedBy: null });
    expect(await env.db.select().from(builderEvents)).toHaveLength(0);
  });

  it.each(NON_HUMAN)("refuses a %s edit that tries to change the verification or status", async (auth) => {
    const { evidence } = await submitEvidence(env.db, { userId: "alice", actorRole: auth === "api_key" ? "api" : "agent" }, shipPost() as never);
    for (const forged of [{ verification: "moderator_verified" }, { status: "approved" }]) {
      const response = await call(() => patchRoute(jsonRequest(`/api/v1/builder-evidence/${evidence.id}`, "alice", forged, { method: "PATCH", auth }), params({ id: evidence.id })));
      expect(response.status, JSON.stringify(forged)).toBe(400);
    }
    const [row] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id));
    expect(row.status).toBe("submitted");
  });
});

describe("approvals, awards and confirmations stay with people", () => {
  it.each(NON_HUMAN)("refuses an admin decision from an admin's %s and awards nothing", async (auth) => {
    const { evidence } = await submitEvidence(env.db, { userId: "alice", actorRole: "member" }, shipPost() as never);
    const response = await call(() =>
      decisionRoute(jsonRequest(`/api/v1/builder-admin/evidence/${evidence.id}/decision`, "admin", { decision: "approve" }, { auth }), params({ id: evidence.id }))
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("session_required");
    const [row] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id));
    expect(row).toMatchObject({ status: "submitted", eventId: null });
    expect(await env.db.select().from(builderEvents)).toHaveLength(0);
  });

  it.each(NON_HUMAN)("refuses a peer-help confirmation from a %s caller", async (auth) => {
    const { evidence } = await submitEvidence(env.db, { userId: "alice", actorRole: "member" }, {
      eventType: "contribute_peer_help",
      title: "Paired on Bob's checkout bug",
      summary: longText(90),
      occurredAt: "2026-11-03",
      counterparty: "bob",
    } as never);
    const response = await call(() => confirmRoute(jsonRequest(`/api/v1/builder-evidence/${evidence.id}/confirm`, "bob", {}, { auth }), params({ id: evidence.id })));
    expect(response.status).toBe(403);
    const [row] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id));
    expect(row.counterpartyConfirmedAt).toBeNull();
    expect(await env.db.select().from(builderEvents)).toHaveLength(0);
  });
});

describe("evidence responses match the shared contract", () => {
  it("parses the list and item DTOs the CLI and MCP tools validate against", async () => {
    await call(() => submitRoute(jsonRequest("/api/v1/builder-evidence", "alice", shipPost({ clientKey: "c-1" }), { auth: "api_key" })));
    const list = await call(() => listRoute(jsonRequest("/api/v1/builder-evidence", "alice", undefined, { auth: "api_key" })));
    const parsed = BuilderEvidenceListResponseSchema.parse(await list.json());
    expect(parsed.data).toHaveLength(1);
    const item = await call(() => getRoute(jsonRequest(`/api/v1/builder-evidence/${parsed.data[0].id}`, "alice", undefined, { auth: "delegation" }), params({ id: parsed.data[0].id })));
    expect(BuilderEvidenceResponseSchema.parse(await item.json()).data.id).toBe(parsed.data[0].id);
  });
});
