import { describe, expect, it } from "vitest";
import {
  formatLiveDateTime,
  formatLiveDateTimeLine,
  formatLivePrice,
  formatLiveTime,
  groupRoundTopics,
  isLiveSlug,
  liveErrorCode,
  seatMeter,
  selectEventCta,
  timeLeftParts,
  type LiveEventCta,
} from "@/components/live/live-ui-helpers";
import { safeExternalUrl, parseApiDate } from "@/components/live/live-api-client";

// 2026-11-05T13:00Z is 20:00 on Thursday 5 November in Asia/Ho_Chi_Minh (UTC+7, no DST).
const START = new Date("2026-11-05T13:00:00Z");
const END = new Date("2026-11-05T15:00:00Z");
const BEFORE = new Date("2026-11-01T00:00:00Z");

describe("Live date formatting", () => {
  it("formats wall-clock time in Asia/Ho_Chi_Minh with the zone shown", () => {
    const en = formatLiveDateTime(START, "en", "Asia/Ho_Chi_Minh");
    expect(en.time).toBe("20:00");
    // ICU versions differ on the comma after the weekday.
    expect(en.date).toMatch(/^Thursday,? 5 November 2026$/);
    expect(en.zone).toBe("GMT+7 · Asia/Ho_Chi_Minh");
    expect(en.iso).toBe("2026-11-05T13:00:00.000Z");
    const vi = formatLiveDateTime(START, "vi", "Asia/Ho_Chi_Minh");
    expect(vi.time).toBe("20:00");
    expect(vi.date).toMatch(/Thứ Năm/);
    expect(formatLiveDateTimeLine(START, "en")).toMatch(/^Thursday,? 5 November 2026, 20:00 \(GMT\+7 · Asia\/Ho_Chi_Minh\)$/);
    expect(formatLiveTime(new Date("2026-11-05T12:45:00Z"))).toBe("19:45 GMT+7");
  });

  it("crosses the local date line correctly and falls back to Asia/Ho_Chi_Minh for a bad zone", () => {
    // 18:30 UTC on the 5th is 01:30 on the 6th in Vietnam.
    const late = formatLiveDateTime(new Date("2026-11-05T18:30:00Z"), "en", "Not/AZone");
    expect(late.date).toMatch(/^Friday,? 6 November 2026$/);
    expect(late.time).toBe("01:30");
    expect(late.zone).toContain("Asia/Ho_Chi_Minh");
  });

  it("computes time left without going negative", () => {
    expect(timeLeftParts(new Date("2026-11-03T03:05:00Z"), BEFORE)).toMatchObject({ days: 2, hours: 3, minutes: 5 });
    expect(timeLeftParts(BEFORE, START)).toMatchObject({ days: 0, hours: 0, minutes: 0, totalMs: 0 });
  });

  it("formats prices from minor units and shows free events as free", () => {
    expect(formatLivePrice(1900, "usd", "en", "Free")).toBe("$19.00");
    expect(formatLivePrice(0, "usd", "vi", "Miễn phí")).toBe("Miễn phí");
    expect(formatLivePrice(1900, "???", "en", "Free")).toBe("19.00 ???");
  });
});

describe("seat meter", () => {
  it("shows a count only once at least half the seats are taken", () => {
    expect(seatMeter(null, 50)).toBeNull();
    expect(seatMeter(40, 50)).toEqual({ kind: "limited" });
    expect(seatMeter(25, 50)).toEqual({ kind: "left", left: 25 });
    expect(seatMeter(0, 50)).toEqual({ kind: "sold_out" });
  });
});

describe("selectEventCta", () => {
  const verified = { id: "u1", emailVerified: true };
  const base = { status: "sales_open" as const, endsAt: END, seatsLeft: 5, viewer: verified, ticket: null, now: BEFORE };
  const kind = (overrides: Partial<Parameters<typeof selectEventCta>[0]>): LiveEventCta["kind"] => selectEventCta({ ...base, ...overrides }).kind;

  it("walks signed out → sign in → verify → buy", () => {
    expect(kind({ viewer: null })).toBe("sign_in");
    expect(kind({ viewer: { id: "u1", emailVerified: false } })).toBe("verify_email");
    expect(selectEventCta(base)).toEqual({ kind: "buy", heldUntil: null });
  });

  it("puts an existing ticket ahead of sales state, and terminal states ahead of everything", () => {
    expect(kind({ ticket: { ticketStatus: "active", holdExpiresAt: null }, seatsLeft: 0 })).toBe("ticketed");
    expect(kind({ ticket: { ticketStatus: "active", holdExpiresAt: null }, status: "live" })).toBe("ticketed");
    expect(kind({ ticket: { ticketStatus: "exception", holdExpiresAt: null } })).toBe("ticket_exception");
    expect(kind({ ticket: { ticketStatus: "refunded", holdExpiresAt: null } })).toBe("buy");
    expect(kind({ status: "cancelled", ticket: { ticketStatus: "active", holdExpiresAt: null } })).toBe("cancelled");
    expect(kind({ status: "ended" })).toBe("ended");
    expect(kind({ now: END })).toBe("ended");
  });

  it("gates on sales state", () => {
    expect(kind({ status: "scheduled", seatsLeft: null })).toBe("sales_not_open");
    expect(kind({ status: "live", seatsLeft: null })).toBe("sales_closed");
    expect(kind({ seatsLeft: 0 })).toBe("sold_out");
    expect(kind({ seatsLeft: 0, viewer: null })).toBe("sold_out");
  });

  it("lets a viewer with an active hold finish checkout even when no seat shows as free", () => {
    const heldUntil = new Date(BEFORE.getTime() + 10 * 60_000);
    expect(selectEventCta({ ...base, seatsLeft: 0, ticket: { ticketStatus: null, holdExpiresAt: heldUntil } })).toEqual({ kind: "buy", heldUntil });
    const expired = new Date(BEFORE.getTime() - 1);
    expect(kind({ seatsLeft: 0, ticket: { ticketStatus: null, holdExpiresAt: expired } })).toBe("sold_out");
  });
});

describe("groupRoundTopics", () => {
  it("groups by topic group in group order, keeping round order inside a group and unknowns last", () => {
    const topics = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const groups = new Map([
      ["a", { id: "g2", title: "Agents", sortOrder: 2 }],
      ["b", { id: "g1", title: "Infra", sortOrder: 1 }],
      ["c", { id: "g2", title: "Agents", sortOrder: 2 }],
    ]);
    const result = groupRoundTopics(topics, groups);
    expect(result.map((g) => [g.group?.title ?? null, g.topics.map((t) => t.id)])).toEqual([
      ["Infra", ["b"]],
      ["Agents", ["a", "c"]],
      [null, ["d"]],
    ]);
    expect(groupRoundTopics([], groups)).toEqual([]);
  });
});

describe("member API helpers", () => {
  it("maps envelope codes first, then HTTP status", () => {
    expect(liveErrorCode(409, { error: { code: "sold_out", message: "x" } })).toBe("sold_out");
    expect(liveErrorCode(403, { error: { code: "email_unverified" } })).toBe("email_unverified");
    expect(liveErrorCode(409, { error: { code: "round_closed" } })).toBe("round_not_open");
    expect(liveErrorCode(401, null)).toBe("unauthenticated");
    expect(liveErrorCode(403, { error: { code: "mystery" } })).toBe("forbidden");
    expect(liveErrorCode(429, "not json")).toBe("rate_limited");
    expect(liveErrorCode(500, {})).toBe("unknown");
  });

  it("only follows https (or local http) URLs", () => {
    expect(safeExternalUrl("https://polar.sh/checkout/abc")).toBe("https://polar.sh/checkout/abc");
    expect(safeExternalUrl("http://localhost:3134/x")).toBe("http://localhost:3134/x");
    expect(safeExternalUrl("http://evil.test/x")).toBeNull();
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl(42)).toBeNull();
  });

  it("parses API dates and validates slugs", () => {
    expect(parseApiDate("2026-11-05T13:00:00Z")?.getTime()).toBe(START.getTime());
    expect(parseApiDate(START.getTime())?.getTime()).toBe(START.getTime());
    expect(parseApiDate("nope")).toBeNull();
    expect(isLiveSlug("agent-loops-week-3")).toBe(true);
    expect(isLiveSlug("Bad_Slug")).toBe(false);
    expect(isLiveSlug("a--b")).toBe(false);
  });
});
