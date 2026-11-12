/**
 * A "script" is the recorded auction and play of a deal: what actually
 * happened at the table. It is imported from a LIN file (see lin.ts), stored
 * inside ConfiguratorOptions (so it travels with a saved .deal scene) and
 * replayed by the presenter, where the teacher can step through it and
 * branch off into an alternative line at any card.
 */
import { Auction } from "@/bridge/model/Auction";
import { Bid, ContractBid, DoubleBid, PassBid, RedoubleBid } from "@/bridge/model/Bid";
import { Card, CardValueHelper } from "@/bridge/model/Card";
import { Contract, ContractLevel, NonPassedContract } from "@/bridge/model/Contract";
import { Position, PositionHelper, Side } from "@/bridge/model/Position";
import { Suit, SuitHelper } from "@/bridge/model/Suit";
import { Trick } from "@/bridge/model/Trick";
import { Parser } from "@/bridge/utils/Parser";

export type ScriptAction =
  | { t: "bid"; bid: string; alert?: string } // "1S", "1N", "P", "X", "XX"; alert = explanation when alerted
  | { t: "play"; card: string } // "SA", "HT", "C2"
  | { t: "claim"; tricks: number }; // total tricks claimed by declarer's side

export interface Script {
  /** Where it came from, e.g. "BBO LIN — Board 12" */
  label: string;
  /** Player names in seat order, if known */
  players?: { north: string; east: string; south: string; west: string };
  actions: ScriptAction[];
}

/** Canonical key of a bid, used to compare history with the script. */
export function bidKey(bid: Bid): string {
  if (bid instanceof PassBid) return "P";
  if (bid instanceof DoubleBid) return "X";
  if (bid instanceof RedoubleBid) return "XX";
  if (bid instanceof ContractBid) return `${bid.level}${SuitHelper.toLetter(bid.suit)}`;
  return bid.toString();
}

/** Canonical key of a card: suit letter + rank symbol, e.g. "SA", "HT". */
export function cardKey(card: Card): string {
  return `${SuitHelper.toLetter(card.suit)}${CardValueHelper.toSymbol(card.value)}`;
}

/** Normalise a bid string as found in LIN/PBN files to the canonical key. */
export function normalizeBidString(s: string): string | undefined {
  const b = s.trim().toUpperCase().replace(/!.*$/, "");
  if (b === "P" || b === "PASS" || b === "-") return "P";
  if (b === "D" || b === "X" || b === "DBL") return "X";
  if (b === "R" || b === "XX" || b === "RDBL") return "XX";
  const m = b.match(/^([1-7])(C|D|H|S|N|NT)$/);
  if (!m) return undefined;
  return `${m[1]}${m[2][0]}`;
}

/** Normalise a card string ("sa", "S10", "SA") to the canonical key. */
export function normalizeCardString(s: string): string | undefined {
  const c = s.trim().toUpperCase().replace("10", "T");
  const m = c.match(/^([CDHS])([2-9TJQKA])$/);
  if (!m) return undefined;
  return `${m[1]}${m[2]}`;
}

export function bidFromKey(key: string): Bid | undefined {
  if (key === "P") return new PassBid();
  if (key === "X") return new DoubleBid();
  if (key === "XX") return new RedoubleBid();
  const m = key.match(/^([1-7])([CDHSN])$/);
  if (!m) return undefined;
  const suit = SuitHelper.fromLetter(m[2]);
  if (!suit) return undefined;
  return new ContractBid(suit, parseInt(m[1]) as ContractLevel);
}

export function cardFromKey(key: string): Card | undefined {
  const suit = SuitHelper.fromLetter(key[0]);
  if (!suit || suit === Suit.Notrump) return undefined;
  try {
    return new Card(suit, Parser.parseCardValue(key[1], true));
  } catch {
    return undefined;
  }
}

/** Key of a script action, comparable with bidKey/cardKey of a game history entry. */
export function actionKey(a: ScriptAction): string {
  if (a.t === "bid") return `b:${a.bid}`;
  if (a.t === "play") return `c:${a.card}`;
  return `claim:${a.tricks}`;
}

export function actionLabel(a: ScriptAction): string {
  if (a.t === "bid") {
    const b = bidFromKey(a.bid);
    return b ? b.toString() : a.bid;
  }
  if (a.t === "play") {
    const c = cardFromKey(a.card);
    return c ? c.toShortString() : a.card;
  }
  return `claim ${a.tricks}`;
}

/** Outcome of running the script through the pure model, without any UI. */
export interface ScriptSimulation {
  contract: Contract | undefined;
  declarer: Position | undefined;
  tricksNS: number;
  tricksEW: number;
  /** tricks made by declarer's side (including a claim), if the contract is known */
  tricksDeclarer: number | undefined;
  cardsPlayed: number;
  /** actions that could not be applied (illegal bid, card not in hand…) */
  errors: string[];
}

/**
 * Runs the script synchronously through Auction/Trick (the pure parts of the
 * model) to learn the contract and the result of the actual line. Used for
 * the "actual result" display and to validate an import.
 */
export function simulateScript(
  cards: { north: string; east: string; south: string; west: string },
  dealer: Position,
  actions: ScriptAction[],
): ScriptSimulation {
  const errors: string[] = [];
  const hands: Record<Position, Card[]> = {
    [Position.North]: Parser.parseHandString(cards.north),
    [Position.East]: Parser.parseHandString(cards.east),
    [Position.South]: Parser.parseHandString(cards.south),
    [Position.West]: Parser.parseHandString(cards.west),
  };

  const auction = new Auction(dealer);
  let toAct = dealer;
  let i = 0;
  for (; i < actions.length && actions[i].t === "bid"; i++) {
    const a = actions[i] as { t: "bid"; bid: string };
    const bid = bidFromKey(a.bid);
    if (!bid || !auction.addBid(bid, toAct)) {
      errors.push(`illegal bid ${a.bid} by ${toAct}`);
      break;
    }
    toAct = PositionHelper.nextPosition(toAct);
    if (auction.isFinished) {
      i++;
      break;
    }
  }

  const contract = auction.isFinished ? auction.finalContract : undefined;
  const result: ScriptSimulation = {
    contract,
    declarer: contract && contract !== "passed" ? contract.declarer : undefined,
    tricksNS: 0,
    tricksEW: 0,
    tricksDeclarer: undefined,
    cardsPlayed: 0,
    errors,
  };
  if (!contract || contract === "passed") {
    if (!contract && actions.some((a) => a.t === "play"))
      errors.push("auction not finished, cannot replay the cards");
    return result;
  }

  const trumps = contract.suit;
  let leader = PositionHelper.nextPosition(contract.declarer);
  let trick = new Trick(leader, trumps);
  let claimed: number | undefined;

  for (; i < actions.length; i++) {
    const a = actions[i];
    if (a.t === "claim") {
      claimed = a.tricks;
      break;
    }
    if (a.t !== "play") {
      errors.push(`unexpected ${a.t} during play`);
      break;
    }
    const player = trick.currentToPlay;
    if (!player) {
      errors.push("card played into a finished trick");
      break;
    }
    const card = hands[player].find((c) => cardKey(c) === a.card);
    if (!card) {
      errors.push(`${player} does not hold ${a.card}`);
      break;
    }
    const led = trick.suit;
    if (led && card.suit !== led && hands[player].some((c) => c.suit === led)) {
      errors.push(`${player} revoked with ${a.card}`);
      break;
    }
    hands[player] = hands[player].filter((c) => c !== card);
    trick.addCard(card);
    result.cardsPlayed++;
    if (trick.isFinished) {
      const w = trick.winner!;
      if (PositionHelper.side(w.player) === Side.NS) result.tricksNS++;
      else result.tricksEW++;
      leader = w.player;
      trick = new Trick(leader, trumps);
    }
  }

  const declSide = PositionHelper.side(contract.declarer);
  const won = declSide === Side.NS ? result.tricksNS : result.tricksEW;
  if (claimed !== undefined) {
    result.tricksDeclarer = claimed;
    const finished = Math.floor(result.cardsPlayed / 4);
    const remaining = 13 - finished;
    const extra = Math.max(0, Math.min(remaining, claimed - won));
    if (declSide === Side.NS) {
      result.tricksNS += extra;
      result.tricksEW += remaining - extra;
    } else {
      result.tricksEW += extra;
      result.tricksNS += remaining - extra;
    }
  } else if (result.cardsPlayed === 52) {
    result.tricksDeclarer = won;
  }
  return result;
}

export function contractToShortString(c: Contract | undefined): string {
  if (!c) return "";
  if (c === "passed") return "passed out";
  return NonPassedContract.toString(c);
}
