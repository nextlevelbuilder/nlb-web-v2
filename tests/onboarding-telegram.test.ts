import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityConnections, customers, onboardingJobs, onboardingNonces, users } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import { applySubscriptionSnapshot } from "@/lib/membership/subscription-sync";
import { issueNonce } from "@/lib/onboarding/nonces";
import { telegramAdapter } from "@/lib/community/telegram-adapter";
import { TELEGRAM_REPLIES } from "@/lib/community/telegram-webhook";
import { ProviderError, type ApplyInput, type CommunityConnection } from "@/lib/community/types";
import { POST as linkPOST } from "@/app/api/onboarding/telegram/link/route";
import { POST as joinLinkPOST } from "@/app/api/onboarding/telegram/join-link/route";
import { POST as webhookPOST } from "@/app/api/telegram/webhook/route";

const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

const BOT_TOKEN = "123456:test-bot-token-not-real";
const WEBHOOK_SECRET = "test-webhook-secret";
const GROUP_CHAT_ID = "-1001234567890";
const DAY = 24 * 60 * 60 * 1000;

/** Bot API stub: `responses[method]` is a queue of replies; unknown methods answer ok:true. */
type StubReply = { status?: number; body: unknown } | (() => never);
let responses: Record<string, StubReply[]> = {};
const telegramCalls: { method: string; params: Record<string, unknown>; url: string }[] = [];

function stubTelegram(method: string, ...replies: StubReply[]) {
  responses[method] = [...(responses[method] ?? []), ...replies];
}
const ok = (result: unknown): StubReply => ({ body: { ok: true, result } });
const apiError = (status: number, description: string, parameters?: Record<string, unknown>): StubReply => ({
  status,
  body: { ok: false, error_code: status, description, parameters },
});
const callsTo = (method: string) => telegramCalls.filter((call) => call.method === method);

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = url.split("/").at(-1) ?? "";
  telegramCalls.push({ method, url, params: JSON.parse(String(init?.body ?? "{}")) });
  const reply = responses[method]?.shift() ?? ok(true);
  if (typeof reply === "function") reply();
  const { status = 200, body } = reply as { status?: number; body: unknown };
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
});

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

async function createUser() {
  const id = nextId("tg-user");
  await getDb().insert(users).values({ id, name: id, email: `${id}@example.com`, emailVerified: true });
  return id;
}

/** A user with a linked Polar customer and a live subscription of `tier`. */
async function createMember(tier: "premium" | "vip" = "premium") {
  const userId = await createUser();
  const [customer] = await getDb().insert(customers).values({ email: `${userId}@example.com`, name: "Buyer", userId }).returning();
  const now = new Date();
  await applySubscriptionSnapshot(
    getDb(),
    {
      polarSubscriptionId: nextId("sub"),
      customerId: customer.id,
      productId: tier === "vip" ? PRODUCT_IDS.VIP_ANNUAL : PRODUCT_IDS.PREMIUM_ANNUAL,
      productName: tier,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * DAY),
      cancelAtPeriodEnd: false,
      endedAt: null,
      modifiedAt: now,
    },
    now
  );
  return userId;
}

async function linkTelegram(userId: string, telegramUserId: string) {
  const [row] = await getDb()
    .insert(communityConnections)
    .values({ userId, provider: "telegram", externalUserId: telegramUserId, displayName: "@someone" })
    .returning();
  return row;
}

async function connectionOf(userId: string) {
  const [row] = await getDb()
    .select()
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, "telegram")));
  return row;
}

async function reconcileJobFor(userId: string) {
  const [job] = await getDb()
    .select()
    .from(onboardingJobs)
    .where(eq(onboardingJobs.dedupeKey, `reconcile_access:${userId}:telegram_group`));
  return job;
}

function signIn(userId: string | null) {
  getSessionMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

const memberRequest = (path: string) => new Request(`https://nextlevelbuilder.io${path}`, { method: "POST" });

function webhook(update: unknown, secret: string | null = WEBHOOK_SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  return webhookPOST(
    new Request("https://nextlevelbuilder.io/api/telegram/webhook", { method: "POST", headers, body: JSON.stringify(update) })
  );
}

let updateSeq = 0;
const startUpdate = (telegramUserId: number, text: string, chatType = "private") => ({
  update_id: ++updateSeq,
  message: {
    message_id: updateSeq,
    text,
    chat: { id: telegramUserId, type: chatType },
    from: { id: telegramUserId, is_bot: false, first_name: "Tester", username: `tester${telegramUserId}` },
  },
});
const joinRequestUpdate = (telegramUserId: number, chatId: string | number = GROUP_CHAT_ID) => ({
  update_id: ++updateSeq,
  chat_join_request: {
    chat: { id: Number(chatId), type: "supergroup" },
    from: { id: telegramUserId, is_bot: false, first_name: "Tester" },
    user_chat_id: telegramUserId,
    date: 1,
  },
});

let telegramIdSeq = 900_000_000;
const nextTelegramId = () => ++telegramIdSeq;

beforeEach(async () => {
  responses = {};
  telegramCalls.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "@nlb_test_bot");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", GROUP_CHAT_ID);
  getSessionMock.mockReset();
  await getDb().delete(onboardingJobs);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/onboarding/telegram/link", () => {
  it("returns 404 while the onboarding flag is off", async () => {
    vi.stubEnv("ONBOARDING_V2_ENABLED", "false");
    signIn(await createMember());
    expect((await linkPOST(memberRequest("/api/onboarding/telegram/link"))).status).toBe(404);
  });

  it("requires a session and a paid tier", async () => {
    signIn(null);
    expect((await linkPOST(memberRequest("/api/onboarding/telegram/link"))).status).toBe(401);
    signIn(await createUser());
    const response = await linkPOST(memberRequest("/api/onboarding/telegram/link"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "membership_required" });
  });

  it("issues a one-time deep link whose start parameter Telegram accepts", async () => {
    const userId = await createMember("vip");
    signIn(userId);
    const response = await linkPOST(memberRequest("/api/onboarding/telegram/link"));
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const match = /^https:\/\/t\.me\/nlb_test_bot\?start=(.+)$/.exec(url);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/^[A-Za-z0-9_-]{1,64}$/);

    const nonces = await getDb().select().from(onboardingNonces).where(eq(onboardingNonces.userId, userId));
    expect(nonces).toHaveLength(1);
    expect(nonces[0].kind).toBe("telegram_link");
    const ttl = nonces[0].expiresAt.getTime() - nonces[0].createdAt.getTime();
    expect(ttl).toBe(10 * 60 * 1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when the bot username is not configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "");
    signIn(await createMember());
    expect((await linkPOST(memberRequest("/api/onboarding/telegram/link"))).status).toBe(503);
  });
});

describe("POST /api/telegram/webhook", () => {
  async function issueLinkNonce(userId: string, ttlMs = 10 * 60 * 1000, now = new Date()) {
    return issueNonce(getDb(), { kind: "telegram_link", userId, ttlMs }, now);
  }

  it("rejects a missing or wrong secret header", async () => {
    expect((await webhook(startUpdate(1, "/start x"), null)).status).toBe(401);
    expect((await webhook(startUpdate(1, "/start x"), "wrong-secret")).status).toBe(401);
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect((await webhook(startUpdate(1, "/start x"), "")).status).toBe(401);
  });

  it("links the Telegram account on /start <nonce>, enqueues reconcile and replies in EN and VI", async () => {
    const userId = await createMember();
    const telegramUserId = nextTelegramId();
    const nonce = await issueLinkNonce(userId);

    const response = await webhook(startUpdate(telegramUserId, `/start ${nonce}`));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { method: string; chat_id: number; text: string };
    expect(body).toEqual({ method: "sendMessage", chat_id: telegramUserId, text: TELEGRAM_REPLIES.linked });
    expect(body.text).toContain("linked");
    expect(body.text).toContain("liên kết");

    const connection = await connectionOf(userId);
    expect(connection).toMatchObject({ externalUserId: String(telegramUserId), displayName: `@tester${telegramUserId}` });
    expect(connection.accessTokenEnc).toBeNull();
    expect(connection.refreshTokenEnc).toBeNull();
    expect(await reconcileJobFor(userId)).toMatchObject({ kind: "reconcile_access", status: "pending" });
    expect(fetchMock).not.toHaveBeenCalled();

    // Telegram redelivers the same update: the nonce is spent, the answer stays "linked".
    const again = await webhook(startUpdate(telegramUserId, `/start ${nonce}`));
    expect(((await again.json()) as { text: string }).text).toBe(TELEGRAM_REPLIES.linked);
    expect(await getDb().select().from(communityConnections).where(eq(communityConnections.userId, userId))).toHaveLength(1);
  });

  it("refuses an expired, used or unknown nonce without linking", async () => {
    const userId = await createMember();
    const expired = await issueLinkNonce(userId, 1000, new Date(Date.now() - 60_000));
    const telegramUserId = nextTelegramId();
    for (const text of [`/start ${expired}`, "/start not-a-real-nonce", "/start", "/start bad$chars"]) {
      const response = await webhook(startUpdate(telegramUserId, text));
      expect(response.status).toBe(200);
      expect(((await response.json()) as { text: string }).text).toBe(TELEGRAM_REPLIES.invalidLink);
    }
    expect(await connectionOf(userId)).toBeUndefined();

    const used = await issueLinkNonce(userId);
    await webhook(startUpdate(telegramUserId, `/start ${used}`));
    const otherTelegramId = nextTelegramId();
    const reuse = await webhook(startUpdate(otherTelegramId, `/start ${used}`));
    expect(((await reuse.json()) as { text: string }).text).toBe(TELEGRAM_REPLIES.invalidLink);
    expect((await connectionOf(userId)).externalUserId).toBe(String(telegramUserId));
  });

  it("never moves a Telegram account that is already linked to another NLB user", async () => {
    const owner = await createMember();
    const telegramUserId = nextTelegramId();
    await linkTelegram(owner, String(telegramUserId));
    const other = await createMember();
    const nonce = await issueLinkNonce(other);

    const response = await webhook(startUpdate(telegramUserId, `/start ${nonce}`));
    expect(((await response.json()) as { text: string }).text).toBe(TELEGRAM_REPLIES.telegramInUse);
    expect((await connectionOf(owner)).externalUserId).toBe(String(telegramUserId));
    expect(await connectionOf(other)).toBeUndefined();
    expect(await reconcileJobFor(other)).toBeUndefined();
  });

  it("never replaces the Telegram account an NLB user already linked", async () => {
    const userId = await createMember();
    await linkTelegram(userId, String(nextTelegramId()));
    const nonce = await issueLinkNonce(userId);
    const response = await webhook(startUpdate(nextTelegramId(), `/start ${nonce}`));
    expect(((await response.json()) as { text: string }).text).toBe(TELEGRAM_REPLIES.accountHasOtherTelegram);
  });

  it("ignores /start outside private chats and other updates", async () => {
    const userId = await createMember();
    const nonce = await issueLinkNonce(userId);
    const response = await webhook(startUpdate(-100555, `/start ${nonce}`, "supergroup"));
    expect(await response.json()).toEqual({ ok: true });
    expect(await connectionOf(userId)).toBeUndefined();
    expect(await (await webhook({ update_id: 1, edited_message: { text: "hi" } })).json()).toEqual({ ok: true });
  });

  it("approves a join request from a linked, entitled user and enqueues reconcile", async () => {
    const userId = await createMember();
    const telegramUserId = nextTelegramId();
    await linkTelegram(userId, String(telegramUserId));

    const response = await webhook(joinRequestUpdate(telegramUserId));
    expect(response.status).toBe(200);
    expect(callsTo("approveChatJoinRequest")).toEqual([
      expect.objectContaining({ params: { chat_id: GROUP_CHAT_ID, user_id: telegramUserId } }),
    ]);
    expect(callsTo("declineChatJoinRequest")).toHaveLength(0);
    expect(await reconcileJobFor(userId)).toMatchObject({ status: "pending" });
  });

  it("removes the account again when an unlink lands while the approval is in flight", async () => {
    const passThrough = fetchMock.getMockImplementation()!;
    const unlinkDuringApproval = (finish: () => Promise<unknown>) =>
      fetchMock.mockImplementationOnce(async (input, init) => {
        await finish();
        return passThrough(input, init);
      });

    // The unlink job already deleted the link.
    const deleted = await createMember();
    const deletedTelegramId = nextTelegramId();
    await linkTelegram(deleted, String(deletedTelegramId));
    unlinkDuringApproval(() => getDb().delete(communityConnections).where(eq(communityConnections.userId, deleted)));
    stubTelegram("getChatMember", ok({ status: "member" }));
    expect((await webhook(joinRequestUpdate(deletedTelegramId))).status).toBe(200);
    expect(callsTo("approveChatJoinRequest")).toHaveLength(1);
    expect(callsTo("banChatMember").map((call) => call.params.user_id)).toEqual([deletedTelegramId]);
    expect(callsTo("unbanChatMember").map((call) => call.params.user_id)).toEqual([deletedTelegramId]);

    // The unlink is pending; an admin is never removed.
    telegramCalls.length = 0;
    const admin = await createMember();
    const adminTelegramId = nextTelegramId();
    await linkTelegram(admin, String(adminTelegramId));
    unlinkDuringApproval(() =>
      getDb().update(communityConnections).set({ unlinkRequestedAt: new Date() }).where(eq(communityConnections.userId, admin))
    );
    stubTelegram("getChatMember", ok({ status: "administrator" }));
    await webhook(joinRequestUpdate(adminTelegramId));
    expect(callsTo("getChatMember")).toHaveLength(1);
    expect(callsTo("banChatMember")).toHaveLength(0);

    // A link that stayed in place keeps the member.
    telegramCalls.length = 0;
    const kept = await createMember();
    const keptTelegramId = nextTelegramId();
    await linkTelegram(kept, String(keptTelegramId));
    await webhook(joinRequestUpdate(keptTelegramId));
    expect(callsTo("approveChatJoinRequest")).toHaveLength(1);
    expect(callsTo("getChatMember")).toHaveLength(0);
  });

  it("declines join requests only from linked users without a tier", async () => {
    const lapsed = await createUser();
    const lapsedTelegramId = nextTelegramId();
    await linkTelegram(lapsed, String(lapsedTelegramId));
    await webhook(joinRequestUpdate(lapsedTelegramId));

    expect(callsTo("approveChatJoinRequest")).toHaveLength(0);
    expect(callsTo("declineChatJoinRequest").map((call) => call.params.user_id)).toEqual([lapsedTelegramId]);
    expect(await reconcileJobFor(lapsed)).toMatchObject({ status: "pending" });
  });

  it("leaves join requests from accounts not linked through NLB to the group admins", async () => {
    const response = await webhook(joinRequestUpdate(nextTelegramId()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores join requests for other chats", async () => {
    const userId = await createMember();
    const telegramUserId = nextTelegramId();
    await linkTelegram(userId, String(telegramUserId));
    const response = await webhook(joinRequestUpdate(telegramUserId, "-1009999999999"));
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Telegram to redeliver on a transient failure and treats an already handled request as done", async () => {
    const userId = await createMember();
    const telegramUserId = nextTelegramId();
    await linkTelegram(userId, String(telegramUserId));

    stubTelegram("approveChatJoinRequest", apiError(429, "Too Many Requests: retry after 3", { retry_after: 3 }));
    expect((await webhook(joinRequestUpdate(telegramUserId))).status).toBe(503);

    stubTelegram("approveChatJoinRequest", apiError(400, "Bad Request: HIDE_REQUESTER_MISSING"));
    expect((await webhook(joinRequestUpdate(telegramUserId))).status).toBe(200);
  });

  it("never echoes the bot token in responses", async () => {
    const response = await webhook(joinRequestUpdate(nextTelegramId()));
    expect(JSON.stringify(await response.json())).not.toContain(BOT_TOKEN);
  });
});

describe("POST /api/onboarding/telegram/join-link", () => {
  it("requires a session, a tier and a linked account", async () => {
    signIn(null);
    expect((await joinLinkPOST(memberRequest("/api/onboarding/telegram/join-link"))).status).toBe(401);

    const unpaid = await createUser();
    await linkTelegram(unpaid, String(nextTelegramId()));
    signIn(unpaid);
    expect((await joinLinkPOST(memberRequest("/api/onboarding/telegram/join-link"))).status).toBe(403);

    signIn(await createMember());
    const response = await joinLinkPOST(memberRequest("/api/onboarding/telegram/join-link"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "telegram_not_linked" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a 24h join-request invite link named with a non-PII short id", async () => {
    const userId = await createMember();
    await linkTelegram(userId, String(nextTelegramId()));
    signIn(userId);
    stubTelegram("createChatInviteLink", ok({ invite_link: "https://t.me/+abcDEF123" }));

    const before = Math.floor(Date.now() / 1000);
    const response = await joinLinkPOST(memberRequest("/api/onboarding/telegram/join-link"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://t.me/+abcDEF123" });

    const [call] = callsTo("createChatInviteLink");
    expect(call.params).toMatchObject({ chat_id: GROUP_CHAT_ID, creates_join_request: true });
    expect(call.params.name).toMatch(/^nlb-[0-9a-f]{10}$/);
    expect(String(call.params.name)).not.toContain(userId);
    const expire = call.params.expire_date as number;
    expect(expire - before).toBeGreaterThanOrEqual(24 * 60 * 60 - 5);
    expect(expire - before).toBeLessThanOrEqual(24 * 60 * 60 + 5);
  });

  it("maps provider failures to redacted codes", async () => {
    const userId = await createMember();
    await linkTelegram(userId, String(nextTelegramId()));
    signIn(userId);
    stubTelegram("createChatInviteLink", apiError(400, "Bad Request: not enough rights to manage chat invite link"));
    const response = await joinLinkPOST(memberRequest("/api/onboarding/telegram/join-link"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "telegram_bot_not_admin" });
  });
});

describe("telegramAdapter.apply", () => {
  const connection = (externalUserId: string) => ({ externalUserId }) as CommunityConnection;
  const input = (overrides: Partial<ApplyInput>): ApplyInput => ({
    db: getDb(),
    userId: "adapter-user",
    target: "telegram_group",
    desiredTier: "premium",
    connection: connection("4242"),
    current: null,
    ...overrides,
  });

  it("reports not_connected without calling Telegram when no account is linked", async () => {
    expect(await telegramAdapter.apply(input({ connection: null }))).toEqual({ status: "not_connected", appliedTier: "none" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is active for an entitled member and waiting_for_join otherwise", async () => {
    stubTelegram("getChatMember", ok({ status: "member" }), ok({ status: "administrator" }), ok({ status: "left" }), ok({ status: "kicked" }));
    expect(await telegramAdapter.apply(input({ desiredTier: "vip" }))).toEqual({ status: "active", appliedTier: "vip" });
    expect(await telegramAdapter.apply(input({}))).toEqual({ status: "active", appliedTier: "premium" });
    expect(await telegramAdapter.apply(input({}))).toEqual({ status: "waiting_for_join", appliedTier: "none" });
    expect(await telegramAdapter.apply(input({}))).toEqual({ status: "waiting_for_join", appliedTier: "none" });

    stubTelegram("getChatMember", apiError(400, "Bad Request: user not found"));
    expect(await telegramAdapter.apply(input({}))).toEqual({ status: "waiting_for_join", appliedTier: "none" });
    expect(callsTo("banChatMember")).toHaveLength(0);
  });

  it("removes a lapsed member with a short ban then an unban so they can rejoin later", async () => {
    stubTelegram("getChatMember", ok({ status: "member" }));
    const before = Math.floor(Date.now() / 1000);
    expect(await telegramAdapter.apply(input({ desiredTier: "none" }))).toEqual({ status: "revoked", appliedTier: "none" });

    const [ban] = callsTo("banChatMember");
    expect(ban.params).toMatchObject({ chat_id: GROUP_CHAT_ID, user_id: 4242, revoke_messages: false });
    expect((ban.params.until_date as number) - before).toBeGreaterThanOrEqual(30);
    expect(callsTo("unbanChatMember")).toEqual([
      expect.objectContaining({ params: { chat_id: GROUP_CHAT_ID, user_id: 4242, only_if_banned: true } }),
    ]);
    expect(telegramCalls.map((call) => call.method)).toEqual(["getChatMember", "banChatMember", "unbanChatMember"]);
  });

  it("does nothing for a lapsed user who already left", async () => {
    stubTelegram("getChatMember", ok({ status: "left" }), ok({ status: "restricted", is_member: false }));
    expect(await telegramAdapter.apply(input({ desiredTier: "none" }))).toEqual({ status: "revoked", appliedTier: "none" });
    expect(await telegramAdapter.apply(input({ desiredTier: "none" }))).toEqual({ status: "revoked", appliedTier: "none" });
    expect(callsTo("banChatMember")).toHaveLength(0);
  });

  it("never touches admins or the group owner", async () => {
    stubTelegram("getChatMember", ok({ status: "administrator" }), ok({ status: "creator" }));
    for (let i = 0; i < 2; i++) {
      expect(await telegramAdapter.apply(input({ desiredTier: "none" }))).toEqual({
        status: "action_required",
        appliedTier: "none",
        errorCode: "telegram_admin_not_removed",
      });
    }
    expect(callsTo("banChatMember")).toHaveLength(0);
    expect(callsTo("unbanChatMember")).toHaveLength(0);
  });

  it("throws a retryable ProviderError with retry-after on 429 and on 5xx or network failures", async () => {
    stubTelegram("getChatMember", apiError(429, "Too Many Requests: retry after 7", { retry_after: 7 }));
    const rateLimited = await telegramAdapter.apply(input({})).catch((error: unknown) => error);
    expect(rateLimited).toBeInstanceOf(ProviderError);
    expect(rateLimited).toMatchObject({ code: "telegram_rate_limited", retryable: true, retryAfterMs: 7000 });

    stubTelegram("getChatMember", ok({ status: "member" }));
    stubTelegram("banChatMember", apiError(502, "Bad Gateway"));
    await expect(telegramAdapter.apply(input({ desiredTier: "none" }))).rejects.toMatchObject({
      code: "telegram_unavailable",
      retryable: true,
    });

    stubTelegram("getChatMember", () => {
      throw new TypeError("fetch failed");
    });
    await expect(telegramAdapter.apply(input({}))).rejects.toMatchObject({ code: "telegram_network", retryable: true });

    stubTelegram("getChatMember", () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(telegramAdapter.apply(input({}))).rejects.toMatchObject({ code: "telegram_timeout", retryable: true });
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true);
  });

  it("needs an operator when the bot is not admin or the chat is missing", async () => {
    stubTelegram("getChatMember", apiError(400, "Bad Request: chat not found"));
    expect(await telegramAdapter.apply(input({}))).toEqual({
      status: "action_required",
      appliedTier: "none",
      errorCode: "telegram_chat_not_found",
    });

    stubTelegram("getChatMember", ok({ status: "member" }));
    stubTelegram("banChatMember", apiError(400, "Bad Request: not enough rights to restrict/unrestrict chat member"));
    expect(await telegramAdapter.apply(input({ desiredTier: "none" }))).toEqual({
      status: "action_required",
      appliedTier: "none",
      errorCode: "telegram_bot_not_admin",
    });

    vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", "");
    expect(await telegramAdapter.apply(input({}))).toEqual({
      status: "action_required",
      appliedTier: "none",
      errorCode: "telegram_not_configured",
    });
  });

  it("keeps the bot token out of error codes and messages", async () => {
    stubTelegram("getChatMember", apiError(500, `Internal error for bot${BOT_TOKEN}`));
    const error = (await telegramAdapter.apply(input({})).catch((e: unknown) => e)) as ProviderError;
    expect(error.code).not.toContain(BOT_TOKEN);
    expect(error.message).not.toContain(BOT_TOKEN);
  });
});
