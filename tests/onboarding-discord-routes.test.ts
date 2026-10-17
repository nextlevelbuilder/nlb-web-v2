import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityConnections, onboardingJobs, users } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { issueNonce } from "@/lib/onboarding/nonces";

const getSessionMock = vi.fn();
const getMemberTierMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

vi.mock("@/lib/membership/member-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/membership/member-access")>()),
  getMemberTier: (...args: unknown[]) => getMemberTierMock(...args),
}));

const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 7)).toString("base64");
const APP = "https://nlb.test";
const fetchMock = vi.fn<typeof fetch>();

let seq = 0;
async function createUser() {
  const id = `discord-route-user-${++seq}`;
  await getDb().insert(users).values({ id, name: id, email: `${id}@example.com`, emailVerified: true });
  return id;
}

function signIn(userId: string | null) {
  getSessionMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

async function start(query = "") {
  const { GET } = await import("@/app/api/onboarding/discord/start/route");
  return GET(new Request(`${APP}/api/onboarding/discord/start${query}`));
}

async function callback(params: Record<string, string>) {
  const { GET } = await import("@/app/api/onboarding/discord/callback/route");
  return GET(new Request(`${APP}/api/onboarding/discord/callback?${new URLSearchParams(params)}`));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Discord answers a token exchange and `@me` for the given account id. */
function discordAnswers(discordId: string) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/oauth2/token")) {
      return json({ access_token: "user-access-token", refresh_token: "user-refresh-token", expires_in: 604800, token_type: "Bearer" });
    }
    if (url.endsWith("/users/@me")) return json({ id: discordId, username: "builder", global_name: "Builder" });
    return json({ message: "unexpected" }, 500);
  });
}

async function discordJobs(userId: string) {
  return getDb()
    .select()
    .from(onboardingJobs)
    .where(eq(onboardingJobs.dedupeKey, `reconcile_access:${userId}:discord_guild`));
}

async function connectionOf(userId: string) {
  const [row] = await getDb()
    .select()
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, "discord")));
  return row;
}

beforeEach(() => {
  vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
  vi.stubEnv("DISCORD_CLIENT_ID", "client-id");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "client-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getSessionMock.mockReset();
  getMemberTierMock.mockReset().mockResolvedValue({ tier: "premium", validUntil: null, reason: "active" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/onboarding/discord/start", () => {
  it("is not found while the onboarding flag is off", async () => {
    vi.stubEnv("ONBOARDING_V2_ENABLED", "false");
    signIn(await createUser());
    expect((await start()).status).toBe(404);
  });

  it("sends anonymous visitors to sign-in and back", async () => {
    signIn(null);
    const response = await start("?locale=vi");
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(`${APP}/vi/sign-in`);
    expect(location.searchParams.get("callbackUrl")).toBe("/api/onboarding/discord/start?locale=vi");
  });

  it("refuses users without an effective membership tier", async () => {
    signIn(await createUser());
    getMemberTierMock.mockResolvedValue({ tier: "none", validUntil: null, reason: "none" });
    expect((await start()).status).toBe(403);
  });

  it("redirects members to Discord with state and an S256 PKCE challenge", async () => {
    signIn(await createUser());
    const response = await start();
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(location.searchParams.get("scope")).toBe("identify guilds.join");
    expect(location.searchParams.get("client_id")).toBe("client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP}/api/onboarding/discord/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get("state")).toBeTruthy();
  });
});

describe("GET /api/onboarding/discord/callback", () => {
  it("links the account end to end: PKCE verifier, sealed tokens, queued reconcile", async () => {
    const userId = await createUser();
    signIn(userId);
    const authorize = new URL((await start("?locale=vi")).headers.get("location")!);
    discordAnswers("discord-1001");

    const response = await callback({ code: "auth-code", state: authorize.searchParams.get("state")! });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${APP}/vi/onboarding?discord=linked`);

    const tokenBody = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(tokenBody.get("grant_type")).toBe("authorization_code");
    expect(tokenBody.get("redirect_uri")).toBe(`${APP}/api/onboarding/discord/callback`);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokenBody.get("code_verifier")!));
    expect(Buffer.from(digest).toString("base64url")).toBe(authorize.searchParams.get("code_challenge"));

    const row = await connectionOf(userId);
    expect(row).toMatchObject({ externalUserId: "discord-1001", displayName: "Builder" });
    expect(row.accessTokenEnc).not.toContain("user-access-token");
    expect(await decryptSecret(row.accessTokenEnc!)).toBe("user-access-token");
    expect(await decryptSecret(row.refreshTokenEnc!)).toBe("user-refresh-token");
    expect(row.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    const jobs = await discordJobs(userId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "pending", payload: { userId, target: "discord_guild" } });
  });

  it("rejects an unknown or replayed state", async () => {
    const userId = await createUser();
    signIn(userId);
    expect((await callback({ code: "c", state: "forged" })).headers.get("location")).toBe(`${APP}/onboarding?error=discord_state`);

    const state = new URL((await start()).headers.get("location")!).searchParams.get("state")!;
    discordAnswers("discord-1002");
    expect((await callback({ code: "c", state })).headers.get("location")).toBe(`${APP}/onboarding?discord=linked`);
    expect((await callback({ code: "c", state })).headers.get("location")).toBe(`${APP}/onboarding?error=discord_state`);
  });

  it("rejects a state issued to another user without calling Discord", async () => {
    const owner = await createUser();
    const other = await createUser();
    const state = await issueNonce(getDb(), {
      kind: "discord_oauth",
      userId: owner,
      payload: { codeVerifier: "verifier", locale: "en" },
      ttlMs: 60_000,
    });
    signIn(other);
    expect((await callback({ code: "c", state })).headers.get("location")).toBe(`${APP}/onboarding?error=discord_state`);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionOf(other)).toBeUndefined();
  });

  it("reports a denied consent", async () => {
    const userId = await createUser();
    signIn(userId);
    const state = new URL((await start()).headers.get("location")!).searchParams.get("state")!;
    expect((await callback({ error: "access_denied", state })).headers.get("location")).toBe(`${APP}/onboarding?error=discord_denied`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never moves a Discord account that another NLB user already linked", async () => {
    const holder = await createUser();
    await getDb()
      .insert(communityConnections)
      .values({ userId: holder, provider: "discord", externalUserId: "discord-shared", accessTokenEnc: await encryptSecret("old") });
    const newcomer = await createUser();
    signIn(newcomer);
    const state = new URL((await start()).headers.get("location")!).searchParams.get("state")!;
    discordAnswers("discord-shared");

    expect((await callback({ code: "c", state })).headers.get("location")).toBe(`${APP}/onboarding?error=discord_in_use`);
    expect(await connectionOf(newcomer)).toBeUndefined();
    expect((await connectionOf(holder)).externalUserId).toBe("discord-shared");
    expect(await discordJobs(newcomer)).toHaveLength(0);
  });

  it("refuses a second Discord account for a user who already linked one", async () => {
    const userId = await createUser();
    await getDb().insert(communityConnections).values({ userId, provider: "discord", externalUserId: "discord-first" });
    signIn(userId);
    const state = new URL((await start()).headers.get("location")!).searchParams.get("state")!;
    discordAnswers("discord-second");
    expect((await callback({ code: "c", state })).headers.get("location")).toBe(`${APP}/onboarding?error=discord_in_use`);
    expect((await connectionOf(userId)).externalUserId).toBe("discord-first");
  });

  it("reports a failed code exchange without storing anything", async () => {
    const userId = await createUser();
    signIn(userId);
    const state = new URL((await start()).headers.get("location")!).searchParams.get("state")!;
    fetchMock.mockResolvedValue(json({ error: "invalid_grant" }, 400));
    expect((await callback({ code: "c", state })).headers.get("location")).toBe(`${APP}/onboarding?error=discord_failed`);
    expect(await connectionOf(userId)).toBeUndefined();
  });
});
