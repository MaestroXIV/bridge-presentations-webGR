/**
 * Other tables' results ("travellers"): normalisation, the frequency table
 * shown in the results panel, and its one-line summary.
 */
import { duplicateScore, parseContractString } from "./auction";
import { Scoring, Side, Traveller, Vul, isVul, sideOf, SUIT_SYMBOL } from "./types";

export interface NormalTraveller extends Traveller {
  level?: number;
  strain?: string;
  doubled?: 0 | 1 | 2;
  passed: boolean;
  /** tricks for declarer; undefined if unknown */
  tricks?: number;
}

/** Fills tricks from result, and scoreNS from contract/tricks/vulnerability, where missing. */
export function normalizeTraveller(t: Traveller, vul: Vul): NormalTraveller {
  const c = parseContractString(t.contract);
  if (c === "passed") return { ...t, passed: true, scoreNS: t.scoreNS ?? 0 };
  if (!c) return { ...t, passed: false };
  let tricks = t.tricks;
  if (tricks === undefined && t.result !== undefined) {
    const r = t.result.trim();
    if (r === "=" || r === "0" || r === "") tricks = c.level + 6;
    else if (/^[+-]\d+$/.test(r)) tricks = c.level + 6 + parseInt(r);
  }
  let scoreNS = t.scoreNS;
  if (scoreNS === undefined && tricks !== undefined && t.declarer) {
    const side = sideOf(t.declarer);
    const s = duplicateScore(c.level, c.strain, c.doubled, tricks, isVul(vul, side));
    scoreNS = side === "NS" ? s : -s;
  }
  return { ...t, level: c.level, strain: c.strain, doubled: c.doubled, passed: false, tricks, scoreNS };
}

/** N-S matchpoint % for each score among all scores (2 per beaten score, 1 per tie). */
export function matchpointsNS(scores: number[]): number[] {
  const n = scores.length;
  if (n < 2) return scores.map(() => 50);
  return scores.map((s) => {
    let mp = 0;
    for (const o of scores) {
      if (o === s) mp += 1;
      else if (s > o) mp += 2;
    }
    mp -= 1; // own score counted as a tie with itself
    return Math.round((mp / (2 * (n - 1))) * 1000) / 10;
  });
}

export function contractLabel(t: NormalTraveller): string {
  if (t.passed) return "Pass";
  if (!t.level) return t.contract;
  return `${t.level}${SUIT_SYMBOL[t.strain!]}${t.doubled === 1 ? "×" : t.doubled === 2 ? "××" : ""}`;
}

export function resultLabel(t: NormalTraveller): string {
  if (t.passed || t.tricks === undefined || !t.level) return "";
  const d = t.tricks - (t.level + 6);
  return d === 0 ? "=" : d > 0 ? `+${d}` : `${d}`;
}

export interface FrequencyRow {
  contract: string;
  /** suit letter of the strain, for colouring */
  strain?: string;
  declarer: string;
  result: string;
  /** score from the viewer's side */
  score: number | undefined;
  count: number;
  /** MP % or IMPs from the viewer's side, averaged over the row */
  value: number | undefined;
  mine: boolean;
}

export interface FrequencyTable {
  rows: FrequencyRow[];
  total: number;
  valueKind: "MP" | "IMP" | undefined;
  side: Side;
  summary: string;
}

/**
 * Groups identical results (contract, declarer, tricks) into rows sorted by
 * score, best for the viewer's side first.
 */
export function buildFrequencyTable(travellers: Traveller[], vul: Vul, scoring: Scoring | undefined, side: Side = "NS"): FrequencyTable {
  const norm = travellers.map((t) => normalizeTraveller(t, vul));
  const hasImps = norm.some((t) => t.impsNS !== undefined);
  const hasMp = norm.some((t) => t.mpNS !== undefined);
  const valueKind: "MP" | "IMP" | undefined = hasMp ? "MP" : hasImps ? "IMP" : scoring === "MP" ? "MP" : undefined;
  if (valueKind === "MP" && !hasMp && norm.every((t) => t.scoreNS !== undefined)) {
    const mps = matchpointsNS(norm.map((t) => t.scoreNS!));
    norm.forEach((t, i) => (t.mpNS = mps[i]));
  }
  const flip = side === "EW";
  const groups = new Map<string, { rows: NormalTraveller[] }>();
  for (const t of norm) {
    const key = `${contractLabel(t)}|${t.declarer ?? ""}|${t.tricks ?? "?"}|${t.scoreNS ?? "?"}`;
    if (!groups.has(key)) groups.set(key, { rows: [] });
    groups.get(key)!.rows.push(t);
  }
  const rows: FrequencyRow[] = [...groups.values()].map(({ rows: g }) => {
    const t = g[0];
    const vals = g.map((x) => (valueKind === "MP" ? x.mpNS : valueKind === "IMP" ? x.impsNS : undefined)).filter((v): v is number => v !== undefined);
    let value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
    if (value !== undefined && flip) value = valueKind === "MP" ? 100 - value : -value;
    if (value !== undefined) value = Math.round(value * 10) / 10;
    return {
      contract: contractLabel(t),
      strain: t.strain,
      declarer: t.passed ? "" : t.declarer ?? "",
      result: resultLabel(t),
      score: t.scoreNS === undefined ? undefined : flip ? -t.scoreNS : t.scoreNS,
      count: g.length,
      value,
      mine: g.some((x) => x.mine),
    };
  });
  rows.sort((a, b) => (b.score ?? -1e9) - (a.score ?? -1e9) || b.count - a.count);
  return { rows, total: norm.length, valueKind, side, summary: summaryLine(norm) };
}

/**
 * One line describing the field, e.g. "38 of 52 tables played 4♠, 9 made it".
 * Contracts are grouped by level and strain (doubled or not, either declarer).
 */
export function summaryLine(travellers: Traveller[] | NormalTraveller[], vul: Vul = "None"): string {
  const norm = travellers.map((t) => ("passed" in t ? (t as NormalTraveller) : normalizeTraveller(t, vul)));
  const total = norm.length;
  if (total === 0) return "";
  const fam = new Map<string, NormalTraveller[]>();
  for (const t of norm) {
    const k = t.passed ? "PASS" : t.level ? `${t.level}${t.strain}` : t.contract;
    if (!fam.has(k)) fam.set(k, []);
    fam.get(k)!.push(t);
  }
  const [key, list] = [...fam.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const n = list.length;
  const tables = (k: number) => `${k} ${k === 1 ? "table" : "tables"}`;
  const head = n === total ? (total === 1 ? "The only table" : `All ${tables(total)}`) : `${n} of ${tables(total)}`;
  if (key === "PASS") return `${head} passed the board out`;
  const label = list[0].level ? `${list[0].level}${SUIT_SYMBOL[list[0].strain!]}` : key;
  const known = list.filter((t) => t.tricks !== undefined && t.level);
  if (known.length === 0) return `${head} played ${label}`;
  const made = known.filter((t) => t.tricks! >= t.level! + 6).length;
  let tail: string;
  if (n === 1) tail = made ? "made" : "went down";
  else if (made === 0) tail = "none made it";
  else if (made === known.length) tail = known.length === 2 ? "both made it" : "all made it";
  else tail = `${made} made it`;
  return n === 1 ? `${head} played ${label} and ${tail}` : `${head} played ${label}, ${tail}`;
}
