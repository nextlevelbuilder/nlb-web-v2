import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityConnections, users } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { discordAdapter } from "@/lib/community/discord-adapter";
import { ProviderError, type ApplyInput, type CommunityConnection, type MembershipTier } from "@/lib/community/types";

const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 3)).toString("base64");
const GUILD = "guild-1";
const PREMIUM = "role-premium";
const VIP = "role-vip";
const OTHER = "role-unrelated";
const MEMBER_URL = `https://discord.com/api/v10/guilds/${GUILD}/members/discord-42`;

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

const calls: Call[] = [];
type Responder = (call: Call) => Response | Promise<Response>;
let routes: Array<[string, string, Responder]> = [];

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
const noContent = () => new Response(null, { status: 204 });
const unknownMember = () => json({ message: "Unknown Member", code: 10007 }, 404);

/** Register a fake Discord endpoint; later registrations win. */
function on(method: string, url: string, responder: Responder) {
  routes.unshift([method, url, responder]);
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const call: Call = {
    method: init?.method ?? "GET",
    url: String(input),
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    body: init?.body === undefined ? undefined : String(init.body),
  };
  calls.push(call);
  const route = routes.find(([method, url]) => method === call.method && url === call.url);
  return route ? route[2](call) : json({ message: "unrouted" }, 599);
});

const mutations = () => calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.url.replace(MEMBER_URL, "member")}`);

let seq = 0;
async function connectedUser(overrides: Partial<typeof communityConnections.$inferInsert> = {}): Promise<CommunityConnection> {
  const userId = `discord-adapter-user-${++seq}`;
  await getDb().insert(users).values({ id: userId, name: userId, email: `${userId}@example.com`, emailVerified: true });
  const [row] = await getDb()
    .insert(communityConnections)
    .values({
      userId,
      provider: "discord",
      externalUserId: "discord-42",
      accessTokenEnc: await encryptSecret("access-1"),
      refreshTokenEnc: await encryptSecret("refresh-1"),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
      ...overrides,
    })
    .returning();
  return row;
}

function apply(connection: CommunityConnection | null, desiredTier: MembershipTier, appliedTier: MembershipTier = "none") {
  const input: ApplyInput = {
    db: getDb(),
    userId: connection?.userId ?? "nobody",
    target: "discord_guild",
    desiredTier,
    connection,
    current: connection
      ? {
          id: "state",
          userId: connection.userId,
          target: "discord_guild",
          desiredTier,
          appliedTier,
          status: "active",
          errorCode: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null,
  };
  return discordAdapter.apply(input);
}

function memberWithRoles(roles: string[]) {
  on("GET", MEMBER_URL, () => json({ roles, user: { id: "discord-42" } }));
}

function acceptRoleCalls() {
  for (const role of [PREMIUM, VIP]) {
    on("PUT", `${MEMBER_URL}/roles/${role}`, noContent);
    on("DELETE", `${MEMBER_URL}/roles/${role}`, noContent);
  }
}

beforeEach(async () => {
  await getDb().delete(communityConnections);
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", KEY);
  vi.stubEnv("DISCORD_CLIENT_ID", "client-id");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "client-secret");
  vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
  vi.stubEnv("DISCORD_GUILD_ID", GUILD);
  vi.stubEnv("DISCORD_PREMIUM_ROLE_ID", PREMIUM);
  vi.stubEnv("DISCORD_VIP_ROLE_ID", VIP);
  vi.stubGlobal("fetch", fetchMock);
  calls.length = 0;
  routes = [];
  acceptRoleCalls();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("discordAdapter", () => {
  it("reports not_connected without calling Discord when no account is linked", async () => {
    expect(await apply(null, "premium")).toEqual({ status: "not_connected", appliedTier: "none" });
    expect(calls).toHaveLength(0);
  });

  it("joins a premium member to the guild with the Premium role, as the bot with an audit reason", async () => {
    const connection = await connectedUser();
    on("GET", MEMBER_URL, unknownMember);
    on("PUT", MEMBER_URL, () => new Response(null, { status: 201 }));

    expect(await apply(connection, "premium")).toEqual({ status: "active", appliedTier: "premium" });
    const join = calls.find((call) => call.method === "PUT" && call.url === MEMBER_URL)!;
    expect(JSON.parse(join.body!)).toEqual({ access_token: "access-1", roles: [PREMIUM] });
    expect(join.headers.authorization).toBe("Bot bot-token");
    expect(join.headers["x-audit-log-reason"]).toBeTruthy();
  });

  it("adds the roles itself when the member joined on their own before the join call", async () => {
    const connection = await connectedUser();
    on("GET", MEMBER_URL, unknownMember);
    on("PUT", MEMBER_URL, noContent);

    expect(await apply(connection, "vip")).toEqual({ status: "active", appliedTier: "vip" });
    expect(mutations()).toEqual([
      "PUT member",
      `PUT member/roles/${PREMIUM}`,
      `PUT member/roles/${VIP}`,
    ]);
  });

  it("gives an existing VIP member both roles without touching unrelated roles", async () => {
    const connection = await connectedUser();
    memberWithRoles([OTHER]);
    expect(await apply(connection, "vip")).toEqual({ status: "active", appliedTier: "vip" });
    expect(mutations()).toEqual([`PUT member/roles/${PREMIUM}`, `PUT member/roles/${VIP}`]);
  });

  it("downgrades VIP to Premium by removing only the VIP role", async () => {
    const connection = await connectedUser();
    memberWithRoles([PREMIUM, VIP, OTHER]);
    expect(await apply(connection, "premium", "vip")).toEqual({ status: "active", appliedTier: "premium" });
    expect(mutations()).toEqual([`DELETE member/roles/${VIP}`]);
  });

  it("revokes by removing only NLB roles and never kicks", async () => {
    const connection = await connectedUser();
    memberWithRoles([PREMIUM, VIP, OTHER]);
    expect(await apply(connection, "none", "vip")).toEqual({ status: "revoked", appliedTier: "none" });
    expect(mutations()).toEqual([`DELETE member/roles/${PREMIUM}`, `DELETE member/roles/${VIP}`]);
  });

  it("treats a revoked user who already left the guild as revoked", async () => {
    const connection = await connectedUser();
    on("GET", MEMBER_URL, unknownMember);
    expect(await apply(connection, "none", "premium")).toEqual({ status: "revoked", appliedTier: "none" });
    expect(mutations()).toEqual([]);
  });

  it("throws a retryable error carrying Discord's retry-after on 429", async () => {
    const connection = await connectedUser();
    on("GET", MEMBER_URL, () => json({ message: "You are being rate limited.", retry_after: 2.5, global: false }, 429));
    const error = await apply(connection, "premium").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: "discord_rate_limited", retryable: true, retryAfterMs: 2500 });
  });

  it("retries 5xx responses and network failures", async () => {
    const connection = await connectedUser();
    on("GET", MEMBER_URL, () => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(apply(connection, "premium")).rejects.toMatchObject({ code: "discord_http_502", retryable: true });
    on("GET", MEMBER_URL, () => Promise.reject(new TypeError("fetch failed")));
    await expect(apply(connection, "premium")).rejects.toMatchObject({ code: "discord_network", retryable: true });
  });

  it("refreshes an expired token before joining and re-seals the new tokens", async () => {
    const connection = await connectedUser({ tokenExpiresAt: new Date(Date.now() - 1000) });
    on("GET", MEMBER_URL, unknownMember);
    on("POST", "https://discord.com/api/v10/oauth2/token", () =>
      json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 604800, token_type: "Bearer" })
    );
    on("PUT", MEMBER_URL, () => new Response(null, { status: 201 }));

    expect(await apply(connection, "vip")).toEqual({ status: "active", appliedTier: "vip" });
    const refresh = new URLSearchParams(calls.find((call) => call.url.endsWith("/oauth2/token"))!.body);
    expect(refresh.get("grant_type")).toBe("refresh_token");
    expect(refresh.get("refresh_token")).toBe("refresh-1");
    expect(JSON.parse(calls.find((call) => call.method === "PUT" && call.url === MEMBER_URL)!.body!).access_token).toBe("access-2");

    const [row] = await getDb().select().from(communityConnections).where(eq(communityConnections.id, connection.id));
    expect(await decryptSecret(row.accessTokenEnc!)).toBe("access-2");
    expect(await decryptSecret(row.refreshTokenEnc!)).toBe("refresh-2");
    expect(row.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("asks the member to re-authorize when the refresh grant is invalid", async () => {
    const connection = await connectedUser({ tokenExpiresAt: new Date(Date.now() - 1000) });
    on("GET", MEMBER_URL, unknownMember);
    on("POST", "https://discord.com/api/v10/oauth2/token", () => json({ error: "invalid_grant" }, 400));
    expect(await apply(connection, "premium")).toEqual({ status: "action_required", appliedTier: "none", errorCode: "discord_reauth" });
  });

  it("refreshes once when Discord rejects a token that looked valid", async () => {
    const connection = await connectedUser();
    on("GET", MEMBER_URL, unknownMember);
    on("POST", "https://discord.com/api/v10/oauth2/token", () =>
      json({ access_token: "access-3", refresh_token: "refresh-3", expires_in: 604800 })
    );
    on("PUT", MEMBER_URL, (call) =>
      JSON.parse(call.body!).access_token === "access-3"
        ? new Response(null, { status: 201 })
        : json({ message: "Invalid OAuth2 access token", code: 50025 }, 403)
    );
    expect(await apply(connection, "premium")).toEqual({ status: "active", appliedTier: "premium" });
  });

  it.each([
    [50013, "discord_missing_permissions"],
    [10004, "discord_unknown_guild"],
    [10011, "discord_unknown_role"],
  ])("returns action_required for permanent Discord error %i", async (code, errorCode) => {
    const connection = await connectedUser();
    memberWithRoles([]);
    on("PUT", `${MEMBER_URL}/roles/${PREMIUM}`, () => json({ message: "nope", code }, code === 50013 ? 403 : 404));
    expect(await apply(connection, "premium", "premium")).toEqual({ status: "action_required", appliedTier: "premium", errorCode });
  });

  it("never grants to a connection the member unlinked or replaced after it was read", async () => {
    const unlinked = await connectedUser();
    await getDb().update(communityConnections).set({ unlinkRequestedAt: new Date() }).where(eq(communityConnections.id, unlinked.id));
    on("GET", MEMBER_URL, unknownMember);
    await expect(apply(unlinked, "premium")).rejects.toMatchObject({ code: "connection_changed", retryable: true });
    await getDb().delete(communityConnections);

    const replaced = await connectedUser();
    await getDb().update(communityConnections).set({ externalUserId: "discord-other" }).where(eq(communityConnections.id, replaced.id));
    memberWithRoles([]);
    await expect(apply(replaced, "vip")).rejects.toMatchObject({ code: "connection_changed", retryable: true });
    await getDb().delete(communityConnections);

    const deleted = await connectedUser();
    await getDb().delete(communityConnections).where(eq(communityConnections.id, deleted.id));
    await expect(apply(deleted, "premium")).rejects.toMatchObject({ code: "connection_changed", retryable: true });
    expect(mutations()).toEqual([]);
  });

  it("returns action_required when the bot is not configured", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    const connection = await connectedUser();
    expect(await apply(connection, "premium")).toMatchObject({ status: "action_required", errorCode: "discord_not_configured" });
    expect(calls).toHaveLength(0);
  });
});
