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
import { activityEvidence } from "@/lib/db/schema";
import { editEvidence, submitEvidence, withdrawEvidence, type SubmitEvidenceInput } from "@/lib/builder-league/evidence";
import { decideEvidence } from "@/lib/builder-league/moderation";
import { sniffEvidenceType } from "@/lib/builder-league/evidence-storage";
import { GET as listRoute, POST as submitRoute } from "@/app/api/v1/builder-evidence/route";
import { GET as getRoute, PATCH as patchRoute } from "@/app/api/v1/builder-evidence/[id]/route";
import { GET as fileRoute } from "@/app/api/v1/builder-evidence/[id]/files/[key]/route";
import { GET as projectsRoute, POST as createProjectRoute } from "@/app/api/v1/builder-projects/route";
import {
  TEST_NOW,
  V2_WEEK,
  createLeagueEnv,
  formRequest,
  hoursAfter,
  htmlAsPng,
  jsonRequest,
  longText,
  pngFile,
  seedMembers,
  type LeagueEnv,
} from "./evidence-fixtures";

let env: LeagueEnv;
const ALICE = { userId: "alice", actorRole: "member" as const };
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
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
  await env.reset();
  await seedMembers(env.db);
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function shipPost(overrides: Partial<SubmitEvidenceInput> = {}): SubmitEvidenceInput {
  return {
    eventType: "ship_public_post",
    projectId: "p-alice",
    title: "Launch thread on X",
    summary: "Posted the launch thread.",
    occurredAt: hoursAfter(V2_WEEK, 2).toISOString(),
    links: ["https://x.com/alice/status/1"],
    ...overrides,
  };
}

describe("evidence validation against the ruleset", () => {
  it("accepts a complete submission as private, submitted member evidence", async () => {
    const { evidence, created } = await submitEvidence(env.db, ALICE, shipPost({ clientKey: "k-1" }));
    expect(created).toBe(true);
    expect(evidence).toMatchObject({ status: "submitted", source: "member", visibility: "private", stage: "ship", eventType: "ship_public_post" });
  });

  it("rejects what the event definition does not allow", async () => {
    const cases: [Partial<SubmitEvidenceInput>, string][] = [
      [{ eventType: "validate_interviews", projectId: "p-alice", summary: longText(120) }, "summary_too_short"],
      [{ eventType: "validate_interviews", occurredAt: "2026-10-01" }, "unknown_event_type"], // v1 has no interviews
      [{ eventType: "contribute_weekly_feedback", projectId: null }, "event_type_not_submittable"],
      [{ stage: "build" }, "stage_mismatch"],
      [{ projectId: null }, "project_required"],
      [{ projectId: "p-bob" }, "project_not_found"],
      [{ links: [] }, "link_required"],
      [{ eventType: "contribute_peer_help", projectId: null, summary: longText(100) }, "counterparty_required"],
      [{ eventType: "contribute_peer_help", projectId: null, summary: longText(100), counterparty: "alice" }, "self_counterparty"],
      [{ eventType: "contribute_peer_help", projectId: null, summary: longText(100), counterparty: "nobody" }, "counterparty_not_found"],
    ];
    for (const [overrides, code] of cases) {
      await expect(submitEvidence(env.db, ALICE, shipPost(overrides)), code).rejects.toMatchObject({ code });
    }
    // Shape errors: future dates, non-web links and fields for raw customer data are refused outright.
    for (const bad of [
      { occurredAt: hoursAfter(TEST_NOW, 2).toISOString() },
      { links: ["javascript:alert(1)"] },
      { customerEmail: "buyer@example.com" } as Partial<SubmitEvidenceInput>,
    ]) {
      await expect(submitEvidence(env.db, ALICE, shipPost(bad))).rejects.toMatchObject({ name: "ZodError" });
    }
    expect(await env.db.select().from(activityEvidence)).toHaveLength(0);
  });

  it("accepts counterparty profile URLs and files as the required proof", async () => {
    const help = await submitEvidence(env.db, ALICE, {
      eventType: "contribute_peer_help",
      title: "Paired on Bob's checkout bug",
      summary: longText(90),
      occurredAt: "2026-11-03",
      counterparty: "https://nlb.test/vi/builders/bob",
    });
    expect(help.evidence).toMatchObject({ counterpartyUserId: "bob", projectId: null, stage: "contribute" });
    expect(help.evidence.occurredAt.toISOString()).toBe("2026-11-02T17:00:00.000Z"); // local midnight, UTC+7

    const withFile = await submitEvidence(env.db, ALICE, shipPost({ links: [] }), { files: [pngFile()], bucket: env.bucket });
    expect(withFile.evidence.privateObjectKeys).toHaveLength(1);
    expect(withFile.evidence.privateObjectKeys[0]).toMatch(new RegExp(`^evidence/alice/${withFile.evidence.id}/[0-9a-f-]{36}\\.png$`));
  });
});

describe("client_key idempotency", () => {
  it("returns the stored evidence for a retried or concurrent submission", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => submitEvidence(env.db, ALICE, shipPost({ clientKey: "retry-1" }))));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.evidence.id)).size).toBe(1);
    expect(await env.db.select().from(activityEvidence)).toHaveLength(1);

    // The Idempotency-Key header works when the body has no clientKey.
    const first = await call(() => submitRoute(withHeader(jsonRequest("/api/v1/builder-evidence", "alice", shipPost()), "idempotency-key", "hdr-1")));
    const again = await call(() => submitRoute(withHeader(jsonRequest("/api/v1/builder-evidence", "alice", shipPost()), "idempotency-key", "hdr-1")));
    expect([first.status, again.status]).toEqual([201, 200]);
    expect((await again.json()).data.id).toBe((await first.json()).data.id);
  });
});

function withHeader(request: Request, name: string, value: string): Request {
  const headers = new Headers(request.headers);
  headers.set(name, value);
  return new Request(request, { headers });
}

describe("caller source and the evidence API", () => {
  it("labels the source by caller type and never lets API callers set a status", async () => {
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    const submit = (auth: string, key: string) =>
      call(() => submitRoute(jsonRequest("/api/v1/builder-evidence", "alice", { ...shipPost(), clientKey: key }, { auth })));
    const sources = [];
    for (const [auth, key] of [["session", "s"], ["api_key", "a"], ["delegation", "d"]]) {
      const response = await submit(auth, key);
      expect(response.status).toBe(201);
      sources.push((await response.json()).data.source);
    }
    expect(sources).toEqual(["member", "api", "agent"]);
    const forged = await call(() => submitRoute(jsonRequest("/api/v1/builder-evidence", "alice", { ...shipPost(), status: "approved" }, { auth: "api_key" })));
    expect(forged.status).toBe(400);

    const list = await call(() => listRoute(jsonRequest("/api/v1/builder-evidence?limit=2", "alice")));
    const body = await list.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination.nextCursor).toEqual(expect.any(String));
  });

  it("hides every route from non-pilot members while the flag is off", async () => {
    const created = await submitEvidence(env.db, ALICE, shipPost());
    for (const response of [
      await call(() => listRoute(jsonRequest("/api/v1/builder-evidence", "outsider"))),
      await call(() => submitRoute(jsonRequest("/api/v1/builder-evidence", "outsider", shipPost()))),
      await call(() => getRoute(jsonRequest(`/api/v1/builder-evidence/${created.evidence.id}`, "outsider"), params({ id: created.evidence.id }))),
      await call(() => projectsRoute(jsonRequest("/api/v1/builder-projects", "outsider"))),
      await call(() => listRoute(jsonRequest("/api/v1/builder-evidence", null))),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
    }
    expect((await call(() => listRoute(jsonRequest("/api/v1/builder-evidence", "alice")))).status).toBe(200);
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    expect((await call(() => listRoute(jsonRequest("/api/v1/builder-evidence", "outsider")))).status).toBe(200);
  });

  it("creates projects and links only directory products the member owns", async () => {
    const created = await call(() => createProjectRoute(jsonRequest("/api/v1/builder-projects", "alice", { name: "Đồ án mới" })));
    expect(created.status).toBe(201);
    expect((await created.json()).data).toMatchObject({ slug: "do-an-moi", visibility: "private", stage: "validate" });
    const foreign = await call(() => createProjectRoute(jsonRequest("/api/v1/builder-projects", "alice", { name: "Stolen", productId: "missing" })));
    expect(foreign.status).toBe(403);
    const list = await call(() => projectsRoute(jsonRequest("/api/v1/builder-projects", "alice")));
    expect((await list.json()).data.map((project: { slug: string }) => project.slug)).toEqual(["alice-app", "alice-tool", "do-an-moi"]);
  });
});

describe("edit and withdraw", () => {
  it("allows changes only while submitted or needs_info, and re-queues after needs_info", async () => {
    const { evidence } = await submitEvidence(env.db, ALICE, shipPost());
    const edited = await editEvidence(env.db, "alice", evidence.id, { title: "Launch thread (final)" });
    expect(edited).toMatchObject({ title: "Launch thread (final)", status: "submitted" });
    await expect(editEvidence(env.db, "bob", evidence.id, { title: "Hijack" })).rejects.toMatchObject({ status: 404 });
    await expect(editEvidence(env.db, "alice", evidence.id, { links: [] })).rejects.toMatchObject({ code: "link_required" });

    await decideEvidence(env.db, evidence.id, { decision: "needs_info", reasonCodes: ["missing_link"] }, ADMIN);
    const answered = await editEvidence(env.db, "alice", evidence.id, { links: ["https://x.com/alice/status/2"] });
    expect(answered.status).toBe("submitted");

    await decideEvidence(env.db, evidence.id, { decision: "approve" }, ADMIN);
    await expect(editEvidence(env.db, "alice", evidence.id, { title: "Too late" })).rejects.toMatchObject({ status: 409, code: "evidence_locked" });
    await expect(withdrawEvidence(env.db, "alice", evidence.id)).rejects.toMatchObject({ status: 409 });

    const other = await submitEvidence(env.db, ALICE, shipPost({ clientKey: "w" }));
    expect((await withdrawEvidence(env.db, "alice", other.evidence.id)).status).toBe("withdrawn");
    expect((await withdrawEvidence(env.db, "alice", other.evidence.id)).status).toBe("withdrawn");
    const patched = await call(() =>
      patchRoute(jsonRequest(`/api/v1/builder-evidence/${other.evidence.id}`, "alice", { title: "x y z" }, { method: "PATCH" }), params({ id: other.evidence.id }))
    );
    expect(patched.status).toBe(409);
  });
});

describe("private evidence files", () => {
  it("serves files to the owner and admins only, never cached", async () => {
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    const form = new FormData();
    for (const [key, value] of Object.entries(shipPost({ links: [] }))) form.set(key, String(value));
    form.set("clientKey", "file-1");
    form.append("files", pngFile());
    const request = new Request("https://nlb.test/api/v1/builder-evidence", {
      method: "POST",
      headers: { accept: "application/json", "x-test-user": "alice" },
      body: form,
    });
    const created = await call(() => submitRoute(request));
    expect(created.status).toBe(201);
    const dto = (await created.json()).data;
    expect(dto.files).toHaveLength(1);
    const name: string = dto.files[0].name;
    expect(dto.files[0].url).toBe(`/api/v1/builder-evidence/${dto.id}/files/${name}`);

    const fetchAs = (user: string) => call(() => fileRoute(jsonRequest(dto.files[0].url, user), params({ id: dto.id, key: name })));
    const own = await fetchAs("alice");
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect(own.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await own.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect((await fetchAs("admin")).status).toBe(200);
    expect((await fetchAs("bob")).status).toBe(404);
    expect((await fetchAs("outsider")).status).toBe(404);
    const traversal = await call(() => fileRoute(jsonRequest("/x", "alice"), params({ id: dto.id, key: "../../other.png" })));
    expect(traversal.status).toBe(404);

    // The counterparty can read the evidence to confirm it, but never its files.
    const help = await submitEvidence(env.db, ALICE, {
      eventType: "contribute_peer_help",
      title: "Helped Bob",
      summary: longText(90),
      occurredAt: "2026-11-03",
      counterparty: "bob",
    }, { files: [pngFile()], bucket: env.bucket });
    const asCounterparty = await call(() => getRoute(jsonRequest(`/api/v1/builder-evidence/${help.evidence.id}`, "bob"), params({ id: help.evidence.id })));
    expect((await asCounterparty.json()).data.files).toEqual([]);
    const helpFile = help.evidence.privateObjectKeys[0].split("/").pop()!;
    expect((await call(() => fileRoute(jsonRequest("/x", "bob"), params({ id: help.evidence.id, key: helpFile })))).status).toBe(404);
    expect((await call(() => getRoute(jsonRequest("/x", "carol"), params({ id: help.evidence.id })))).status).toBe(404);
  });

  it("sniffs content and refuses disguised, oversized or excess files", async () => {
    expect(sniffEvidenceType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffEvidenceType(new TextEncoder().encode("<svg xmlns"))).toBeNull();
    await expect(submitEvidence(env.db, ALICE, shipPost(), { files: [htmlAsPng()], bucket: env.bucket })).rejects.toMatchObject({ status: 415 });
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    await expect(submitEvidence(env.db, ALICE, shipPost(), { files: [big], bucket: env.bucket })).rejects.toMatchObject({ status: 413 });
    const six = Array.from({ length: 6 }, () => pngFile());
    await expect(submitEvidence(env.db, ALICE, shipPost(), { files: six, bucket: env.bucket })).rejects.toMatchObject({ code: "too_many_files" });
    const jpegNamedPng = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "x.png", { type: "image/png" });
    await expect(submitEvidence(env.db, ALICE, shipPost(), { files: [jpegNamedPng], bucket: env.bucket })).rejects.toMatchObject({ code: "file_type_mismatch" });
  });
});

describe("no-JS form posts", () => {
  it("redirects back with a notice or an error code and refuses cross-site posts", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(shipPost({ links: [] }))) form.set(key, String(value));
    form.set("links", "https://x.com/alice/status/9\nhttps://alice.dev/launch");
    form.set("returnTo", "/vi/builder-league/evidence");
    form.set("clientKey", "form-1");
    const ok = await call(() => submitRoute(formRequest("/api/v1/builder-evidence", "alice", form)));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("https://nlb.test/vi/builder-league/evidence?notice=submitted");
    const [stored] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.clientKey, "form-1"));
    expect(stored.links).toEqual(["https://x.com/alice/status/9", "https://alice.dev/launch"]);

    form.set("clientKey", "form-2");
    form.set("summary", "");
    form.set("eventType", "validate_interviews");
    form.set("returnTo", "https://evil.example/phish");
    const failed = await call(() => submitRoute(formRequest("/api/v1/builder-evidence", "alice", form)));
    expect(failed.status).toBe(303);
    expect(failed.headers.get("location")).toBe("https://nlb.test/builder-league/evidence?error=summary_too_short");

    const crossSite = formRequest("/api/v1/builder-evidence", "alice", form);
    const headers = new Headers(crossSite.headers);
    headers.set("origin", "https://evil.example");
    headers.set("sec-fetch-site", "cross-site");
    const refused = await call(() => submitRoute(new Request(crossSite, { headers })));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { code: "cross_site_request" } });
  });
});
