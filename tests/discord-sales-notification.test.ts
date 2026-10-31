import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv: { DISCORD_SALES_WEBHOOK_URL?: string } = {};
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { maskEmail, sendDiscordSalesNotification } = await import("@/lib/discord");

const WEBHOOK = "https://discord.test/api/webhooks/1/token";
const sale = {
  productName: "VIP Annual",
  amount: 29900,
  currency: "usd",
  customerEmail: "quang@gmail.com",
  source: "Polar" as const,
  paidAt: new Date("2026-10-31T07:00:00.000Z"),
};

describe("maskEmail", () => {
  it("keeps the first two characters and the domain", () => {
    expect(maskEmail("quang@gmail.com")).toBe("qu***@gmail.com");
    expect(maskEmail("a@x.io")).toBe("a***@x.io");
  });

  it("hides malformed values entirely", () => {
    expect(maskEmail("not-an-email")).toBe("***");
  });
});

describe("sendDiscordSalesNotification", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mockEnv.DISCORD_SALES_WEBHOOK_URL = WEBHOOK;
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts one compact embed with the masked email, amount, source and time", async () => {
    await expect(sendDiscordSalesNotification(sale)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const [embed] = JSON.parse(init.body).embeds;
    expect(embed.timestamp).toBe("2026-10-31T07:00:00.000Z");
    expect(Object.fromEntries(embed.fields.map((f: { name: string; value: string }) => [f.name, f.value]))).toEqual({
      Product: "VIP Annual",
      Amount: "$299.00",
      Email: "qu***@gmail.com",
      Source: "Polar",
    });
    expect(init.body).not.toContain("quang@gmail.com");
  });

  it("skips without a webhook URL", async () => {
    mockEnv.DISCORD_SALES_WEBHOOK_URL = undefined;
    await expect(sendDiscordSalesNotification(sale)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when Discord refuses or the call fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 429 }));
    await expect(sendDiscordSalesNotification(sale)).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(sendDiscordSalesNotification(sale)).resolves.toBe(false);
  });

  it("falls back to a plain amount for an unknown currency code", async () => {
    await sendDiscordSalesNotification({ ...sale, currency: "zz", amount: 1050 });
    const [embed] = JSON.parse(fetchMock.mock.calls[0][1].body).embeds;
    expect(embed.fields.find((f: { name: string }) => f.name === "Amount").value).toMatch(/10\.50 ZZ/);
  });
});
