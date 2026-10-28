import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("./live-api-fixtures")).authApiKeyMock);

/** Fake Polar SDK object: the only Polar surface the member routes touch is `checkouts.create`. */
const polarFake = vi.hoisted(() => ({
  checkouts: { create: vi.fn(async () => ({ id: "chk-1", url: "https://polar.test/checkout/chk-1" })) },
  products: { create: vi.fn(), update: vi.fn() },
  orders: { get: vi.fn() },
  refunds: { create: vi.fn() },
}));
vi.mock("@/lib/polar", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/polar")>()), polar: polarFake }));

import { getDb } from "@/lib/db";
import { customers, liveTicketReservations, subscriptions } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import { createRound } from "@/lib/live/polls";
import { createTopic, createTopicGroup } from "@/lib/live/topics";
import { GET as listEvents } from "@/app/api/v1/live/events/route";
import { GET as getEvent } from "@/app/api/v1/live/events/[slug]/route";
import { POST as checkout } from "@/app/api/v1/live/events/[slug]/checkout/route";
import { GET as myTicket } from "@/app/api/v1/live/events/[slug]/ticket/route";
import { GET as join } from "@/app/api/v1/live/events/[slug]/join/route";
import { GET as currentPoll } from "@/app/api/v1/live/polls/current/route";
import { POST as vote } from "@/app/api/v1/live/polls/[roundId]/vote/route";
import {
  HOUR,
  MINUTE,
  TEST_ENCRYPTION_KEY,
  asCaller,
  getRequest,
  installZoomFetch,
  jsonRequest,
  nextSeq,
  params,
  readJson,
  refundOrder,
  seedOnSaleEvent,
  seedTicketHolder,
  seedUser,
  setCaller,
  setZoomCredentials,
} from "./live-api-fixtures";

async function seedOpenRound(): Promise<{ roundId: string; topicIds: string[] }> {
  const n = nextSeq();
  const group = await createTopicGroup({ slug: `api-group-${n}`, titleEn: "Group", titleVi: "Nhóm" }, getDb());
  const topicIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    topicIds.push((await createTopic({ groupId: group.id, slug: `api-topic-${n}-${i}`, titleEn: `T${i}`, titleVi: `T${i}`, createdBy: "op" }, getDb())).id);
  }
  const round = await createRound(
    { slug: `api-round-${n}`, titleEn: "Round", titleVi: "Vòng", opensAt: new Date(Date.now() - HOUR), closesAt: new Date(Date.now() + HOUR), topicIds, createdBy: "op" },
    getDb()
  );
  return { roundId: round.id, topicIds };
}

const voteRequest = (roundId: string, topicId: string, headers: Record<string, string> = {}) =>
  jsonRequest(`/api/v1/live/polls/${roundId}/vote`, "POST", { topicId }, headers);
const checkoutRequest = (slug: string, body: unknown = { recordingConsent: true, locale: "en" }) =>
  jsonRequest(`/api/v1/live/events/${slug}/checkout`, "POST", body);

let round: { roundId: string; topicIds: string[] };

beforeEach(async () => {
  process.env.LIVE_ENABLED = "true";
  process.env.ONBOARDING_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  setCaller(null);
  polarFake.checkouts.create.mockClear();
  round ??= await seedOpenRound();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setZoomCredentials(false);
});

describe("Live member API feature flag", () => {
  it("answers 404 on every member route while LIVE_ENABLED is off", async () => {
    process.env.LIVE_ENABLED = "false";
    const event = await seedOnSaleEvent();
    const member = await seedUser("flag");
    setCaller(asCaller(member, "session"));
    const slug = { slug: event.slug };
    const responses = [
      await listEvents(),
      await getEvent(getRequest(`/api/v1/live/events/${event.slug}`), params(slug)),
      await checkout(checkoutRequest(event.slug), params(slug)),
      await myTicket(getRequest(`/api/v1/live/events/${event.slug}/ticket`), params(slug)),
      await join(getRequest(`/api/v1/live/events/${event.slug}/join`), params(slug)),
      await currentPoll(getRequest("/api/v1/live/polls/current")),
      await vote(voteRequest(round.roundId, round.topicIds[0]), params({ roundId: round.roundId })),
    ];
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
    expect(polarFake.checkouts.create).not.toHaveBeenCalled();
  });
});

describe("public event reads", () => {
  it("lists and shows published events with seatsLeft, never drafts", async () => {
    const event = await seedOnSaleEvent({ capacity: 3 });
    const listed = await readJson(await listEvents());
    expect(listed.data.upcoming.map((e: { slug: string }) => e.slug)).toContain(event.slug);

    const detail = await getEvent(getRequest(`/api/v1/live/events/${event.slug}`), params({ slug: event.slug }));
    expect(detail.status).toBe(200);
    const body = await readJson(detail);
    expect(body.data).toMatchObject({ slug: event.slug, seatsLeft: 3, status: "sales_open" });
    expect(body.data).not.toHaveProperty("polarProductId");
    expect((await getEvent(getRequest("/api/v1/live/events/missing"), params({ slug: "missing" }))).status).toBe(404);
  });
});

describe("voting authorization", () => {
  it("refuses anonymous, unverified, banned, API keys without write scope and delegations without write scope", async () => {
    const [topicId] = round.topicIds;
    const ctx = params({ roundId: round.roundId });

    setCaller(null);
    expect((await vote(voteRequest(round.roundId, topicId), ctx)).status).toBe(401);

    const unverified = await seedUser("unverified", { emailVerified: false });
    setCaller(asCaller(unverified, "session", false));
    const unverifiedRes = await vote(voteRequest(round.roundId, topicId), ctx);
    expect(unverifiedRes.status).toBe(403);
    expect((await readJson(unverifiedRes)).error?.code).toBe("email_unverified");

    const banned = await seedUser("banned", { banned: true });
    setCaller(asCaller(banned, "session"));
    expect((await readJson(await vote(voteRequest(round.roundId, topicId), ctx))).error?.code).toBe("banned");

    // A delegation signed for read only is not accepted on a write route (resolveCaller refuses it).
    const agentUser = await seedUser("agent");
    setCaller(asCaller(agentUser, "delegation"), "mcp:read");
    expect((await vote(voteRequest(round.roundId, topicId), ctx)).status).toBe(401);
    setCaller(asCaller(agentUser, "delegation"), "mcp:keys");
    expect((await vote(voteRequest(round.roundId, topicId), ctx)).status).toBe(401);
  });

  it("records, changes and re-submits a vote, and replays an Idempotency-Key", async () => {
    const voter = await seedUser("voter");
    setCaller(asCaller(voter, "session"));
    const ctx = params({ roundId: round.roundId });
    const first = await readJson(await vote(voteRequest(round.roundId, round.topicIds[0]), ctx));
    expect(first.data).toMatchObject({ roundId: round.roundId, topicId: round.topicIds[0], changed: true });
    const changed = await readJson(await vote(voteRequest(round.roundId, round.topicIds[1]), ctx));
    expect(changed.data).toMatchObject({ topicId: round.topicIds[1], changed: true });
    const same = await readJson(await vote(voteRequest(round.roundId, round.topicIds[1]), ctx));
    expect(same.data).toMatchObject({ topicId: round.topicIds[1], changed: false });

    const keyed = { "idempotency-key": "vote-key-1" };
    const once = await vote(voteRequest(round.roundId, round.topicIds[0], keyed), ctx);
    const replay = await vote(voteRequest(round.roundId, round.topicIds[0], keyed), ctx);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await replay.text()).toBe(await once.text());

    const current = await readJson(await currentPoll(getRequest("/api/v1/live/polls/current")));
    expect(current.data).toMatchObject({ id: round.roundId, myVoteTopicId: round.topicIds[0], talliesVisible: false, viewer: { canVote: true } });
  });

  it("accepts an API key (legacy write scope) and a write-scoped delegation", async () => {
    const keyUser = await seedUser("keyvoter");
    setCaller(asCaller(keyUser, "api_key"));
    expect((await vote(voteRequest(round.roundId, round.topicIds[0]), params({ roundId: round.roundId }))).status).toBe(200);
    const agentUser = await seedUser("agentvoter");
    setCaller(asCaller(agentUser, "delegation"), "mcp:write");
    expect((await vote(voteRequest(round.roundId, round.topicIds[0]), params({ roundId: round.roundId }))).status).toBe(200);
  });

  it("refuses a cross-site session write", async () => {
    const voter = await seedUser("xsite");
    setCaller(asCaller(voter, "session"));
    const response = await vote(voteRequest(round.roundId, round.topicIds[0], { origin: "https://evil.test" }), params({ roundId: round.roundId }));
    expect(response.status).toBe(403);
    expect((await readJson(response)).error?.code).toBe("cross_site_request");
  });
});

describe("ticket checkout", () => {
  it("refuses anonymous, unverified, banned and read-only delegations before holding a seat", async () => {
    const event = await seedOnSaleEvent();
    const ctx = params({ slug: event.slug });
    setCaller(null);
    expect((await checkout(checkoutRequest(event.slug), ctx)).status).toBe(401);
    const unverified = await seedUser("chk-unverified", { emailVerified: false });
    setCaller(asCaller(unverified, "session", false));
    expect((await checkout(checkoutRequest(event.slug), ctx)).status).toBe(403);
    const banned = await seedUser("chk-banned", { banned: true });
    setCaller(asCaller(banned, "api_key"));
    expect((await checkout(checkoutRequest(event.slug), ctx)).status).toBe(403);
    const agent = await seedUser("chk-agent");
    setCaller(asCaller(agent, "delegation"), "mcp:read");
    expect((await checkout(checkoutRequest(event.slug), ctx)).status).toBe(401);

    const holds = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.eventId, event.id));
    expect(holds).toHaveLength(0);
    expect(polarFake.checkouts.create).not.toHaveBeenCalled();
  });

  it("requires recording consent", async () => {
    const event = await seedOnSaleEvent();
    const buyer = await seedUser("chk-consent");
    setCaller(asCaller(buyer, "session"));
    const response = await checkout(checkoutRequest(event.slug, { recordingConsent: false }), params({ slug: event.slug }));
    expect(response.status).toBe(400);
    expect((await readJson(response)).error?.code).toBe("recording_consent_required");
  });

  it("returns the Polar checkout url and holds exactly one seat, reused on retry", async () => {
    const event = await seedOnSaleEvent();
    const buyer = await seedUser("chk-buyer");
    setCaller(asCaller(buyer, "session"));
    const ctx = params({ slug: event.slug });

    const first = await checkout(checkoutRequest(event.slug, { recordingConsent: true, locale: "vi" }), ctx);
    expect(first.status).toBe(200);
    expect((await readJson(first)).data.url).toBe("https://polar.test/checkout/chk-1");
    expect((await checkout(checkoutRequest(event.slug), ctx)).status).toBe(200);

    const holds = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.eventId, event.id));
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ userId: buyer.id, status: "held" });
    expect(polarFake.checkouts.create).toHaveBeenCalledWith(
      expect.objectContaining({ products: [event.polarProductId], customerEmail: buyer.email, metadata: expect.objectContaining({ reservationId: holds[0].id, userId: buyer.id }) })
    );

    const ticket = await readJson(await myTicket(getRequest(`/api/v1/live/events/${event.slug}/ticket`), ctx));
    expect(ticket.data).toMatchObject({ ticket: null, hold: { reservationId: holds[0].id } });
  });

  it("answers 409 sold_out and already_ticketed", async () => {
    const event = await seedOnSaleEvent({ capacity: 1 });
    const holder = await seedUser("chk-holder");
    await seedTicketHolder(event, holder);
    const ctx = params({ slug: event.slug });

    setCaller(asCaller(holder, "session"));
    expect((await readJson(await checkout(checkoutRequest(event.slug), ctx))).error?.code).toBe("already_ticketed");
    const late = await seedUser("chk-late");
    setCaller(asCaller(late, "session"));
    const soldOut = await checkout(checkoutRequest(event.slug), ctx);
    expect(soldOut.status).toBe(409);
    expect((await readJson(soldOut)).error?.code).toBe("sold_out");
  });
});

describe("join access", () => {
  it("refuses anonymous, banned and scope-less callers, and gives no join URL without an active ticket", async () => {
    setZoomCredentials(true);
    const { fetchMock } = installZoomFetch();
    const event = await seedOnSaleEvent({ startsInMs: 5 * MINUTE });
    const ctx = params({ slug: event.slug });
    const joinRequest = () => getRequest(`/api/v1/live/events/${event.slug}/join`);

    setCaller(null);
    expect((await join(joinRequest(), ctx)).status).toBe(401);
    const banned = await seedUser("join-banned", { banned: true });
    setCaller(asCaller(banned, "session"));
    expect((await join(joinRequest(), ctx)).status).toBe(403);
    const agent = await seedUser("join-agent");
    setCaller(asCaller(agent, "delegation"), "mcp:write");
    expect((await join(joinRequest(), ctx)).status).toBe(401);

    // VIP and Premium members without a ticket: membership never implies a seat.
    for (const productId of [PRODUCT_IDS.VIP_QUARTERLY || "prod_vip", PRODUCT_IDS.PREMIUM_QUARTERLY || "prod_premium"]) {
      const member = await seedUser("join-member");
      const customerId = crypto.randomUUID();
      await getDb().insert(customers).values({ id: customerId, email: member.email, userId: member.id });
      await getDb().insert(subscriptions).values({
        customerId, polarSubscriptionId: `sub-${member.id}`, polarProductId: productId, productName: "Membership", status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * HOUR),
      });
      setCaller(asCaller(member, "session"));
      const response = await join(joinRequest(), ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await readJson(response);
      expect(body.data.status).toBe("no_ticket");
      expect(body.data).not.toHaveProperty("joinUrl");
    }

    // A refunded ticket gets nothing either.
    const refunded = await seedUser("join-refunded");
    const orderId = await seedTicketHolder(event, refunded);
    await refundOrder(event, orderId, refunded);
    setCaller(asCaller(refunded, "session"));
    const refundedBody = await readJson(await join(joinRequest(), ctx));
    expect(refundedBody.data.status).toBe("no_ticket");
    expect(refundedBody.data).not.toHaveProperty("joinUrl");
    // No provider call happened for any refused caller.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the personal join URL to the ticket holder inside the window, never cached", async () => {
    setZoomCredentials(true);
    installZoomFetch();
    const event = await seedOnSaleEvent({ startsInMs: 5 * MINUTE });
    const holder = await seedUser("join-holder");
    await seedTicketHolder(event, holder);
    setCaller(asCaller(holder, "session"));
    const response = await join(getRequest(`/api/v1/live/events/${event.slug}/join`), params({ slug: event.slug }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await readJson(response);
    expect(body.data).toMatchObject({ status: "open", joinUrl: `https://zoom.us/w/987654321?tk=${encodeURIComponent(holder.email)}` });
  });

  it("answers not_ready without a configured provider and too_early before the window", async () => {
    setZoomCredentials(false);
    const soon = await seedOnSaleEvent({ startsInMs: 5 * MINUTE });
    const later = await seedOnSaleEvent({ startsInMs: 3 * HOUR });
    const holder = await seedUser("join-ready");
    await seedTicketHolder(soon, holder);
    await seedTicketHolder(later, holder);
    setCaller(asCaller(holder, "session"));
    const notReady = await readJson(await join(getRequest(`/api/v1/live/events/${soon.slug}/join`), params({ slug: soon.slug })));
    expect(notReady.data).toMatchObject({ status: "not_ready" });
    expect(notReady.data).not.toHaveProperty("joinUrl");
    const early = await readJson(await join(getRequest(`/api/v1/live/events/${later.slug}/join`), params({ slug: later.slug })));
    expect(early.data).toMatchObject({ status: "too_early" });
  });
});
