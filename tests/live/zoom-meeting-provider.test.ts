import { describe, expect, it, vi } from "vitest";
import { createZoomMeetingProvider, ZOOM_REQUEST_TIMEOUT_MS } from "@/lib/live/meetings/zoom-meeting-provider";
import { MeetingProviderError, MeetingProviderNotFoundError, MeetingProviderUnavailableError } from "@/lib/live/meetings/meeting-provider";

interface Call {
  url: string;
  method: string;
  signal: AbortSignal | null;
  headers: Record<string, string>;
  body: unknown;
}

/** Fixture Zoom API: records calls and answers like Zoom, including host-only fields. */
function zoomFixture(overrides: { registerStatus?: number } = {}) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}));
    calls.push({ url, method: init?.method ?? "GET", signal: init?.signal ?? null, headers, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.startsWith("https://zoom.us/oauth/token")) {
      return Response.json({ access_token: "tok-1", token_type: "bearer", expires_in: 3600 });
    }
    if (url.endsWith("/users/me/meetings")) {
      return Response.json({ id: 81234567890, start_url: "https://zoom.us/s/HOST-SECRET", join_url: "https://zoom.us/j/81234567890", password: "pw" }, { status: 201 });
    }
    if (url.endsWith("/registrants")) {
      if (overrides.registerStatus) return Response.json({ code: 3001, message: "Meeting does not exist" }, { status: overrides.registerStatus });
      return Response.json({ registrant_id: "reg-abc", id: 81234567890, join_url: "https://zoom.us/w/81234567890?tk=personal" }, { status: 201 });
    }
    if (url.endsWith("/registrants/status")) return new Response(null, { status: 204 });
    return new Response("not found", { status: 404 });
  };
  return { calls, fetch };
}

const credentials = { accountId: "acct 1", clientId: "cid", clientSecret: "csecret" };
const event = {
  id: "evt-1",
  titleEn: "Agents in production",
  startsAt: new Date("2030-01-10T12:00:00.000Z"),
  endsAt: new Date("2030-01-10T13:30:00.000Z"),
  timezone: "Asia/Ho_Chi_Minh",
};

describe("Zoom meeting provider", () => {
  it("gets an S2S token and creates a registration-required meeting without exposing start_url", async () => {
    const zoom = zoomFixture();
    const provider = createZoomMeetingProvider({ credentials, fetch: zoom.fetch });
    expect(provider.available).toBe(true);

    const meeting = await provider.createMeeting(event);
    expect(meeting).toEqual({ meetingId: "81234567890" });
    expect(JSON.stringify(meeting)).not.toContain("HOST-SECRET");

    const [token, create] = zoom.calls;
    expect(token.url).toBe("https://zoom.us/oauth/token?grant_type=account_credentials&account_id=acct%201");
    expect(token.method).toBe("POST");
    expect(token.headers.Authorization).toBe(`Basic ${btoa("cid:csecret")}`);
    expect(create.url).toBe("https://api.zoom.us/v2/users/me/meetings");
    expect(create.headers.Authorization).toBe("Bearer tok-1");
    expect(create.body).toMatchObject({
      topic: event.titleEn,
      type: 2,
      start_time: "2030-01-10T12:00:00Z",
      duration: 90,
      settings: { approval_type: 0 },
    });
  });

  it("registers an attendee for a personal join URL and cancels the registrant, reusing the token", async () => {
    const zoom = zoomFixture();
    const provider = createZoomMeetingProvider({ credentials, fetch: zoom.fetch });
    const registrant = await provider.registerAttendee("81234567890", { email: "a@example.com", firstName: "Ana", lastName: "Le" });
    expect(registrant).toEqual({ registrantId: "reg-abc", joinUrl: "https://zoom.us/w/81234567890?tk=personal" });
    await provider.cancelRegistrant("81234567890", "reg-abc");

    const register = zoom.calls.find((c) => c.url.endsWith("/registrants"));
    expect(register?.body).toEqual({ email: "a@example.com", first_name: "Ana", last_name: "Le" });
    const cancel = zoom.calls.find((c) => c.url.endsWith("/registrants/status"));
    expect(cancel).toMatchObject({ method: "PUT", body: { action: "cancel", registrants: [{ id: "reg-abc" }] } });
    expect(zoom.calls.filter((c) => c.url.includes("oauth/token"))).toHaveLength(1);
  });

  it("is unavailable (fail closed) without credentials and never calls Zoom", async () => {
    const zoom = zoomFixture();
    const provider = createZoomMeetingProvider({ credentials: null, fetch: zoom.fetch });
    expect(provider.available).toBe(false);
    await expect(provider.createMeeting(event)).rejects.toBeInstanceOf(MeetingProviderUnavailableError);
    await expect(provider.registerAttendee("1", { email: "a@example.com", firstName: "A", lastName: "" })).rejects.toBeInstanceOf(
      MeetingProviderUnavailableError
    );
    expect(zoom.calls).toHaveLength(0);
  });

  it("surfaces provider errors without leaking credentials", async () => {
    const zoom = zoomFixture({ registerStatus: 404 });
    const provider = createZoomMeetingProvider({ credentials, fetch: zoom.fetch });
    const error = await provider.registerAttendee("1", { email: "a@example.com", firstName: "A", lastName: "" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MeetingProviderError);
    expect((error as MeetingProviderError).status).toBe(404);
    expect((error as Error).message).not.toContain("csecret");
    expect((error as Error).message).not.toContain("tok-1");
  });

  it("bounds every Zoom call, the token request included, with a timeout signal", async () => {
    const zoom = zoomFixture();
    const provider = createZoomMeetingProvider({ credentials, fetch: zoom.fetch });
    await provider.createMeeting(event);
    await provider.cancelRegistrant("81234567890", "reg-abc");
    expect(zoom.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of zoom.calls) expect(call.signal).toBeInstanceOf(AbortSignal);

    // A hung Zoom call rejects with a provider error instead of waiting forever.
    vi.useFakeTimers();
    try {
      const hung = createZoomMeetingProvider({
        credentials,
        fetch: (_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
      });
      const pending = hung.createMeeting(event).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(ZOOM_REQUEST_TIMEOUT_MS + 1);
      const error = await pending;
      expect(error).toBeInstanceOf(MeetingProviderError);
      expect(error).toMatchObject({ status: null, message: "Zoom token request timed out" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells a 404 (already gone) apart from other failures", async () => {
    const gone = createZoomMeetingProvider({ credentials, fetch: zoomFixture({ registerStatus: 404 }).fetch });
    const notFound = await gone.registerAttendee("1", { email: "a@example.com", firstName: "A", lastName: "" }).catch((e: unknown) => e);
    expect(notFound).toBeInstanceOf(MeetingProviderNotFoundError);
    const broken = createZoomMeetingProvider({ credentials, fetch: zoomFixture({ registerStatus: 500 }).fetch });
    const failure = await broken.registerAttendee("1", { email: "a@example.com", firstName: "A", lastName: "" }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MeetingProviderError);
    expect(failure).not.toBeInstanceOf(MeetingProviderNotFoundError);
  });
});
