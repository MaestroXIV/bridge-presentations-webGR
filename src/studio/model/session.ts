/**
 * Session JSON loader (format documented in docs/SESSION_FORMAT.md) and the
 * adapters that turn the app's other imports (BBO LIN / Myhands, PBN) into a
 * StudioSession.
 */
import type { LinBoard, LinImport } from "@/presentations/class/lin";
import { normalizeCall } from "./auction";
import { parseDotHand, sortCards } from "./play";
import { normalizeHidden } from "./visibility";
import { Call, Scoring, Seat, SEATS, Side, StudioBoard, StudioSession, Traveller, Vul } from "./types";

export const SESSION_FORMAT = "bridge-presenter-session";
export const SESSION_VERSION = 1;

export class SessionError extends Error {}

const VULS: Record<string, Vul> = { none: "None", love: "None", "-": "None", o: "None", ns: "NS", n: "NS", ew: "EW", e: "EW", all: "All", both: "All", b: "All" };
const SCORINGS: Scoring[] = ["MP", "IMP", "BAM", "Total"];

function seatOf(v: unknown): Seat | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const c = v.trim().toUpperCase()[0];
  return (SEATS as string[]).includes(c) ? (c as Seat) : undefined;
}

/** Accepts "AKQ2.T98.J7.Q543", "AKQ2 T98 J7 Q543" (app format, "-" = void) or "SAKQ2HT98DJ7CQ543" (LIN). */
export function normalizeHand(h: string): string {
  const s = h.trim().toUpperCase().replace(/10/g, "T");
  if (/^[SHDC]/.test(s) && /[HDC]/.test(s.slice(1))) {
    const out: Record<string, string> = { S: "", H: "", D: "", C: "" };
    let cur = "S";
    for (const ch of s) {
      if ("SHDC".includes(ch) && !"AKQJT98765432".includes(ch)) cur = ch;
      else if ("AKQJT98765432".includes(ch)) out[cur] += ch;
    }
    return ["S", "H", "D", "C"].map((x) => out[x]).join(".");
  }
  const parts = s.includes(".") ? s.split(".") : s.split(/\s+/);
  return parts
    .slice(0, 4)
    .map((p) => (p === "-" ? "" : p))
    .join(".");
}

function normalizeTravellers(raw: unknown, where: string, warnings: string[]): Traveller[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    warnings.push(`${where}: travellers is not an array, ignored`);
    return undefined;
  }
  const out: Traveller[] = [];
  raw.forEach((t, i) => {
    if (!t || typeof t !== "object" || typeof (t as Traveller).contract !== "string") {
      warnings.push(`${where}: traveller ${i + 1} has no contract, skipped`);
      return;
    }
    const r = t as Record<string, unknown>;
    const num = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : typeof r[k] === "string" && r[k] !== "" && !isNaN(Number(r[k])) ? Number(r[k]) : undefined);
    out.push({
      contract: r.contract as string,
      declarer: seatOf(r.declarer),
      tricks: num("tricks"),
      result: typeof r.result === "string" ? r.result : typeof r.result === "number" ? (r.result === 0 ? "=" : r.result > 0 ? `+${r.result}` : `${r.result}`) : undefined,
      lead: typeof r.lead === "string" ? r.lead : undefined,
      scoreNS: num("scoreNS"),
      mpNS: num("mpNS"),
      impsNS: num("impsNS"),
      ns: typeof r.ns === "string" ? r.ns : undefined,
      ew: typeof r.ew === "string" ? r.ew : undefined,
      mine: r.mine === true ? true : undefined,
    });
  });
  return out;
}

function normalizeBoard(raw: Record<string, unknown>, index: number, warnings: string[], session: { me?: string; scoring?: Scoring }): StudioBoard {
  const where = `board ${typeof raw.number === "number" ? raw.number : index + 1}`;
  const handsRaw = raw.hands as Record<string, string> | undefined;
  if (!handsRaw || typeof handsRaw !== "object") throw new SessionError(`${where}: "hands" is missing`);
  const hands = {} as Record<Seat, string>;
  for (const s of SEATS) {
    const h = handsRaw[s] ?? handsRaw[{ N: "north", E: "east", S: "south", W: "west" }[s]];
    if (typeof h !== "string") throw new SessionError(`${where}: hand ${s} is missing`);
    hands[s] = normalizeHand(h);
  }
  const all = SEATS.flatMap((s) => parseDotHand(hands[s]));
  for (const s of SEATS) {
    const n = parseDotHand(hands[s]).length;
    if (n !== 13) warnings.push(`${where}: ${s} has ${n} cards`);
  }
  if (new Set(all).size !== all.length) warnings.push(`${where}: a card appears twice in the deal`);

  const dealer = seatOf(raw.dealer);
  if (!dealer) throw new SessionError(`${where}: "dealer" must be N, E, S or W`);
  const vul = VULS[String(raw.vul ?? raw.vulnerability ?? "none").toLowerCase()] ?? "None";

  const auction: Call[] = [];
  for (const c of (Array.isArray(raw.auction) ? raw.auction : []) as unknown[]) {
    const callStr = typeof c === "string" ? c : (c as Call)?.call;
    const n = typeof callStr === "string" ? normalizeCall(callStr) : undefined;
    if (!n || n === "AP") {
      warnings.push(`${where}: unknown call ${JSON.stringify(c)} skipped`);
      continue;
    }
    const alert = typeof c === "object" && c !== null && "alert" in c ? String((c as Call).alert ?? "") : typeof callStr === "string" && callStr.endsWith("!") ? "" : undefined;
    auction.push(alert === undefined ? { call: n } : { call: n, alert });
  }
  const play = ((Array.isArray(raw.play) ? raw.play : []) as unknown[])
    .map((c) => (typeof c === "string" ? c.toUpperCase().replace("10", "T") : ""))
    .filter((c) => /^[SHDC][AKQJT98765432]$/.test(c));

  const playersRaw = raw.players as Record<string, string> | undefined;
  const players: Partial<Record<Seat, string>> = {};
  if (playersRaw) for (const s of SEATS) {
    const p = playersRaw[s] ?? playersRaw[{ N: "north", E: "east", S: "south", W: "west" }[s]];
    if (typeof p === "string" && p) players[s] = p;
  }
  const scoring = SCORINGS.includes(raw.scoring as Scoring) ? (raw.scoring as Scoring) : session.scoring;
  const number = typeof raw.number === "number" ? raw.number : undefined;
  let mySide = raw.mySide === "NS" || raw.mySide === "EW" ? (raw.mySide as Side) : undefined;
  if (!mySide && session.me) {
    const me = session.me.toLowerCase();
    const seat = SEATS.find((s) => players[s]?.toLowerCase() === me);
    if (seat) mySide = seat === "N" || seat === "S" ? "NS" : "EW";
  }
  const travellers = normalizeTravellers(raw.travellers, where, warnings);
  if (travellers && session.me && !travellers.some((t) => t.mine)) {
    const me = session.me.toLowerCase();
    for (const t of travellers) if (t.ns?.toLowerCase().includes(me) || t.ew?.toLowerCase().includes(me)) t.mine = true;
  }
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `b${number ?? index + 1}`,
    number,
    title: typeof raw.title === "string" ? raw.title : undefined,
    dealer,
    vul,
    hands,
    players: Object.keys(players).length ? players : undefined,
    auction,
    play,
    claim: typeof raw.claim === "number" ? raw.claim : undefined,
    ...(typeof raw.contract === "string" && seatOf(raw.declarer) ? { contract: raw.contract, declarer: seatOf(raw.declarer) } : {}),
    note: typeof raw.note === "string" ? raw.note : undefined,
    ...(Array.isArray(raw.hidden) && normalizeHidden(raw.hidden).length ? { hidden: normalizeHidden(raw.hidden) } : {}),
    ...(raw.showDummyAfterLead === true ? { showDummyAfterLead: true } : {}),
    ...(raw.auctionMode === "whole" || raw.auctionMode === "step" ? { auctionMode: raw.auctionMode as "whole" | "step" } : {}),
    scoring,
    travellers,
    mySide,
    ...(typeof raw.travellerUrl === "string" ? { travellerUrl: raw.travellerUrl } : {}),
    ...(typeof raw.tournament === "string" ? { tournament: raw.tournament } : {}),
    source: typeof raw.source === "string" ? raw.source : "session",
  };
}

/** Parses and validates a session JSON text. Throws SessionError on fatal problems. */
export function loadSession(text: string): { session: StudioSession; warnings: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SessionError(`not valid JSON: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== "object") throw new SessionError("expected a JSON object");
  const r = raw as Record<string, unknown>;
  if (r.format !== undefined && r.format !== SESSION_FORMAT) throw new SessionError(`unknown format "${String(r.format)}"`);
  if (typeof r.version === "number" && r.version > SESSION_VERSION) throw new SessionError(`session version ${r.version} is newer than this app understands (${SESSION_VERSION})`);
  if (!Array.isArray(r.boards) || r.boards.length === 0) throw new SessionError('"boards" must be a non-empty array');
  const warnings: string[] = [];
  const meta = {
    me: typeof r.me === "string" ? r.me : undefined,
    scoring: SCORINGS.includes(r.scoring as Scoring) ? (r.scoring as Scoring) : undefined,
  };
  const boards = (r.boards as Record<string, unknown>[]).map((b, i) => normalizeBoard(b, i, warnings, meta));
  const seen = new Set<string>();
  for (const b of boards) {
    while (seen.has(b.id)) b.id += "x";
    seen.add(b.id);
  }
  return {
    session: { title: typeof r.title === "string" ? r.title : "Session", date: typeof r.date === "string" ? r.date : undefined, scoring: meta.scoring, me: meta.me, boards },
    warnings,
  };
}

/** Serialises a session in the documented format (e.g. to save a PBN/LIN import for later). */
export function sessionToJson(s: StudioSession): string {
  return JSON.stringify({ format: SESSION_FORMAT, version: SESSION_VERSION, ...s }, null, 2);
}

// ---- adapters ------------------------------------------------------------

const POS_TO_SEAT: Record<string, Seat> = { north: "N", east: "E", south: "S", west: "W" };

/** Converts a board from the existing LIN / Myhands importer. */
export function boardFromLin(b: LinBoard, index: number): StudioBoard {
  const hands = {} as Record<Seat, string>;
  for (const [pos, seat] of Object.entries(POS_TO_SEAT)) hands[seat] = normalizeHand(b.cards[pos as keyof LinBoard["cards"]]);
  const auction: Call[] = [];
  const play: string[] = [];
  let claim: number | undefined;
  for (const a of b.script.actions) {
    if (a.t === "bid") auction.push(a.alert !== undefined ? { call: a.bid, alert: a.alert } : { call: a.bid });
    else if (a.t === "play") play.push(a.card);
    else if (a.t === "claim") claim = a.tricks;
  }
  const players: Partial<Record<Seat, string>> = {};
  for (const [pos, seat] of Object.entries(POS_TO_SEAT)) {
    const n = b.players[pos as keyof LinBoard["players"]];
    if (n) players[seat] = n;
  }
  const vulMap: Record<string, Vul> = { none: "None", ns: "NS", ew: "EW", both: "All" };
  return {
    id: `b${b.number ?? index + 1}`,
    number: b.number,
    title: b.name,
    dealer: POS_TO_SEAT[b.dealer] ?? "N",
    vul: vulMap[String(b.vulnerability).toLowerCase()] ?? "None",
    hands,
    players: Object.keys(players).length ? players : undefined,
    auction,
    play,
    claim,
    ...(b.tournament ? { tournament: b.tournament } : {}),
    ...(b.travellerUrl ? { travellerUrl: b.travellerUrl } : {}),
    note: b.result ? `At our table: ${b.result.contract}${b.result.score !== undefined ? `, ${b.result.score > 0 ? "+" : ""}${b.result.score}` : ""}${b.result.percent ? `, ${b.result.percent}` : ""}` : undefined,
    source: "BBO LIN",
  };
}

export function sessionFromLin(imp: LinImport, fallbackTitle = "BBO session"): StudioSession {
  const boards = imp.boards.map(boardFromLin);
  const seen = new Set<string>();
  for (const b of boards) {
    while (seen.has(b.id)) b.id += "x";
    seen.add(b.id);
  }
  const tours = [...new Set(boards.map((b) => b.tournament).filter(Boolean))] as string[];
  const title = tours.length === 1 ? tours[0].replace(/^#\d+\s+/, "") : imp.title ?? fallbackTitle;
  return { title, boards };
}

/** Sorted card list of a hand, for display. */
export function handCards(hand: string): string[] {
  return sortCards(parseDotHand(hand));
}
