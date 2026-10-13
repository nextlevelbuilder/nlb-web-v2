import type { PlanSeats } from "./membership-seats";

/** Share of a plan's seats that must be taken before the "N of M seats left" meter is shown. */
export const SEAT_METER_THRESHOLD = 0.5;

/**
 * True once at least half of a plan's seats are taken. Below that the meter would advertise an empty room,
 * so the card shows the cap as exclusivity instead. A cap of zero (or less) never shows a meter.
 */
export function shouldShowSeatMeter(taken: number, total: number): boolean {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(taken)) return false;
  return taken / total >= SEAT_METER_THRESHOLD;
}

/** What a plan card renders for seats: sold out, the live meter, or the "Limited to M members" cap. */
export type SeatStatus = "soldOut" | "meter" | "cap";

export function seatStatus(seats: PlanSeats): SeatStatus {
  if (seats.soldOut) return "soldOut";
  return shouldShowSeatMeter(seats.taken, seats.total) ? "meter" : "cap";
}
