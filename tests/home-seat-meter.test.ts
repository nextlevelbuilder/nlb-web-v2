import { describe, expect, it } from "vitest";
import { computeSeatAvailability } from "@/lib/home/membership-seats";
import { SEAT_METER_THRESHOLD, seatStatus, shouldShowSeatMeter } from "@/lib/home/seat-meter";

describe("shouldShowSeatMeter", () => {
  it("uses a 50% threshold", () => {
    expect(SEAT_METER_THRESHOLD).toBe(0.5);
  });

  it("hides the meter when no seats are taken", () => {
    expect(shouldShowSeatMeter(0, 30)).toBe(false);
  });

  it("hides the meter just below half", () => {
    expect(shouldShowSeatMeter(49, 100)).toBe(false);
    expect(shouldShowSeatMeter(14, 30)).toBe(false);
  });

  it("shows the meter at exactly half", () => {
    expect(shouldShowSeatMeter(50, 100)).toBe(true);
    expect(shouldShowSeatMeter(5, 10)).toBe(true);
  });

  it("shows the meter when the plan is full", () => {
    expect(shouldShowSeatMeter(30, 30)).toBe(true);
  });

  it("never shows a meter for a zero, negative or invalid cap", () => {
    expect(shouldShowSeatMeter(0, 0)).toBe(false);
    expect(shouldShowSeatMeter(3, 0)).toBe(false);
    expect(shouldShowSeatMeter(1, -5)).toBe(false);
    expect(shouldShowSeatMeter(Number.NaN, 10)).toBe(false);
    expect(shouldShowSeatMeter(5, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("seatStatus", () => {
  it("maps real seat counts to cap, meter or sold out", () => {
    const caps = { premium: 30, vip: 10 };
    expect(seatStatus(computeSeatAvailability({ premium: 0, vip: 4 }, caps).premium)).toBe("cap");
    expect(seatStatus(computeSeatAvailability({ premium: 0, vip: 4 }, caps).vip)).toBe("cap");
    expect(seatStatus(computeSeatAvailability({ premium: 15, vip: 9 }, caps).premium)).toBe("meter");
    expect(seatStatus(computeSeatAvailability({ premium: 15, vip: 9 }, caps).vip)).toBe("meter");
    expect(seatStatus(computeSeatAvailability({ premium: 30, vip: 10 }, caps).vip)).toBe("soldOut");
  });

  it("treats a zero cap as sold out rather than dividing by zero", () => {
    expect(seatStatus(computeSeatAvailability({}, { premium: 0, vip: 0 }).premium)).toBe("soldOut");
  });
});
