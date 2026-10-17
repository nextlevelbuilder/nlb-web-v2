import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/community/types";
import { sendOnboardingWelcomeEmail } from "@/lib/email-onboarding-welcome";

const sendMock = vi.fn();

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
}));

const input = { email: "member@example.com", name: "Member", locale: "en", idempotencyKey: "nlb-onboarding-welcome-sub_1" };

beforeEach(() => {
  sendMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sendOnboardingWelcomeEmail", () => {
  it("sends once with the idempotency key", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    expect(await sendOnboardingWelcomeEmail(input)).toEqual({ success: true, data: { id: "msg_1" } });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: ["member@example.com"] }), {
      idempotencyKey: "nlb-onboarding-welcome-sub_1",
    });
  });

  it("gives up after 10 seconds with a retryable timeout", async () => {
    vi.useFakeTimers();
    sendMock.mockReturnValue(new Promise(() => {}));
    const pending = sendOnboardingWelcomeEmail(input);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result).toMatchObject({ error: { code: "resend_timeout", retryable: true } });
    expect((result as { error: unknown }).error).toBeInstanceOf(ProviderError);
  });
});
