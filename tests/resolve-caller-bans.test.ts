import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));

import { hashApiKey, isBanActive, resolveCaller } from "@/lib/auth-api-key";

const NOW = new Date("2026-10-29T03:00:00Z");
const FUTURE = new Date(NOW.getTime() + 86_400_000);
const PAST = new Date(NOW.getTime() - 86_400_000);

function sessionFor(user: Record<string, unknown>) {
  return { user: { id: "user-1", name: "Alice", email: "alice@nlb.io", emailVerified: true, image: null, role: "user", ...user }, session: { id: "s-1" } };
}

/** Fake DB answering the API key lookup, then the key owner's user row. */
function apiKeyDb(rawKey: string, user: Record<string, unknown>) {
  const rows = [
    [{ id: "key-1", userId: "user-1", organizationId: null, key: hashApiKey(rawKey), enabled: true, expiresAt: null }],
    [{ id: "user-1", name: "Alice", email: "alice@nlb.io", role: "user", image: null, emailVerified: true, ...user }],
  ];
  let call = 0;
  const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve(rows[call++] ?? []) };
  return { select: () => chain } as never;
}

describe("resolveCaller refuses banned users on every credential", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    getSession.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("decides an active ban from the flag and its expiry", () => {
    expect(isBanActive({ banned: false }, NOW)).toBe(false);
    expect(isBanActive({ banned: true, banExpires: null }, NOW)).toBe(true);
    expect(isBanActive({ banned: true, banExpires: FUTURE }, NOW)).toBe(true);
    expect(isBanActive({ banned: true, banExpires: PAST }, NOW)).toBe(false);
    expect(isBanActive({ banned: true, banExpires: FUTURE.toISOString() }, NOW)).toBe(true);
  });

  it("refuses a surviving session of a banned user and keeps an expired ban signed in", async () => {
    getSession.mockResolvedValueOnce(sessionFor({ banned: true, banExpires: null }));
    expect(await resolveCaller(new Headers({ cookie: "s=1" }))).toBeNull();

    getSession.mockResolvedValueOnce(sessionFor({ banned: true, banExpires: PAST }));
    expect(await resolveCaller(new Headers({ cookie: "s=1" }))).toMatchObject({ authType: "session", user: { id: "user-1" } });
  });

  it("refuses the API key of a banned user and never returns ban fields", async () => {
    const rawKey = "nlb_live_0123456789abcdef0123456789abcdef0123456789abcdef";
    getSession.mockResolvedValue(null);
    const headers = new Headers({ Authorization: `Bearer ${rawKey}` });

    expect(await resolveCaller(headers, apiKeyDb(rawKey, { banned: true, banExpires: FUTURE }))).toBeNull();

    const allowed = await resolveCaller(headers, apiKeyDb(rawKey, { banned: false, banExpires: null }));
    expect(allowed).toMatchObject({ authType: "api_key", user: { id: "user-1" } });
    expect(allowed?.user).not.toHaveProperty("banned");
  });
});
