/**
 * Data model of the presenter ("studio") mode. Deliberately plain JSON so a
 * session can be written by hand, exported from a PBN file, or generated from
 * BBO by a later tool. See docs/SESSION_FORMAT.md.
 */
export type Seat = "N" | "E" | "S" | "W";
export const SEATS: Seat[] = ["N", "E", "S", "W"];
export const SEAT_NAMES: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

export type Vul = "None" | "NS" | "EW" | "All";
/** C D H S, N = notrump */
export type Strain = "C" | "D" | "H" | "S" | "N";
export type Scoring = "MP" | "IMP" | "BAM" | "Total";
export type Side = "NS" | "EW";

export interface Call {
  /** "1S", "3N", "P", "X", "XX" */
  call: string;
  /** present = the call was alerted; the text is its explanation ("" if none given) */
  alert?: string;
}

export interface Traveller {
  /** pair names, free text */
  ns?: string;
  ew?: string;
  /** "4S", "4SX", "3NXX", "PASS" (N = notrump) */
  contract: string;
  declarer?: Seat;
  /** tricks taken by declarer; alternatively give `result` */
  tricks?: number;
  /** "=", "+1", "-2" relative to the contract; used only when `tricks` is missing */
  result?: string;
  /** opening lead, e.g. "D8" */
  lead?: string;
  /** score from N-S's point of view; computed from contract and tricks when missing */
  scoreNS?: number;
  /** matchpoint percentage for N-S (0-100); computed from the scores when missing and scoring is MP */
  mpNS?: number;
  /** IMPs (cross-IMP / butler) for N-S */
  impsNS?: number;
  /** marks the presenter's own table */
  mine?: boolean;
}

export interface StudioBoard {
  /** unique within the session; used as the key for recorded takes */
  id: string;
  number?: number;
  title?: string;
  dealer: Seat;
  vul: Vul;
  /** PBN dot notation per hand, spades first: "AKQ2.T98.J7.Q543" ("" for a void suit) */
  hands: Record<Seat, string>;
  players?: Partial<Record<Seat, string>>;
  auction: Call[];
  /** cards in the order played, "SA", "HT", "C2" */
  play: string[];
  /** contract when there is no (complete) auction, e.g. "4SX"; ignored when the auction gives one */
  contract?: string;
  /** declarer for `contract` */
  declarer?: Seat;
  /** total tricks for declarer's side when the play ended with a claim */
  claim?: number;
  /** short text shown in the left zone when there are no travellers */
  note?: string;
  scoring?: Scoring;
  travellers?: Traveller[];
  /** which side the presenter sat; results are shown from this side */
  mySide?: Side;
  /** "whole" or "step" (call by call); overrides the presenter's default for this board */
  auctionMode?: "whole" | "step";
  /** BBO traveller link of the board (kept for reference / later fetching) */
  travellerUrl?: string;
  /** tournament the board belongs to, when a file holds several */
  tournament?: string;
  /** where the board came from, e.g. "PBN", "BBO LIN" */
  source?: string;
}

export interface StudioSession {
  title: string;
  date?: string;
  scoring?: Scoring;
  /** presenter's name; used to find the own row in travellers and the side he sat */
  me?: string;
  boards: StudioBoard[];
}

export const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣", N: "NT" };

export function nextSeat(s: Seat, n = 1): Seat {
  return SEATS[(SEATS.indexOf(s) + n) % 4];
}

export function sideOf(s: Seat): Side {
  return s === "N" || s === "S" ? "NS" : "EW";
}

export function isVul(vul: Vul, side: Side): boolean {
  return vul === "All" || vul === side;
}
