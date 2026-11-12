import { Call, Seat, Strain, nextSeat, sideOf } from "./types";

export interface Contract {
  level: number;
  strain: Strain;
  /** 0 undoubled, 1 doubled, 2 redoubled */
  doubled: 0 | 1 | 2;
  declarer: Seat;
}

/** Normalises a call string: "Pass"/"p" → "P", "D"/"Dbl" → "X", "1NT" → "1N". Undefined if unknown. */
export function normalizeCall(s: string): string | undefined {
  const b = s.trim().toUpperCase().replace(/!+$/, "");
  if (b === "P" || b === "PASS" || b === "AP") return b === "AP" ? "AP" : "P";
  if (b === "X" || b === "D" || b === "DBL" || b === "DOUBLE") return "X";
  if (b === "XX" || b === "R" || b === "RDBL" || b === "REDOUBLE") return "XX";
  const m = b.match(/^([1-7])(C|D|H|S|N|NT)$/);
  return m ? `${m[1]}${m[2][0]}` : undefined;
}

/** Whether the auction is over (three passes after a bid, or four passes). */
export function auctionComplete(calls: Call[]): boolean {
  const n = calls.length;
  if (n >= 4 && calls.slice(0, 4).every((c) => c.call === "P") && n === 4) return true;
  if (n < 4) return false;
  return calls.slice(n - 3).every((c) => c.call === "P") && calls.some((c) => c.call !== "P");
}

/**
 * Final contract of an auction. Returns "passed" for a passed-out board and
 * undefined when the auction is incomplete or empty.
 */
export function contractFromAuction(dealer: Seat, calls: Call[]): Contract | "passed" | undefined {
  if (calls.length === 0) return undefined;
  if (calls.length >= 4 && calls.every((c) => c.call === "P")) return "passed";
  let last: { level: number; strain: Strain; seat: Seat } | undefined;
  let doubled: 0 | 1 | 2 = 0;
  const firstBid: Record<string, Seat> = {};
  let seat = dealer;
  for (const c of calls) {
    const m = c.call.match(/^([1-7])([CDHSN])$/);
    if (m) {
      const strain = m[2] as Strain;
      last = { level: parseInt(m[1]), strain, seat };
      doubled = 0;
      const key = `${sideOf(seat)}${strain}`;
      if (!(key in firstBid)) firstBid[key] = seat;
    } else if (c.call === "X") doubled = 1;
    else if (c.call === "XX") doubled = 2;
    seat = nextSeat(seat);
  }
  if (!last) return undefined;
  const declarer = firstBid[`${sideOf(last.seat)}${last.strain}`];
  return { level: last.level, strain: last.strain, doubled, declarer };
}

/** "4S", "4SX", "3NXX" or "PASS" → parts. */
export function parseContractString(s: string): { level: number; strain: Strain; doubled: 0 | 1 | 2 } | "passed" | undefined {
  const t = s.trim().toUpperCase().replace(/\s+/g, "").replace("NT", "N").replace(/[♠]/g, "S").replace(/[♥]/g, "H").replace(/[♦]/g, "D").replace(/[♣]/g, "C");
  if (t === "PASS" || t === "P" || t === "AP" || t === "PASSED") return "passed";
  const m = t.match(/^([1-7])([CDHSN])(X{0,2}|\*{0,2})$/);
  if (!m) return undefined;
  const d = m[3].length as 0 | 1 | 2;
  return { level: parseInt(m[1]), strain: m[2] as Strain, doubled: d };
}

/** Duplicate score for declarer's side (positive if made). */
export function duplicateScore(level: number, strain: Strain, doubled: 0 | 1 | 2, tricks: number, vul: boolean): number {
  const need = level + 6;
  if (tricks >= need) {
    const per = strain === "C" || strain === "D" ? 20 : 30;
    const mult = doubled === 0 ? 1 : doubled === 1 ? 2 : 4;
    let trickScore = per * level * mult;
    if (strain === "N") trickScore += 10 * mult;
    let score = trickScore;
    score += trickScore >= 100 ? (vul ? 500 : 300) : 50;
    if (level === 6) score += vul ? 750 : 500;
    if (level === 7) score += vul ? 1500 : 1000;
    if (doubled === 1) score += 50;
    if (doubled === 2) score += 100;
    const over = tricks - need;
    if (doubled === 0) score += over * per;
    else score += over * (vul ? 200 : 100) * doubled;
    return score;
  }
  const down = need - tricks;
  if (doubled === 0) return -down * (vul ? 100 : 50);
  let pen = 0;
  for (let i = 1; i <= down; i++) {
    if (vul) pen += i === 1 ? 200 : 300;
    else pen += i === 1 ? 100 : i <= 3 ? 200 : 300;
  }
  return -pen * doubled;
}
