import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: "", vip: "" },
  productIdsForPlans: (plans: readonly ("premium" | "vip")[]) =>
    plans.flatMap((plan) => ({ premium: ["prod_premium"], vip: ["prod_vip"] })[plan]),
}));

import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { authorize } from "@/lib/access/authorize";
import type { AccessResource, AccessSubject, AuthorizeInput } from "@/lib/access/types";
import { liveReplayFeatureKey, liveTicketFeatureKey } from "@/lib/live/types";
import { videoFeatureKey } from "@/lib/courses/course-video-access";
import { DAY, apiKey, delegation, seedEntitlement, seedLiveEvent, seedSubscription, seedTicket, seedUsers, session } from "./access-fixtures";

let local: LocalD1;
const video: AccessResource = { kind: "video", id: "vid_1", polarProductId: "prod_video_1" };

beforeAll(async () => {
  local = await createLocalD1();
  const { db } = local;
  await seedUsers(db, [
    { id: "free" },
    { id: "unverified", emailVerified: false },
    { id: "banned", banned: true, banExpires: null },
    { id: "banned-until-future", banned: true, banExpires: new Date(Date.now() + DAY) },
    { id: "ban-expired", banned: true, banExpires: new Date(Date.now() - DAY) },
    { id: "vip" },
    { id: "premium" },
    { id: "premium-trial" },
    { id: "vip-canceled" },
    { id: "buyer" },
    { id: "refunded" },
    { id: "entitled-no-ticket" },
    { id: "ticket-no-entitlement" },
    { id: "video-buyer" },
  ]);
  await seedSubscription(db, "vip", "prod_vip");
  await seedSubscription(db, "premium", "prod_premium");
  await seedSubscription(db, "premium-trial", "prod_premium", "trialing");
  await seedSubscription(db, "vip-canceled", "prod_vip", "canceled");
  await seedLiveEvent(db, "evt_1");

  await seedEntitlement(db, "buyer", liveTicketFeatureKey("evt_1"));
  await seedTicket(db, "evt_1", "buyer", "active");
  await seedEntitlement(db, "refunded", liveTicketFeatureKey("evt_1"), false);
  await seedTicket(db, "evt_1", "refunded", "refunded");
  await seedEntitlement(db, "entitled-no-ticket", liveTicketFeatureKey("evt_1"));
  await seedTicket(db, "evt_1", "ticket-no-entitlement", "active");
  // A banned user holding a valid ticket must still be refused.
  await seedEntitlement(db, "banned", liveTicketFeatureKey("evt_1"));
  await seedTicket(db, "evt_1", "banned", "active");
  await seedEntitlement(db, "buyer", liveReplayFeatureKey("evt_1"));
  await seedEntitlement(db, "video-buyer", videoFeatureKey("vid_1"));
});

afterAll(async () => {
  await local?.dispose();
});

const check = (subject: AccessSubject, action: AuthorizeInput["action"], resource: AccessResource) =>
  authorize({ subject, action, resource }, { db: local.db, videoAccess: { accessPlans: ["premium", "vip"] } });

const ticket: AccessResource = { kind: "live_ticket", eventId: "evt_1" };
const poll: AccessResource = { kind: "live_poll", roundId: "round_1" };
const event: AccessResource = { kind: "live_event", id: "evt_1" };

describe("authorize: identity", () => {
  it("denies a banned user everywhere, including through an API key or a delegation", async () => {
    for (const subject of [session("banned"), apiKey("banned"), delegation("banned", ["mcp:write"])]) {
      expect(await check(subject, "join", ticket)).toEqual({ allow: false, reason: "banned" });
      expect(await check(subject, "vote", poll)).toEqual({ allow: false, reason: "banned" });
      expect(await check(subject, "read", event)).toEqual({ allow: false, reason: "banned" });
      expect(await check(subject, "manage", { kind: "operator", domain: "live" })).toEqual({ allow: false, reason: "banned" });
    }
    expect(await check(session("banned-until-future"), "vote", poll)).toEqual({ allow: false, reason: "banned" });
  });

  it("allows a user whose ban has expired", async () => {
    expect(await check(session("ban-expired"), "vote", poll)).toEqual({ allow: true, basis: ["verified_account"] });
  });

  it("denies a missing user and anonymous callers on member resources", async () => {
    expect(await check(session("ghost"), "vote", poll)).toEqual({ allow: false, reason: "unauthenticated" });
    expect(await check({ userId: null, authType: "anonymous" }, "join", ticket)).toEqual({ allow: false, reason: "unauthenticated" });
    // An anonymous subject never counts as the user it names.
    expect(await check({ userId: "buyer", authType: "anonymous" }, "join", ticket)).toEqual({ allow: false, reason: "unauthenticated" });
  });
});

describe("authorize: scopes", () => {
  it("needs a write scope for votes and purchases, and a read scope for reads", async () => {
    expect(await check(delegation("free", ["mcp:read"]), "vote", poll)).toEqual({ allow: false, reason: "insufficient_scope" });
    expect(await check(delegation("free", ["mcp:write"]), "vote", poll)).toMatchObject({ allow: true });
    expect(await check(apiKey("free", ["api:read"]), "purchase", event)).toEqual({ allow: false, reason: "insufficient_scope" });
    expect(await check(apiKey("free"), "purchase", event)).toMatchObject({ allow: true });
    expect(await check(delegation("buyer", ["mcp:read"]), "join", ticket)).toMatchObject({ allow: true });
    expect(await check(delegation("buyer", ["mcp:keys"]), "join", ticket)).toEqual({ allow: false, reason: "insufficient_scope" });
  });

  it("gives a delegation or API key without scopes nothing", async () => {
    expect(await check({ userId: "buyer", authType: "delegation" }, "join", ticket)).toEqual({ allow: false, reason: "insufficient_scope" });
    expect(await check({ userId: "buyer", authType: "api_key" }, "join", ticket)).toEqual({ allow: false, reason: "insufficient_scope" });
    expect(await check(delegation("free", []), "vote", poll)).toEqual({ allow: false, reason: "insufficient_scope" });
  });
});

describe("authorize: live rules", () => {
  it("lets free verified accounts vote but not unverified ones", async () => {
    expect(await check(session("free"), "vote", poll)).toEqual({ allow: true, basis: ["verified_account"] });
    expect(await check(session("unverified"), "vote", poll)).toEqual({ allow: false, reason: "email_unverified" });
    expect(await check(session("unverified"), "purchase", event)).toEqual({ allow: false, reason: "email_unverified" });
  });

  it("treats live event reads as public", async () => {
    expect(await check({ userId: null, authType: "anonymous" }, "read", event)).toEqual({ allow: true, basis: ["public"] });
    expect(await check(session("unverified"), "read", event)).toEqual({ allow: true, basis: ["public"] });
  });

  it("joins only with an active entitlement backed by an active ticket", async () => {
    expect(await check(session("buyer"), "join", ticket)).toEqual({ allow: true, basis: ["live_ticket"] });
    expect(await check(session("refunded"), "join", ticket)).toEqual({ allow: false, reason: "no_entitlement" });
    expect(await check(session("entitled-no-ticket"), "join", ticket)).toEqual({ allow: false, reason: "no_entitlement" });
    expect(await check(session("ticket-no-entitlement"), "join", ticket)).toEqual({ allow: false, reason: "no_entitlement" });
    expect(await check(session("buyer"), "join", { kind: "live_ticket", eventId: "evt_other" })).toEqual({ allow: false, reason: "no_entitlement" });
  });

  it("never lets Premium or VIP membership imply a ticket", async () => {
    expect(await check(session("vip"), "join", ticket)).toEqual({ allow: false, reason: "no_entitlement" });
    expect(await check(session("premium"), "join", ticket)).toEqual({ allow: false, reason: "no_entitlement" });
  });

  it("watches a replay only with its entitlement", async () => {
    const replay: AccessResource = { kind: "live_replay", eventId: "evt_1" };
    expect(await check(session("buyer"), "watch", replay)).toEqual({ allow: true, basis: ["live_replay_entitlement"] });
    expect(await check(session("vip"), "watch", replay)).toEqual({ allow: false, reason: "no_entitlement" });
  });
});

describe("authorize: videos and reserved resources", () => {
  it("keeps canWatchVideo semantics: paid members and buyers watch, free and lapsed members do not", async () => {
    for (const user of ["vip", "premium", "premium-trial", "video-buyer"]) {
      expect(await check(session(user), "watch", video)).toEqual({ allow: true, basis: ["course_video_access"] });
    }
    expect(await check(session("vip-canceled"), "watch", video)).toEqual({ allow: false, reason: "no_entitlement" });
    expect(await check(session("free"), "watch", video)).toEqual({ allow: false, reason: "no_entitlement" });
  });

  it("limits subscription access to the configured plans", async () => {
    const vipOnly = (user: string) =>
      authorize({ subject: session(user), action: "watch", resource: video }, { db: local.db, videoAccess: { accessPlans: ["vip"] } });
    expect(await vipOnly("vip")).toEqual({ allow: true, basis: ["course_video_access"] });
    expect(await vipOnly("premium")).toEqual({ allow: false, reason: "no_entitlement" });
  });

  it("denies assets, unknown resources and unsupported actions", async () => {
    expect(await check(session("vip"), "download", { kind: "asset", id: "a1" })).toEqual({ allow: false, reason: "not_available" });
    const unknown = { kind: "mystery", id: "x" } as unknown as AccessResource;
    expect(await check(session("vip"), "read", unknown)).toEqual({ allow: false, reason: "not_available" });
    const inherited = { kind: "toString" } as unknown as AccessResource;
    expect(await check(session("vip"), "read", inherited)).toEqual({ allow: false, reason: "not_available" });
    expect(await check(session("buyer"), "vote", ticket)).toEqual({ allow: false, reason: "not_available" });
  });

  it("denies when a fact lookup throws", async () => {
    const broken = { select: () => { throw new Error("D1 down"); } } as unknown as LocalD1["db"];
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const decision = await authorize({ subject: session("buyer"), action: "join", resource: ticket }, { db: broken });
    expect(decision).toEqual({ allow: false, reason: "not_available" });
    spy.mockRestore();
  });
});
