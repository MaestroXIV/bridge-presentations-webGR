/**
 * Pure card-play model for the presenter: replays a list of cards from the
 * deal, enforces follow-suit, and tracks the recorded ("actual") line versus
 * the line currently on screen, so a presenter can depart from the record and
 * return to it. No Vue, no events: the UI keeps two arrays and asks.
 */
import { Seat, SEATS, Strain, nextSeat, sideOf } from "./types";

export const RANKS = "AKQJT98765432";
const SUIT_ORDER = "SHDC";

export interface PlayedCard {
  seat: Seat;
  card: string;
}

export interface TrickState {
  leader: Seat;
  cards: PlayedCard[];
  winner?: Seat;
}

export interface PlayState {
  tricks: TrickState[];
  /** seat to play next; undefined after the 13th trick */
  toPlay: Seat | undefined;
  remaining: Record<Seat, string[]>;
  played: Set<string>;
  ns: number;
  ew: number;
  /** cards of the input that could be applied */
  applied: number;
  /** why the replay stopped early, if it did */
  error?: string;
}

/** "AKQ2.T98.J7.Q543" → ["SA","SK","SQ","S2","HT",...]. Accepts "-" for a void and "10". */
export function parseDotHand(hand: string): string[] {
  const parts = hand.trim().split(".");
  const out: string[] = [];
  parts.slice(0, 4).forEach((ranks, i) => {
    const r = ranks.toUpperCase().replace(/10/g, "T").replace(/-/g, "");
    for (const ch of r) if (RANKS.includes(ch)) out.push(SUIT_ORDER[i] + ch);
  });
  return out;
}

/** Sorts card keys S,H,D,C then A..2. */
export function sortCards(cards: string[]): string[] {
  return [...cards].sort((a, b) => SUIT_ORDER.indexOf(a[0]) - SUIT_ORDER.indexOf(b[0]) || RANKS.indexOf(a[1]) - RANKS.indexOf(b[1]));
}

export function initialHands(hands: Record<Seat, string>): Record<Seat, string[]> {
  return { N: parseDotHand(hands.N), E: parseDotHand(hands.E), S: parseDotHand(hands.S), W: parseDotHand(hands.W) };
}

/** Cards from `hand` that may legally be played to a trick led in `led` (undefined = on lead). */
export function legalCards(hand: string[], led: string | undefined): string[] {
  if (!led) return [...hand];
  const follow = hand.filter((c) => c[0] === led);
  return follow.length ? follow : [...hand];
}

export function trickWinner(trick: TrickState, strain: Strain): Seat {
  const led = trick.cards[0].card[0];
  let best = trick.cards[0];
  for (const pc of trick.cards.slice(1)) {
    const c = pc.card;
    const b = best.card;
    const cTrump = strain !== "N" && c[0] === strain;
    const bTrump = strain !== "N" && b[0] === strain;
    if (cTrump && !bTrump) best = pc;
    else if (cTrump === bTrump && c[0] === b[0] && RANKS.indexOf(c[1]) < RANKS.indexOf(b[1])) best = pc;
    else if (!cTrump && !bTrump && c[0] === led && b[0] !== led) best = pc;
  }
  return best.seat;
}

/** Replays `cards` from the deal. Stops at the first card that is not in the right hand or breaks follow-suit. */
export function replayPlay(hands: Record<Seat, string>, declarer: Seat, strain: Strain, cards: string[]): PlayState {
  const remaining = initialHands(hands);
  const state: PlayState = { tricks: [], toPlay: nextSeat(declarer), remaining, played: new Set(), ns: 0, ew: 0, applied: 0 };
  let trick: TrickState = { leader: nextSeat(declarer), cards: [] };
  for (const card of cards) {
    const seat = state.toPlay;
    if (!seat) {
      state.error = "all 13 tricks already played";
      break;
    }
    if (!remaining[seat].includes(card)) {
      state.error = `${seat} does not hold ${card}`;
      break;
    }
    const led = trick.cards[0]?.card[0];
    if (!legalCards(remaining[seat], led).includes(card)) {
      state.error = `${seat} must follow suit, ${card} is a revoke`;
      break;
    }
    if (trick.cards.length === 0) state.tricks.push(trick);
    trick.cards.push({ seat, card });
    remaining[seat] = remaining[seat].filter((c) => c !== card);
    state.played.add(card);
    state.applied++;
    if (trick.cards.length === 4) {
      const w = trickWinner(trick, strain);
      trick.winner = w;
      if (sideOf(w) === "NS") state.ns++;
      else state.ew++;
      state.toPlay = state.tricks.length === 13 ? undefined : w;
      trick = { leader: w, cards: [] };
    } else {
      state.toPlay = nextSeat(seat);
    }
  }
  return state;
}

/** Whether `seat` may play `card` now. */
export function canPlay(state: PlayState, seat: Seat, card: string): boolean {
  if (state.toPlay !== seat) return false;
  const cur = state.tricks[state.tricks.length - 1];
  const led = cur && cur.cards.length < 4 ? cur.cards[0].card[0] : undefined;
  return legalCards(state.remaining[seat], led).includes(card);
}

// ---- actual line vs. current line ---------------------------------------

/** Index of the first card where `line` departs from `actual`; undefined while on the record. */
export function variationAt(actual: string[], line: string[]): number | undefined {
  for (let i = 0; i < line.length; i++) if (i >= actual.length || actual[i] !== line[i]) return i;
  return undefined;
}

/** Next recorded card if the line is still on the record. */
export function nextActualCard(actual: string[], line: string[]): string | undefined {
  return variationAt(actual, line) === undefined ? actual[line.length] : undefined;
}

/** The line cut back to where it left the record. */
export function backToActual(actual: string[], line: string[]): string[] {
  const v = variationAt(actual, line);
  return v === undefined ? line : line.slice(0, v);
}

export { SEATS };
