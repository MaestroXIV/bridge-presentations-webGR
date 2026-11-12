/**
 * Stepping through a board: optionally the auction call by call, then the
 * cards. A position is "how many calls are shown" plus "the cards on screen".
 * In "whole" mode the auction is always fully shown and only cards step.
 */
import { backToActual, nextActualCard } from "./play";

export type AuctionMode = "whole" | "step";

export interface StepPos {
  calls: number;
  cards: string[];
}

export function startPos(mode: AuctionMode, totalCalls: number): StepPos {
  return { calls: mode === "whole" ? totalCalls : 0, cards: [] };
}

export function auctionDone(pos: StepPos, totalCalls: number): boolean {
  return pos.calls >= totalCalls;
}

/** One step forward: the next call while the auction is not complete, then the next recorded card. */
export function stepNext(pos: StepPos, totalCalls: number, actual: string[], playable: boolean): StepPos | undefined {
  if (pos.calls < totalCalls) return { calls: pos.calls + 1, cards: pos.cards };
  if (!playable) return undefined;
  const c = nextActualCard(actual, pos.cards);
  return c ? { calls: pos.calls, cards: [...pos.cards, c] } : undefined;
}

/** One step back: the last card, or in call-by-call mode the last call once no card is on screen. */
export function stepPrev(pos: StepPos, mode: AuctionMode): StepPos | undefined {
  if (pos.cards.length) return { calls: pos.calls, cards: pos.cards.slice(0, -1) };
  if (mode === "step" && pos.calls > 0) return { calls: pos.calls - 1, cards: [] };
  return undefined;
}

/** Shift+next: during the auction reveal the rest of it; afterwards play to the end of the trick. */
export function stepNextBig(pos: StepPos, totalCalls: number, actual: string[], playable: boolean): StepPos | undefined {
  if (pos.calls < totalCalls) return { calls: totalCalls, cards: pos.cards };
  let p: StepPos | undefined = pos;
  let moved = false;
  do {
    const n = stepNext(p, totalCalls, actual, playable);
    if (!n) break;
    p = n;
    moved = true;
  } while (p.cards.length % 4 !== 0);
  return moved ? p : undefined;
}

/** Shift+prev: back to the start of the current trick (or the previous one); in the auction, to its start. */
export function stepPrevBig(pos: StepPos, mode: AuctionMode): StepPos | undefined {
  const n = pos.cards.length;
  if (n) return { calls: pos.calls, cards: pos.cards.slice(0, n % 4 === 0 ? n - 4 : n - (n % 4)) };
  if (mode === "step" && pos.calls > 0) return { calls: 0, cards: [] };
  return undefined;
}

/** Playing a card is allowed only once the auction is complete. */
export function withCard(pos: StepPos, totalCalls: number, card: string): StepPos | undefined {
  return auctionDone(pos, totalCalls) ? { calls: pos.calls, cards: [...pos.cards, card] } : undefined;
}

export function toActual(pos: StepPos, actual: string[]): StepPos {
  return { calls: pos.calls, cards: backToActual(actual, pos.cards) };
}

/** A board's own setting wins over the presenter's default. */
export function effectiveMode(boardMode: AuctionMode | undefined, globalMode: AuctionMode): AuctionMode {
  return boardMode ?? globalMode;
}
