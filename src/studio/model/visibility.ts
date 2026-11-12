/**
 * Which hands are shown on the stage. Stored per board as `hidden` (seats
 * whose cards are not shown); no field = all hands shown. Optional
 * `showDummyAfterLead`: a hidden dummy appears once the opening lead is on
 * the table and disappears again when stepping back before it.
 */
import type { Contract } from "./auction";
import { Seat, SEATS, nextSeat } from "./types";

export type VisibilityPreset = "all" | "NS" | "EW" | "declarerDummy";

/** Normalises a stored list: valid seats only, no duplicates, N E S W order. */
export function normalizeHidden(v: unknown): Seat[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(v.map((s) => String(s).trim().toUpperCase()[0]));
  return SEATS.filter((s) => set.has(s));
}

export function toggleSeat(hidden: Seat[], seat: Seat): Seat[] {
  return hidden.includes(seat) ? hidden.filter((s) => s !== seat) : normalizeHidden([...hidden, seat]);
}

export function onlySeat(seat: Seat): Seat[] {
  return SEATS.filter((s) => s !== seat);
}

export function dummyOf(c: Contract | "passed" | undefined): Seat | undefined {
  return c && c !== "passed" ? nextSeat(c.declarer, 2) : undefined;
}

/**
 * Seats hidden by a preset. "N-S" shows North and South (hides E-W).
 * "declarerDummy" hides the two defenders; without a contract it hides nothing.
 */
export function presetHidden(p: VisibilityPreset, contract?: Contract | "passed"): Seat[] {
  if (p === "NS") return ["E", "W"];
  if (p === "EW") return ["N", "S"];
  if (p === "declarerDummy") {
    if (!contract || contract === "passed") return [];
    const d = contract.declarer;
    return normalizeHidden([nextSeat(d, 1), nextSeat(d, 3)]);
  }
  return [];
}

/** Seats actually hidden right now, applying the dummy-after-lead rule. */
export function effectiveHidden(hidden: Seat[] | undefined, showDummyAfterLead: boolean | undefined, contract: Contract | "passed" | undefined, cardsPlayed: number): Seat[] {
  const h = normalizeHidden(hidden ?? []);
  const dummy = dummyOf(contract);
  if (showDummyAfterLead && dummy && cardsPlayed >= 1) return h.filter((s) => s !== dummy);
  return h;
}
